# AI 模拟面试 - Interview AI Pro

**[English](README.md)**

> 一款 AI 驱动的 Chrome 扩展，自动识别招聘网站的岗位描述，一键生成定制面试题，支持语音模拟面试并提供专业评分反馈。

## 项目背景

准备技术面试非常耗时 —— 你需要研究岗位要求、猜测可能被问到的问题、反复练习回答。这款扩展将整个流程自动化：打开岗位页面，几秒钟内获得定制模拟面试，开口作答并实时转写，最后获得可落地的改进建议。

## 功能特性

**智能 JD 分析** — 自动识别并提取当前页面的岗位描述，AI 分析核心技能、面试重点和难度等级。支持 **12 个**国内外主流招聘网站。

**定制面试题生成** — 根据 JD 分析结果自动生成 5 道面试题，覆盖技术深度、项目经验、场景设计、行为面试四大类型，难度自动匹配岗位级别。

**语音模拟面试** — AI 面试官朗读题目（TTS），实时听取并转写你的口头回答（STT），同时支持手动文字输入作为备选。

**模拟面试对话** — 逐题提问，模拟真实面试节奏。AI 对每道回答进行评分，并支持智能追问。

**面试评分报告** — 综合评分 + 多维度分析（内容深度、逻辑清晰度、表达流畅度），逐题详细点评与改进建议，面试官总结与面试准备度评估。

**双模式展示** — **侧边栏模式**在浏览器侧边栏中使用，不影响当前页面；**新标签页模式**独立标签页全屏展示，适合大屏使用。

## 支持的招聘网站

| 国内 | 国际 |
|------|------|
| BOSS 直聘 | Indeed |
| 拉勾网 | Glassdoor |
| 智联招聘 | Wellfound (AngelList) |
| 前程无忧 (51job) | Dice |
| 猎聘 | Monster |
| LinkedIn | |
| 牛客网 | |

## 语音识别（STT）

扩展支持 **3 种 STT 引擎**，在 **设置 → 语音识别** 中配置：

