// ============================================================
// Background Service Worker
// 消息路由、Side Panel 管理、AI 调用代理
// ============================================================

import './services/ai.js';
import './services/storage.js';

// ---- Side Panel 自动打开 ----
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('SidePanel config error:', err));

// ---- 消息处理 ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = messageHandlers[message.action];
  if (handler) {
    handler(message, sender)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // 异步响应
  }
});

const messageHandlers = {
  /**
   * Content Script 通知已检测到 JD
   */
  async jdDetected(message) {
    const { jdData } = message;
    await StorageManager.setCurrentJD(jdData, null);
    // 更新 badge 提示
    chrome.action.setBadgeText({ text: 'JD' });
    chrome.action.setBadgeBackgroundColor({ color: '#4F46E5' });
    return { success: true };
  },

  /**
   * 请求从当前页面提取 JD
   */
  async extractJD(message, sender) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab) return { success: false, error: '无法获取当前标签页' };

    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return typeof globalThis.extractJD === 'function'
            ? globalThis.extractJD()
            : { success: false, error: 'Content script 未加载' };
        },
      });
      return result?.result || { success: false, error: '提取失败' };
    } catch (err) {
      return { success: false, error: `无法在当前页面提取: ${err.message}` };
    }
  },

  /**
   * AI 分析 JD
   */
  async analyzeJD(message) {
    const { jdText } = message;
    await aiService.loadConfig();

    if (!aiService.isConfigured()) {
      return { success: false, error: '请先在设置中配置 API Key' };
    }

    const analysis = await aiService.analyzeJD(jdText);
    await StorageManager.setCurrentJD(message.jdData || { fullText: jdText }, analysis);
    await StorageManager.incrementUsage('jd');

    return { success: true, analysis };
  },

  /**
   * 生成面试题
   */
  async generateQuestions(message) {
    const { analysis, count } = message;
    await aiService.loadConfig();

    if (!aiService.isConfigured()) {
      return { success: false, error: '请先在设置中配置 API Key' };
    }

    const result = await aiService.generateQuestions(analysis, count || 5);
    await StorageManager.setQuestions(result.questions);

    return { success: true, questions: result.questions };
  },

  /**
   * 评估回答
   */
  async evaluateAnswer(message) {
    const { question, answer, analysis } = message;
    await aiService.loadConfig();

    if (!aiService.isConfigured()) {
      return { success: false, error: '请先在设置中配置 API Key' };
    }

    const evaluation = await aiService.evaluateAnswer(question, answer, analysis);

    // 追加到历史记录
    await StorageManager.appendHistory({
      question,
      answer,
      evaluation,
    });

    return { success: true, evaluation };
  },

  /**
   * 生成面试总结
   */
  async generateSummary(message) {
    const { analysis, history } = message;
    await aiService.loadConfig();

    if (!aiService.isConfigured()) {
      return { success: false, error: '请先在设置中配置 API Key' };
    }

    const summary = await aiService.generateSummary(analysis, history);
    return { success: true, summary };
  },

  /**
   * 获取/保存设置
   */
  async getConfig() {
    await aiService.loadConfig();
    return { success: true, config: aiService.config };
  },

  async saveConfig(message) {
    await aiService.saveConfig(message.config);
    return { success: true };
  },

  /**
   * 打开 Side Panel
   */
  async openSidePanel() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      await chrome.sidePanel.open({ tabId: tabs[0].id });
    }
    return { success: true };
  },

  /**
   * 在新标签页中打开面试界面
   */
  async openNewTab() {
    const url = chrome.runtime.getURL('sidepanel.html?mode=tab');
    await chrome.tabs.create({ url });
    return { success: true };
  },

  /**
   * 获取显示模式
   */
  async getDisplayMode() {
    const mode = await StorageManager.getDisplayMode();
    return { success: true, mode };
  },

  /**
   * 保存显示模式
   */
  async setDisplayMode(message) {
    await StorageManager.setDisplayMode(message.mode);
    return { success: true };
  },

  /**
   * 获取当前存储的面试数据
   */
  async getInterviewData() {
    const { jd, analysis } = await StorageManager.getCurrentJD();
    const questions = await StorageManager.getQuestions();
    const history = await StorageManager.getInterviewHistory();
    const usage = await StorageManager.getUsageStats();

    return { success: true, jd, analysis, questions, history, usage };
  },

  /**
   * 清除会话
   */
  async clearSession() {
    await StorageManager.clearSession();
    chrome.action.setBadgeText({ text: '' });
    return { success: true };
  },
};

// ---- 安装/更新事件 ----
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[InterviewAI] 插件已安装');
    // 初始化存储
    StorageManager.getUsageStats();
  }
});
