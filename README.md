# AI Mock Interview - Interview AI Pro

**[中文文档](README.zh-CN.md)**

> An AI-powered Chrome extension that automatically parses job descriptions from recruitment websites, generates tailored interview questions, simulates real interview sessions with voice interaction, and provides professional scoring feedback.

## Why

Preparing for technical interviews is time-consuming — you need to research the role, guess what questions might come up, and practice answering them. This extension automates the entire process: open a job listing, get a customized mock interview in seconds, practice answering out loud, and receive actionable feedback to improve your performance.

## Features

**Smart JD Analysis** — Automatically extracts job descriptions from the current page and uses AI to identify core skills, interview focus areas, and difficulty level. Supports **12** major recruitment websites worldwide.

**Custom Question Generation** — Generates 5 interview questions tailored to the role, covering technical depth, project experience, scenario design, and behavioral interview categories. Difficulty adapts to the seniority level.

**Voice Mock Interview** — The AI interviewer reads questions aloud (TTS), listens to your spoken answers (STT), and displays real-time transcription. You can also type answers manually as a fallback.

**Mock Interview Dialogue** — Questions are presented one by one to simulate a real interview pace. The AI scores each response and supports intelligent follow-up questions.

**Interview Score Report** — Provides an overall score plus multi-dimensional analysis (content depth, logical clarity, expression fluency). Includes per-question feedback, improvement suggestions, and an interviewer summary with readiness assessment.

**Dual Display Modes** — Use the **Side Panel** for a compact view alongside the job page, or open in a **New Tab** for a full-page experience on larger screens.

## Supported Job Sites

| China | International |
|-------|---------------|
| BOSS Zhipin | Indeed |
| Lagou | Glassdoor |
| Zhilian Zhaopin | Wellfound (AngelList) |
| 51job | Dice |
| Liepin | Monster |
| LinkedIn | |
| Nowcoder | |

## Speech Recognition (STT)

The extension supports **3 STT engines**. Configure in **Settings → Speech Recognition**:

