// ============================================================
// AI Service - 大模型 API 调用封装
// 支持 OpenAI 兼容接口（DeepSeek / OpenAI / 通义千问等）
// ============================================================

const DEFAULT_CONFIG = {
  apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  apiKey: '',
  model: 'glm-5',
  maxTokens: 2048,
  temperature: 0.7,
  // STT 引擎配置
  sttEngine: 'web',   // 'web' | 'deepgram' | 'iflytek'
  deepgramApiKey: '',
  iflytekAppId: '',
  iflytekApiKey: '',
  iflytekApiSecret: '',
};

/**
 * 规范化 API URL，确保以 /chat/completions 结尾
 * 兼容用户输入 /v1、/v1/、/compatible-mode/v1 等各种格式
 */
function normalizeApiUrl(url) {
  if (!url) return DEFAULT_CONFIG.apiUrl;
  url = url.trim().replace(/\/+$/, ''); // 去掉末尾斜杠
  if (url.endsWith('/chat/completions')) return url;
  // 如果以 /v1 结尾，补上 /chat/completions
  if (url.endsWith('/v1')) return url + '/chat/completions';
  // 如果以 /v1/xxx 结尾但不是 chat/completions，替换
  if (/\/v1\/.+$/.test(url) && !url.includes('chat/completions')) {
    return url.replace(/\/v1\/.+$/, '/v1/chat/completions');
  }
  // 兜底：直接追加
  return url + '/chat/completions';
}

class AIService {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  async loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['aiConfig'], (result) => {
        if (result.aiConfig) {
          this.config = { ...DEFAULT_CONFIG, ...result.aiConfig };
        }
        // 规范化 API URL：确保包含 /chat/completions
        this.config.apiUrl = normalizeApiUrl(this.config.apiUrl);
        resolve(this.config);
      });
    });
  }

  async saveConfig(config) {
    if (config.apiUrl) {
      config.apiUrl = normalizeApiUrl(config.apiUrl);
    }
    this.config = { ...this.config, ...config };
    return new Promise((resolve) => {
      chrome.storage.sync.set({ aiConfig: this.config }, resolve);
    });
  }

  isConfigured() {
    return !!this.config.apiKey;
  }

  /**
   * 通用 chat 调用
   */
  async chat(messages, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('请先在设置中配置 API Key');
    }

    const body = {
      model: options.model || this.config.model,
      messages,
      max_tokens: options.maxTokens || this.config.maxTokens,
      temperature: options.temperature ?? this.config.temperature,
    };

    if (options.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const resp = await fetch(this.config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`API 请求失败 (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // ================== 业务方法 ==================

  /**
   * 分析 JD，提取关键信息
   */
  async analyzeJD(jdText) {
    const content = await this.chat(
      [
        {
          role: 'system',
          content: `你是一个资深HR和面试教练。请分析以下岗位描述(JD)，提取关键信息。
请严格以 JSON 格式返回，包含以下字段：
{
  "jobTitle": "岗位名称",
  "department": "所属部门（如果能推断）",
  "level": "岗位级别（初级/中级/高级/专家）",
  "keySkills": ["核心技能1", "核心技能2", ...],
  "requirements": ["关键要求1", "关键要求2", ...],
  "difficulty": 1-5,
  "interviewFocus": ["面试重点1", "面试重点2", ...],
  "companyInfo": "公司信息（如果JD中包含）"
}`,
        },
        { role: 'user', content: jdText },
      ],
      { responseFormat: 'json', temperature: 0.3 }
    );

    return JSON.parse(content);
  }

  /**
   * 基于 JD 分析结果生成面试题目
   */
  async generateQuestions(jdAnalysis, count = 5) {
    const content = await this.chat(
      [
        {
          role: 'system',
          content: `你是一位经验丰富的面试官。请根据以下岗位分析结果，生成 ${count} 道高质量的面试题目。

题目要求：
1. 涵盖不同类型：技术深度、项目经验、场景设计、行为面试
2. 难度要匹配岗位级别
3. 每道题要有追问方向
4. 题目要具体、有针对性，不要太泛

请严格以 JSON 格式返回：
{
  "questions": [
    {
      "id": 1,
      "type": "technical|project|scenario|behavioral",
      "typeLabel": "类型中文名",
      "question": "面试题目",
      "followUp": "追问方向/追问问题",
      "keyPoints": ["期望回答要点1", "期望回答要点2", ...],
      "difficulty": 1-5
    }
  ]
}`,
        },
        {
          role: 'user',
          content: `岗位分析结果：\n${JSON.stringify(jdAnalysis, null, 2)}`,
        },
      ],
      { responseFormat: 'json', temperature: 0.8 }
    );

    return JSON.parse(content);
  }

  /**
   * 对面试者的回答进行评分和反馈
   */
  async evaluateAnswer(question, answer, jdAnalysis) {
    const content = await this.chat(
      [
        {
          role: 'system',
          content: `你是一位资深面试官和职业教练。请对面试者的回答进行专业评估。

评估维度（每项满分100分）：
- content: 内容深度 - 是否切中要害，展示专业能力
- logic: 逻辑清晰度 - 回答是否有条理，因果关系是否清楚
- expression: 表达流畅度 - 语言是否流畅、专业

请严格以 JSON 格式返回：
{
  "scores": {
    "content": 分数,
    "logic": 分数,
    "expression": 分数,
    "overall": 综合分数
  },
  "strengths": ["亮点1", "亮点2"],
  "improvements": ["改进建议1", "改进建议2"],
  "tips": "针对这个问题的面试技巧提示（2-3句话）",
  "idealAnswer": "理想回答的要点概述（3-5句话）"
}`,
        },
        {
          role: 'user',
          content: `岗位：${jdAnalysis.jobTitle}
面试题目：${question}

面试者的回答：
${answer}`,
        },
      ],
      { responseFormat: 'json', temperature: 0.5 }
    );

    return JSON.parse(content);
  }

  /**
   * 生成面试总结报告
   */
  async generateSummary(jdAnalysis, history) {
    const content = await this.chat(
      [
        {
          role: 'system',
          content: `你是一位资深面试官。请根据整场模拟面试的表现，生成一份面试总结报告。

请严格以 JSON 格式返回：
{
  "overallComment": "总体评价（3-5句话）",
  "dimensionScores": {
    "technicalDepth": 技术深度分数,
    "projectExperience": 项目经验分数,
    "communication": 沟通表达分数,
    "logicalThinking": 逻辑思维分数
  },
  "topStrengths": ["最大优势1", "最大优势2", "最大优势3"],
  "keyImprovements": ["关键改进1", "关键改进2", "关键改进3"],
  "interviewReadiness": 1-100 面试准备度评分,
  "encouragement": "鼓励性结语"
}`,
        },
        {
          role: 'user',
          content: `岗位：${JSON.stringify(jdAnalysis, null, 2)}

面试记录：
${history
  .map(
    (h, i) => `
Q${i + 1}: ${h.question}
回答: ${h.answer}
评分: ${h.evaluation?.scores?.overall || 'N/A'}/100
反馈: ${h.evaluation?.strengths?.join('; ') || ''}
`
  )
  .join('\n')}`,
        },
      ],
      { responseFormat: 'json', temperature: 0.4 }
    );

    return JSON.parse(content);
  }
}

// 单例
const aiService = new AIService();

// ES module 导出
export { AIService, aiService };

// 兼容 background / sidepanel / popup 不同环境
if (typeof globalThis !== 'undefined') {
  globalThis.aiService = aiService;
}
if (typeof self !== 'undefined') {
  self.aiService = aiService;
}