| 引擎 | 模式 | 所需凭证 | 适用场景 |
|------|------|----------|----------|
| **Web Speech API** | 实时流式 | 无需配置（浏览器内置） | 快速上手、延迟最低 |
| **Deepgram Nova-2** | WebSocket 实时流式 | [Deepgram API Key](https://console.deepgram.com/) | 准确率较高、中英文混合 |
| **科大讯飞** | WebSocket + PCM 流式 | [AppID + APIKey + APISecret](https://console.xfyun.cn/) | 国内网络稳定、长段作答 |

**面试间语音流程：**

1. AI 通过浏览器 TTS 朗读题目
2. 自动开始语音识别，边说边显示转写文字
3. 点击「结束作答」提交当前回答并进入评分（流式引擎会等待最终结果）
4. 可随时使用下方文字输入框手动作答

> **说明：** Deepgram 与科大讯飞需要麦克风权限及 `AudioWorklet` 支持（Chrome 66+）。讯飞采用短连接模式，长段回答时会自动重连以保持连续识别。

## 技术栈

| 层级 | 技术 |
|------|------|
| 扩展框架 | Manifest V3、Chrome Side Panel API |
| 前端 UI | React 18，侧边栏 + 新标签页双模式 |
| 构建工具 | esbuild |
| 大模型 | OpenAI 兼容 API（通义千问、DeepSeek、OpenAI 等） |
| 语音识别 | Web Speech API / Deepgram WebSocket / 讯飞 WebSocket |
| 音频处理 | AudioWorklet（16 kHz PCM 采集）、Web Speech Synthesis（TTS） |
| 数据存储 | `chrome.storage`（本地 + 同步） |

## 架构概览

```
招聘网站页面 (content.js)
        │ 提取 JD
        ▼
Background Service Worker (background.js)
        │ 消息通信 / 存储
        ▼
Side Panel (sidepanel.jsx)
        ├── JD 分析与出题 (services/ai.js)
        └── 面试间 (components/InterviewRoom.jsx)
                ├── TTS：朗读题目
                ├── STT：services/speech.js
                └── 评分：大模型 API
```

## 安装使用

### 从 Chrome Web Store 安装

> 即将上线，敬请期待。

### 开发者模式安装

1. 克隆仓库并安装依赖：

```bash
git clone https://github.com/mamba-1024/interview-ai.git
cd interview-ai
npm install
```

2. 构建扩展：

```bash
npm run build
```

3. 在 Chrome 中加载：
   - 打开 `chrome://extensions/`
   - 开启右上角「开发者模式」
   - 点击「加载已解压的扩展程序」
   - 选择 `dist/` 目录

## 配置说明

打开侧边栏，进入 **设置** 页面。

### 大模型（必填）

| 配置项 | 说明 | 示例 |
|--------|------|------|
| API URL | AI 服务的 API 地址 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| API Key | 你的 API 密钥 | `sk-xxxxxxxx` |
| 模型名称 | 使用的模型 | `qwen-turbo` / `deepseek-chat` / `gpt-4o` |

支持任何 OpenAI 兼容接口，包括但不限于：

- 阿里云 DashScope（通义千问）
- DeepSeek
- OpenAI（GPT-4o、GPT-4）
- 智谱 GLM
- 本地部署的 Ollama

### 语音识别（可选）

| 引擎 | 配置项 |
|------|--------|
| Web Speech API | 无需额外配置（默认） |
| Deepgram | API Key |
| 科大讯飞 | AppID、APIKey、APISecret |

## 使用流程

1. 在招聘网站打开任意岗位页面
2. 点击页面上的 AI 悬浮按钮（紫色圆形图标）
3. 选择「提取并分析 JD」
4. 查看 AI 分析结果和生成的面试题
5. 点击「开始模拟面试」进入面试间
6. 允许麦克风权限，逐题语音或文字作答
7. 每题完成后点击「结束作答」；全部完成后查看评分报告

## 项目结构

```
interview-ai/
├── manifest.json              # 扩展配置清单
├── background.js              # Service Worker（消息、存储、API 代理）
├── content.js                 # 内容脚本（JD 提取、悬浮按钮）
├── content.css
├── sidepanel.jsx              # Side Panel 主界面（React）
├── sidepanel.html
├── popup.html / popup.js
├── components/
│   ├── InterviewRoom.jsx      # 面试间（语音、评分、摄像头）
│   └── InterviewAvatar.jsx    # 面试官头像动画
├── services/
│   ├── ai.js                  # 大模型 API 封装
│   ├── speech.js              # STT（3 种引擎）+ TTS
│   ├── jd-parser.js           # 招聘网站 JD 解析器
│   ├── iflytek-pcm-processor.js  # AudioWorklet（16 kHz PCM 采集）
│   └── storage.js             # Chrome 存储封装
├── sidepanel/styles/
├── scripts/
│   ├── build.js               # esbuild 构建 + 静态资源复制
│   └── generate-icons.js
├── store/                     # Chrome Web Store 发布材料
└── dist/                      # 构建产物（加载此目录到 Chrome）
```

## 开发

```bash
# 开发模式（文件变更自动重新构建）
npm run dev

# 生产构建
npm run build

# 重新生成图标
npm run icons
```

构建产物输出到 `dist/` 目录，每次构建后请在 `chrome://extensions/` 中刷新扩展。

## 预览

<p align="center">
  <img src="store/screenshots/screenshot1-floating-button.png" alt="悬浮按钮" width="48%" />
  <img src="store/screenshots/screenshot2-sidepanel-analysis.png" alt="JD 分析" width="48%" />
</p>
<p align="center">
  <img src="store/screenshots/screenshot3-questions-list.png" alt="面试题列表" width="48%" />
  <img src="store/screenshots/screenshot4-interview-chat.png" alt="面试对话" width="48%" />
</p>
<p align="center">
  <img src="store/screenshots/screenshot5-interview-report.png" alt="面试报告" width="48%" />
</p>

## 隐私说明

- **本地存储：** API Key、面试记录、设置项均保存在浏览器 `chrome.storage` 中。
- **大模型请求：** 直接从扩展发往你配置的 AI 服务商。
- **语音识别：** 使用 Deepgram 或科大讯飞时，音频会流式发送至对应 API；Web Speech API 的处理方式取决于浏览器厂商。
- 扩展不运营自有后端，不会在中心服务器收集用户数据。

查看完整 [隐私政策](https://mamba-1024.github.io/interview-ai/privacy-policy.html)。

## 参与贡献

欢迎提交 Issue 或 Pull Request！

## 许可证

[MIT](LICENSE)