| Engine | Mode | Credentials | Best For |
|--------|------|-------------|----------|
| **Web Speech API** | Real-time streaming | None (browser built-in) | Quick start, lowest latency |
| **Deepgram Nova-2** | Real-time WebSocket | [Deepgram API Key](https://console.deepgram.com/) | Higher accuracy, multilingual |
| **iFlytek** | Real-time WebSocket + PCM | [AppID + APIKey + APISecret](https://console.xfyun.cn/) | Stable in China, long-form answers |

**Interview flow:**

1. AI reads the question via browser TTS
2. STT starts automatically — speak your answer; text appears in real time
3. Click **End Answer** to submit for scoring (async engines wait for final results)
4. Manual text input is always available as a fallback

> **Note:** Deepgram and iFlytek require microphone permission and `AudioWorklet` support (Chrome 66+). iFlytek uses short-lived WebSocket sessions with automatic reconnect for long answers.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Extension | Manifest V3, Chrome Side Panel API |
| UI | React 18, Side Panel + New Tab modes |
| Build | esbuild |
| LLM | OpenAI-compatible API (DashScope, DeepSeek, OpenAI, etc.) |
| STT | Web Speech API / Deepgram WebSocket / iFlytek WebSocket |
| Audio | AudioWorklet (16 kHz PCM), Web Speech Synthesis (TTS) |
| Storage | `chrome.storage` (local + sync) |

## Architecture

```
Recruitment Site (content.js)
        │ extract JD
        ▼
Background Service Worker (background.js)
        │ messaging / storage
        ▼
Side Panel (sidepanel.jsx)
        ├── JD analysis & question generation (services/ai.js)
        └── Interview Room (components/InterviewRoom.jsx)
                ├── TTS: read questions aloud
                ├── STT: services/speech.js
                └── Scoring: LLM API
```

## Installation

### From Chrome Web Store

> Coming soon.

### Developer Mode (Local Build)

1. Clone and install dependencies:

```bash
git clone https://github.com/mamba-1024/interview-ai.git
cd interview-ai
npm install
```

2. Build the extension:

```bash
npm run build
```

3. Load in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode** (top-right toggle)
   - Click **Load unpacked**
   - Select the `dist/` folder

## Configuration

Open the side panel and go to **Settings**.

### LLM (required)

| Field | Description | Example |
|-------|-------------|---------|
| API URL | Your AI provider's endpoint | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| API Key | Your API key | `sk-xxxxxxxx` |
| Model | Model name | `qwen-turbo` / `deepseek-chat` / `gpt-4o` |

Supported providers (OpenAI-compatible):

- Alibaba Cloud DashScope (Qwen)
- DeepSeek
- OpenAI (GPT-4o, GPT-4)
- Zhipu GLM
- Self-hosted Ollama

### Speech Recognition (optional)

| Engine | Fields |
|--------|--------|
| Web Speech API | No extra config (default) |
| Deepgram | API Key |
| iFlytek | AppID, APIKey, APISecret |

## Quick Start

1. Open any job listing on a supported recruitment website
2. Click the purple AI floating button on the page
3. Select **"Extract & Analyze JD"**
4. Review the AI analysis results and generated questions
5. Click **"Start Mock Interview"** to enter the interview room
6. Allow microphone access when prompted; answer each question by voice or text
7. Click **"End Answer"** after each response; view your score report when finished

## Project Structure

```
interview-ai/
├── manifest.json              # Extension manifest
├── background.js              # Service Worker (messaging, storage, API proxy)
├── content.js                 # Content script (JD extraction, floating button)
├── content.css
├── sidepanel.jsx              # Side Panel main UI (React)
├── sidepanel.html
├── popup.html / popup.js
├── components/
│   ├── InterviewRoom.jsx      # Mock interview UI (voice, scoring, camera)
│   └── InterviewAvatar.jsx    # Interviewer avatar animation
├── services/
│   ├── ai.js                  # LLM API wrapper
│   ├── speech.js              # STT (3 engines) + TTS
│   ├── jd-parser.js           # Job site JD parsers
│   ├── iflytek-pcm-processor.js  # AudioWorklet (16 kHz PCM capture)
│   └── storage.js             # Chrome storage wrapper
├── sidepanel/styles/
├── scripts/
│   ├── build.js               # esbuild + static asset copy
│   └── generate-icons.js
├── store/                     # Chrome Web Store assets
└── dist/                      # Build output (load this in Chrome)
```

## Development

```bash
# Development mode (auto-rebuild on file changes)
npm run dev

# Production build
npm run build

# Regenerate icons
npm run icons
```

Build output is written to the `dist/` directory. Reload the extension in `chrome://extensions/` after each build.

## Screenshots

<p align="center">
  <img src="store/screenshots/screenshot1-floating-button.png" alt="Floating Button" width="48%" />
  <img src="store/screenshots/screenshot2-sidepanel-analysis.png" alt="JD Analysis" width="48%" />
</p>
<p align="center">
  <img src="store/screenshots/screenshot3-questions-list.png" alt="Questions List" width="48%" />
  <img src="store/screenshots/screenshot4-interview-chat.png" alt="Interview Chat" width="48%" />
</p>
<p align="center">
  <img src="store/screenshots/screenshot5-interview-report.png" alt="Interview Report" width="48%" />
</p>

## Privacy

- **Local storage:** API keys, interview history, and settings are stored in your browser via `chrome.storage`.
- **LLM requests:** Sent directly from the extension to your configured AI provider.
- **STT requests:** When using Deepgram or iFlytek, audio is streamed to their respective APIs. Web Speech API processing depends on your browser vendor.
- The extension does not operate its own backend or collect user data on a central server.

See the full [Privacy Policy](https://mamba-1024.github.io/interview-ai/privacy-policy.html).

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

## License

[MIT](LICENSE)
