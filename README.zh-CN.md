# AI 模拟面试 - Interview AI Pro

**[English](README.md)**

> 一款 AI 驱动的 Chrome 扩展，自动识别招聘网站的岗位描述，一键生成定制面试题，模拟真实面试场景并提供专业评分反馈。

## 项目背景

准备技术面试非常耗时 —— 你需要研究岗位要求、猜测可能被问到的问题、反复练习回答。这款扩展将整个流程自动化：打开一个岗位链接，几秒钟内获得定制的模拟面试，并获得可落地的改进建议。

## 功能特性

**智能 JD 分析** — 自动识别并提取当前页面的岗位描述，AI 分析核心技能、面试重点和难度等级。支持 **12 个**国内外主流招聘网站。

**定制面试题生成** — 根据 JD 分析结果自动生成 5 道面试题，覆盖技术深度、项目经验、场景设计、行为面试四大类型，难度自动匹配岗位级别。

**模拟面试对话** — 逐题提问，模拟真实面试节奏。AI 面试官根据你的回答进行智能追问，每道回答实时评分与反馈。

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

## 技术栈

- **Manifest V3** — Chrome 扩展最新标准
- **React 18** — Side Panel UI 框架
- **esbuild** — 快速构建工具
- **Chrome Side Panel API** — 侧边栏原生集成
- **OpenAI 兼容 API** — 支持 DeepSeek / 通义千问 / OpenAI 等多种大模型

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

## 配置

安装扩展后，打开侧边栏进入**设置**页面，配置以下信息：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| API URL | AI 服务的 API 地址 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| API Key | 你的 API 密钥 | `sk-xxxxxxxx` |
| 模型名称 | 使用的模型 | `qwen-turbo` / `deepseek-chat` / `gpt-4o` |

支持任何 OpenAI 兼容接口的 AI 服务，包括但不限于：

- 阿里云 DashScope（通义千问）
- DeepSeek
- OpenAI（GPT-4o、GPT-4）
- 智谱 GLM
- 本地部署的 Ollama 等

## 使用流程

1. 在招聘网站打开任意岗位页面
2. 点击页面上的 AI 悬浮按钮（紫色圆形图标）
3. 选择「提取并分析 JD」
4. 查看 AI 分析结果和生成的面试题
5. 点击「开始模拟面试」进入面试对话
6. 完成所有题目后查看面试评分报告

## 项目结构

```
interview-ai/
├── manifest.json          # 扩展配置清单
├── background.js          # Service Worker 后台脚本
├── content.js             # 内容脚本（注入招聘网站）
├── content.css            # 内容脚本样式（悬浮按钮）
├── sidepanel.jsx          # Side Panel 主界面（React）
├── sidepanel.html         # Side Panel HTML 入口
├── popup.html             # 弹窗页面
├── popup.js               # 弹窗逻辑
├── services/
│   ├── ai.js              # AI 服务封装（大模型 API 调用）
│   ├── jd-parser.js       # 招聘网站 JD 解析器
│   └── storage.js         # 本地存储管理
├── sidepanel/styles/
│   └── sidepanel.css      # Side Panel 样式
├── icons/                 # 扩展图标
├── scripts/
│   ├── build.js           # esbuild 构建脚本
│   └── generate-icons.js  # 图标生成脚本
├── store/                 # Chrome Web Store 发布材料
│   ├── screenshots/       # 商店截图和宣传图
│   ├── privacy-policy.html
│   └── chrome-web-store-listing.md
└── privacy-policy.html    # 隐私政策（GitHub Pages 托管）
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

构建产物输出到 `dist/` 目录，开发时加载该目录作为扩展即可。

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

所有数据（API Key、面试记录、设置项）均通过 `chrome.storage` **本地存储**在浏览器中。扩展不会收集、上传或与第三方服务器共享任何用户数据。AI API 请求直接从你的浏览器发送到你配置的 AI 服务商。

查看完整 [隐私政策](https://mamba-1024.github.io/interview-ai/privacy-policy.html)。

## 参与贡献

欢迎提交 Issue 或 Pull Request！

## 许可证

[MIT](LICENSE)
