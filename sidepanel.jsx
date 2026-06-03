// ============================================================
// Side Panel - React 模拟面试主界面（完整功能，替代 Popup）
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import InterviewRoom from './components/InterviewRoom.jsx';

// ---- SVG Icons ----
const Icons = {
  Bot: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>,
  User: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Send: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>,
  Zap: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Award: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>,
  ChevronRight: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>,
  ChevronDown: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>,
  ChevronUp: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6"/></svg>,
  Check: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  Alert: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>,
  Lightbulb: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>,
  Target: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  Message: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  RotateCcw: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>,
  FileText: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>,
  Settings: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
  Sparkles: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>,
  TrendingUp: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  Search: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  Clipboard: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>,
  ArrowLeft: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>,
};

// ---- Helpers ----
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const scoreColor = (s) => (s >= 75 ? 'var(--success)' : s >= 60 ? 'var(--accent)' : 'var(--danger)');
const scoreClass = (s) => (s >= 75 ? 'sp-score-high' : s >= 60 ? 'sp-score-mid' : 'sp-score-low');

function sendMsg(action, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, ...data }, (resp) => {
      if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
      else resolve(resp);
    });
  });
}

// AI Service adapter for InterviewRoom - wraps sendMsg to match aiService interface
const aiServiceAdapter = {
  async evaluateAnswer(question, answer, jdAnalysis) {
    const resp = await sendMsg('evaluateAnswer', { question, answer, analysis: jdAnalysis });
    if (resp?.success && resp.evaluation) return resp.evaluation;
    throw new Error(resp?.error || 'Evaluation failed');
  },
};

// ---- Score Bar ----
function ScoreBar({ label, score, color, barDelay = 0 }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(score), barDelay);
    return () => clearTimeout(t);
  }, [score, barDelay]);
  return (
    <div className="sp-score-row">
      <div className="sp-score-label">
        <span>{label}</span>
        <strong style={{ color }}>{score}</strong>
      </div>
      <div className="sp-score-bar-bg">
        <div className="sp-score-bar" style={{ width: `${w}%`, background: color }} />
      </div>
    </div>
  );
}

// ============================================================
// Main App
// ============================================================
function App() {
  // 检测是否为新标签页模式
  const isTabMode = new URLSearchParams(window.location.search).get('mode') === 'tab';

  // screen: setup | home | interview | summary
  const [screen, setScreen] = useState('home');
  const [config, setConfig] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  // Setup form
  const [apiUrl, setApiUrl] = useState('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('glm-5');

  // Home state
  const [jd, setJd] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [showManualJD, setShowManualJD] = useState(false);
  const [manualText, setManualText] = useState('');
  const [jdStatus, setJdStatus] = useState('detecting'); // detecting | found | none
  const [usage, setUsage] = useState({ todaySessions: 0, totalSessions: 0 });

  // Interview state
  const [qIdx, setQIdx] = useState(0);
  const [phase, setPhase] = useState('idle');
  const [displayedQ, setDisplayedQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showFU, setShowFU] = useState(false);
  const [displayedFU, setDisplayedFU] = useState('');
  const [fuAnswer, setFuAnswer] = useState('');
  const [history, setHistory] = useState([]);
  const [totalTime, setTotalTime] = useState(0);
  const [timerOn, setTimerOn] = useState(false);
  const [expandTip, setExpandTip] = useState(false);
  const [summary, setSummary] = useState(null);
  const [showInterviewRoom, setShowInterviewRoom] = useState(false);

  const chatEndRef = useRef(null);
  const timerRef = useRef(null);

  // Scroll to bottom on new content
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [phase, showFeedback, showFU]);

  // Timer
  useEffect(() => {
    if (timerOn) {
      timerRef.current = setInterval(() => setTotalTime((t) => t + 1), 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [timerOn]);

  // Init: load config + data
  useEffect(() => {
    init();
  }, []);

  async function init() {
    // Load config
    const cfgResp = await sendMsg('getConfig');
    const cfg = cfgResp?.config || {};
    setConfig(cfg);
    if (cfg.apiUrl) setApiUrl(cfg.apiUrl);
    if (cfg.model) setModel(cfg.model);

    if (!cfg.apiKey) {
      setScreen('setup');
      return;
    }

    // Load existing data
    const dataResp = await sendMsg('getInterviewData');
    if (dataResp?.success) {
      if (dataResp.jd) setJd(dataResp.jd);
      if (dataResp.analysis) setAnalysis(dataResp.analysis);
      if (dataResp.questions) setQuestions(dataResp.questions);
      if (dataResp.history?.length > 0) setHistory(dataResp.history);
      if (dataResp.usage) setUsage(dataResp.usage);
      if (dataResp.analysis && dataResp.questions?.length > 0) {
        setJdStatus('found');
      }
    }

    // 每次打开都尝试检测当前页面 JD（非 tab 模式）
    // 如果检测到新的 JD（不同页面），自动刷新；否则保留缓存数据
    if (!isTabMode) {
      tryDetectJD(dataResp?.jd);
    } else if (dataResp?.jd) {
      setJdStatus('found');
    }
  }

  async function tryDetectJD(storedJd) {
    setJdStatus('detecting');
    const resp = await sendMsg('extractJD');
    if (resp?.success && resp.fullText?.length > 30) {
      // 检测是否为新的 JD（与缓存不同）
      const isSameJD = storedJd && resp.source === storedJd.source && resp.fullText === storedJd.fullText;
      if (isSameJD) {
        // 同一个 JD，不重新加载
        setJdStatus('found');
        return;
      }
      // 新的 JD → 更新并清除旧的分析/题目/历史
      setJd(resp);
      setJdStatus('found');
      if (storedJd) {
        setAnalysis(null);
        setQuestions([]);
        setHistory([]);
        setSummary(null);
        sendMsg('clearSession');
      }
    } else {
      // 未检测到 JD，如果有缓存数据则保留
      if (!storedJd) {
        setJdStatus('none');
      } else {
        setJdStatus('found');
      }
    }
  }

  // ---- Setup (API Config) ----
  async function handleSaveConfig() {
    if (!apiKey.trim()) return;
    const newConfig = {
      apiUrl: apiUrl.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      apiKey: apiKey.trim(),
      model: model.trim() || 'glm-5',
    };
    await sendMsg('saveConfig', { config: newConfig });
    setConfig(newConfig);
    setScreen('home');
  }

  // ---- JD Operations ----
  async function handleLoadJob() {
    setLoading(true);
    setLoadingText('正在加载当前岗位...');
    const resp = await sendMsg('extractJD');
    setLoading(false);

    if (resp?.success && resp.fullText?.length > 20) {
      setJd(resp);
      setJdStatus('found');
      // 清空旧的分析结果和题目，让用户重新分析
      setAnalysis(null);
      setQuestions([]);
    } else {
      setJdStatus('none');
    }
  }

  async function handleExtractAndAnalyze() {
    setLoading(true);
    setLoadingText('正在提取岗位信息...');

    // Extract JD
    let jdData = jd;
    if (!jdData) {
      const extResp = await sendMsg('extractJD');
      if (!extResp?.success) {
        setLoading(false);
        return;
      }
      jdData = extResp;
      setJd(jdData);
    }

    setLoadingText('正在分析岗位要求...');
    const aResp = await sendMsg('analyzeJD', { jdText: jdData.fullText, jdData });
    if (!aResp?.success) {
      setLoading(false);
      return;
    }
    setAnalysis(aResp.analysis);

    setLoadingText('正在生成面试题...');
    const qResp = await sendMsg('generateQuestions', { analysis: aResp.analysis, count: 5 });
    setLoading(false);

    if (qResp?.success) {
      setQuestions(qResp.questions);
      setJdStatus('found');
    }
  }

  async function handleManualJD() {
    if (!manualText.trim()) return;
    const jdData = { fullText: manualText.trim(), title: '手动输入' };
    setJd(jdData);
    setShowManualJD(false);
    setManualText('');

    setLoading(true);
    setLoadingText('正在分析岗位要求...');
    const aResp = await sendMsg('analyzeJD', { jdText: jdData.fullText, jdData });
    if (!aResp?.success) {
      setLoading(false);
      return;
    }
    setAnalysis(aResp.analysis);

    setLoadingText('正在生成面试题...');
    const qResp = await sendMsg('generateQuestions', { analysis: aResp.analysis, count: 5 });
    setLoading(false);

    if (qResp?.success) {
      setQuestions(qResp.questions);
      setJdStatus('found');
    }
  }

  // ---- Interview ----
  const typeText = useCallback(async (text, setter, speed = 30) => {
    setter('');
    for (let i = 0; i < text.length; i++) {
      await delay(speed);
      setter(text.slice(0, i + 1));
    }
  }, []);

  async function startInterview() {
    if (questions.length === 0) return;
    setScreen('interview');
    setQIdx(0);
    setHistory([]);
    setTotalTime(0);
    setTimerOn(true);
    await sendMsg('clearSession');
    setPhase('typing');
    await typeText(questions[0].question, setDisplayedQ);
    setPhase('answering');
  }

  async function handleSubmit() {
    if (!answer.trim()) return;
    setPhase('scoring');
    const resp = await sendMsg('evaluateAnswer', {
      question: questions[qIdx].question,
      answer: answer.trim(),
      analysis,
    });
    if (resp?.success) {
      setFeedback(resp.evaluation);
      setHistory((h) => [...h, {
        question: questions[qIdx].question,
        answer: answer.trim(),
        type: questions[qIdx].type,
        typeLabel: questions[qIdx].typeLabel,
        evaluation: resp.evaluation,
      }]);
      setShowFeedback(true);
      setPhase('feedback');
    } else {
      setPhase('answering');
    }
  }

  async function handleFollowUp() {
    const q = questions[qIdx];
    if (!q.followUp || !feedback?.scores?.overall || feedback.scores.overall < 50) {
      handleNextQ();
      return;
    }
    setShowFeedback(false);
    setShowFU(true);
    setPhase('fu_typing');
    await delay(400);
    await typeText(q.followUp, setDisplayedFU, 25);
    setPhase('fu_answering');
  }

  async function handleSubmitFU() {
    if (!fuAnswer.trim()) return;
    setPhase('fu_done');
    const resp = await sendMsg('evaluateAnswer', {
      question: `${questions[qIdx].question}\n追问: ${questions[qIdx].followUp}`,
      answer: fuAnswer.trim(),
      analysis,
    });
    if (resp?.success && resp.evaluation) {
      setHistory((h) => [...h, {
        question: `追问: ${questions[qIdx].followUp}`,
        answer: fuAnswer.trim(),
        type: 'followup',
        typeLabel: '追问',
        evaluation: resp.evaluation,
      }]);
    }
    await delay(600);
    handleNextQ();
  }

  async function handleNextQ() {
    setShowFeedback(false);
    setShowFU(false);
    setFuAnswer('');
    setDisplayedFU('');
    setExpandTip(false);

    if (qIdx < questions.length - 1) {
      const next = qIdx + 1;
      setQIdx(next);
      setAnswer('');
      setDisplayedQ('');
      setFeedback(null);
      setPhase('typing');
      await typeText(questions[next].question, setDisplayedQ);
      setPhase('answering');
    } else {
      setTimerOn(false);
      setPhase('summarizing');
      const resp = await sendMsg('generateSummary', { analysis, history: [...history] });
      if (resp?.success) setSummary(resp.summary);
      setScreen('summary');
    }
  }

  async function handleRestart() {
    setScreen('home');
    setQIdx(0);
    setPhase('idle');
    setDisplayedQ('');
    setAnswer('');
    setFeedback(null);
    setShowFeedback(false);
    setShowFU(false);
    setDisplayedFU('');
    setFuAnswer('');
    setHistory([]);
    setTotalTime(0);
    setTimerOn(false);
    setExpandTip(false);
    setSummary(null);
    await sendMsg('clearSession');
    // Reload data
    const dataResp = await sendMsg('getInterviewData');
    if (dataResp?.success) {
      if (dataResp.usage) setUsage(dataResp.usage);
    }
  }

  // ---- RENDER ----
  const q = questions[qIdx];

  // Header
  const renderHeader = () => (
    <div className="sp-header">
      <div className="sp-header-left">
        {screen !== 'setup' && showSettings && (
          <button className="sp-icon-btn" onClick={() => setShowSettings(false)} title="返回">
            <Icons.ArrowLeft size={16} />
          </button>
        )}
        <div className="sp-logo"><Icons.Bot size={18} /></div>
        <div>
          <div className="sp-title">AI 模拟面试</div>
          <div className="sp-subtitle">InterviewAI Pro</div>
        </div>
      </div>
      <div className="sp-header-right">
        {screen === 'interview' && (
          <div className="sp-badge">
            <div className="sp-dot" />
            <span className="sp-timer">{fmtTime(totalTime)}</span>
          </div>
        )}
        {screen !== 'setup' && !showSettings && (
          <button className="sp-icon-btn" onClick={() => setShowSettings(true)} title="设置">
            <Icons.Settings size={16} />
          </button>
        )}
      </div>
    </div>
  );

  // Setup screen (first-time API config)
  const renderSetup = () => (
    <div className="sp-setup">
      <div className="sp-setup-icon"><Icons.Bot size={32} /></div>
      <div className="sp-setup-title">配置 AI 服务</div>
      <div className="sp-setup-desc">首次使用需要配置大模型 API，支持阿里百炼、DeepSeek、OpenAI 等兼容接口</div>
      <div className="sp-form">
        <div className="sp-form-group">
          <label>API 地址</label>
          <input type="text" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions" />
        </div>
        <div className="sp-form-group">
          <label>API Key</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..." />
        </div>
        <div className="sp-form-group">
          <label>模型名称</label>
          <input type="text" value={model} onChange={(e) => setModel(e.target.value)}
            placeholder="glm-5" />
        </div>
        <button className="sp-action-btn primary" style={{ width: '100%' }}
          disabled={!apiKey.trim()} onClick={handleSaveConfig}>
          保存配置
        </button>
      </div>
    </div>
  );

  // Settings panel (inline, non-first-time)
  const renderSettings = () => (
    <div className="sp-settings">
      <div className="sp-section-title"><Icons.Settings size={14} /> API 设置</div>
      <div className="sp-form">
        <div className="sp-form-group">
          <label>API 地址</label>
          <input type="text" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
        </div>
        <div className="sp-form-group">
          <label>API Key</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder={config?.apiKey ? '•••••••• (已配置)' : 'sk-...'} />
        </div>
        <div className="sp-form-group">
          <label>模型名称</label>
          <input type="text" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <button className="sp-action-btn primary" style={{ width: '100%' }} onClick={async () => {
          const newConfig = {
            apiUrl: apiUrl.trim() || config?.apiUrl,
            apiKey: apiKey.trim() || config?.apiKey,
            model: model.trim() || config?.model,
          };
          await sendMsg('saveConfig', { config: newConfig });
          setConfig(newConfig);
          setShowSettings(false);
        }}>
          保存设置
        </button>
      </div>
      <div className="sp-usage-info">
        <span>今日使用: <strong>{usage.todaySessions || 0}</strong> 次</span>
        <span>·</span>
        <span>累计: <strong>{usage.totalSessions || 0}</strong> 次</span>
      </div>
    </div>
  );

  // Home screen
  const renderHome = () => {
    if (showSettings) return renderSettings();

    return (
      <div className={`sp-home${isTabMode ? ' sp-tab-mode' : ''}`}>
        {/* 非 tab 模式：显示 JD 状态、卡片、操作按钮 */}
        {!isTabMode && (
          <>
            {/* JD Status */}
            <div className={`sp-jd-status ${jdStatus === 'found' ? 'found' : ''}`}>
              {jdStatus === 'detecting' && (
                <><div className="sp-mini-spinner" /><span>正在检测当前页面...</span></>
              )}
              {jdStatus === 'none' && (
                <><Icons.Search size={14} /><span>未检测到岗位信息，可手动粘贴 JD</span></>
              )}
              {jdStatus === 'found' && jd && (
                <><Icons.Check size={14} /><span>已加载: {jd.title || '岗位信息'}</span></>
              )}
            </div>

            {/* JD Info Card */}
            {jdStatus === 'found' && jd && (
              <div className="sp-jd-card">
                <div className="sp-jd-card-header">
                  <span className="sp-jd-title">{jd.title}</span>
                  {jd.company && <span className="sp-jd-company">{jd.company}</span>}
                </div>
                {(jd.location || jd.infoItems?.length > 0) && (
                  <div className="sp-jd-meta">
                    {jd.location && <span className="sp-jd-meta-item">{jd.location}</span>}
                    {jd.infoItems?.filter((item) => item !== jd.location).map((item, i) => (
                      <span key={i} className="sp-jd-meta-item">{item}</span>
                    ))}
                  </div>
                )}
                {jd.tags?.length > 0 && (
                  <div className="sp-jd-tags">
                    {jd.tags.slice(0, 8).map((t, i) => <span key={i} className="sp-tag">{t}</span>)}
                  </div>
                )}
                {jd.jd && (
                  <div className="sp-jd-desc">{jd.jd.slice(0, 200)}{jd.jd.length > 200 ? '...' : ''}</div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="sp-home-actions">
              <button className="sp-action-btn primary" style={{ width: '100%' }}
                disabled={loading} onClick={handleLoadJob}>
                {loading && loadingText.includes('加载') ? (
                  <><div className="sp-mini-spinner" /> {loadingText}</>
                ) : (
                  <><Icons.Clipboard size={15} /> 加载当前岗位</>
                )}
              </button>

              <button className="sp-action-btn accent" style={{ width: '100%' }}
                disabled={loading} onClick={handleExtractAndAnalyze}>
                {loading && !loadingText.includes('加载') ? (
                  <><div className="sp-mini-spinner" /> {loadingText}</>
                ) : (
                  <><Icons.Zap size={15} /> 提取并分析 JD</>
                )}
              </button>

              <button className="sp-outline-btn" style={{ width: '100%' }}
                onClick={() => setShowManualJD(!showManualJD)}>
                <Icons.Clipboard size={14} /> 手动粘贴 JD
              </button>
            </div>

            {/* Manual JD input */}
            {showManualJD && (
              <div className="sp-manual-jd">
                <textarea value={manualText} onChange={(e) => setManualText(e.target.value)}
                  placeholder="粘贴岗位描述内容..." rows={4} />
                <button className="sp-action-btn primary sp-sm" onClick={handleManualJD}
                  disabled={!manualText.trim() || loading}>
                  分析此 JD
                </button>
              </div>
            )}
          </>
        )}

        {/* 两种模式都显示：分析结果 */}
        {analysis && (
          <div className="sp-analysis-card">
            <div className="sp-section-title" style={{ color: 'var(--success)' }}>
              <Icons.Check size={14} /> 分析完成
            </div>
            <div className="sp-analysis-body">
              {analysis.jobTitle && <div><strong>岗位：</strong>{analysis.jobTitle}</div>}
              {analysis.level && <div><strong>级别：</strong>{analysis.level}</div>}
              {analysis.keySkills?.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <strong>核心技能：</strong>
                  <div style={{ marginTop: 2 }}>
                    {analysis.keySkills.map((s, i) => (
                      <span key={i} className="sp-tag">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {analysis.interviewFocus?.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <strong>面试重点：</strong>
                  <div style={{ marginTop: 2 }}>
                    {analysis.interviewFocus.map((s, i) => (
                      <span key={i} className="sp-tag">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Questions + Start */}
        {questions.length > 0 && (
          <div className="sp-questions-section">
            <div className="sp-section-title"><Icons.Message size={14} /> 生成的面试题</div>
            <div className="sp-questions-list">
              {questions.map((item, i) => (
                <div key={i} className="sp-q-row">
                  <span className="sp-q-num">Q{i + 1}</span>
                  <span className={`sp-q-type ${item.type}`}>{item.typeLabel || item.type}</span>
                  <span className="sp-q-text">{item.question}</span>
                </div>
              ))}
            </div>
            <button className="sp-action-btn primary" style={{ width: '100%', marginTop: 8 }}
              onClick={startInterview}>
              <Icons.Zap size={16} /> 开始模拟面试 ({questions.length}题)
            </button>
            <button className="sp-action-btn" style={{ width: '100%', marginTop: 8, background: 'linear-gradient(135deg, #6C5CE7, #4834D4)', color: '#fff', borderColor: 'transparent' }}
              onClick={() => setShowInterviewRoom(true)}>
              <Icons.Target size={16} /> 视频面试间
            </button>
          </div>
        )}

        {/* Feature grid (when no data yet, non-tab mode only) */}
        {!analysis && !loading && !isTabMode && (
          <div className="sp-feature-grid" style={{ marginTop: 16 }}>
            {[
              { icon: <Icons.Message size={14} />, text: '智能追问' },
              { icon: <Icons.Target size={14} />, text: '多维评分' },
              { icon: <Icons.TrendingUp size={14} />, text: '改进建议' },
            ].map((f, i) => (
              <div key={i} className="sp-feature">
                <div className="sp-feature-icon">{f.icon}</div>
                {f.text}
              </div>
            ))}
          </div>
        )}

        {/* Tab 模式无数据时的提示 */}
        {isTabMode && !analysis && !loading && (
          <div style={{
            textAlign: 'center', padding: '40px 20px', color: 'var(--text-light)',
            fontSize: 13, lineHeight: 1.8,
          }}>
            <Icons.FileText size={32} />
            <div style={{ marginTop: 12 }}>暂无面试数据</div>
            <div style={{ fontSize: 12 }}>请先在招聘网站页面使用悬浮按钮分析岗位</div>
          </div>
        )}
      </div>
    );
  };

  // Interview screen
  const renderInterview = () => (
    <>
      <div className="sp-progress">
        <div className="sp-progress-bar" style={{
          width: `${((qIdx + (showFeedback || showFU ? 0.7 : 0.3)) / questions.length) * 100}%`,
        }} />
      </div>

      <div className={`sp-chat${isTabMode ? ' sp-tab-mode' : ''}`}>
        {(() => {
          // 排除 followup，且当前正在展示的题目（scoring/feedback）从 history 中排除避免重复
          let items = history.filter(h => h.type !== 'followup');
          if ((showFeedback || phase === 'scoring') && items.length > 0) {
            items = items.slice(0, -1);
          }
          return items.map((h, i) => (
            <div key={i}>
              <div className="sp-msg sp-msg-bot">
                <div className="sp-avatar sp-avatar-bot"><Icons.Bot size={14} /></div>
                <div>
                  <div className={`sp-q-badge ${h.type}`}>
                    <div className="sp-dot-sm" />{h.typeLabel}
                  </div>
                  <div className="sp-bubble sp-bubble-bot">{h.question}</div>
                </div>
              </div>
              <div className="sp-msg sp-msg-user" style={{ marginTop: 8 }}>
                <div className="sp-avatar sp-avatar-user"><Icons.User size={14} /></div>
                <div className="sp-bubble sp-bubble-user">
                  {h.answer.length > 80 ? h.answer.slice(0, 80) + '...' : h.answer}
                </div>
              </div>
              {h.evaluation?.scores?.overall && (
                <div style={{
                  marginLeft: 36, marginTop: 4, display: 'inline-flex',
                  alignItems: 'center', gap: 4, padding: '2px 8px',
                  borderRadius: 6, background: 'var(--accent-light)', fontSize: 11,
                }}>
                  <Icons.Award size={11} />
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{h.evaluation.scores.overall}分</span>
                </div>
              )}
            </div>
          ));
        })()}

        {phase !== 'idle' && (
          <div className="sp-msg sp-msg-bot">
            <div className="sp-avatar sp-avatar-bot"><Icons.Bot size={14} /></div>
            <div>
              <div className={`sp-q-badge ${q?.type}`}>
                <div className="sp-dot-sm" />{q?.typeLabel || q?.type}
              </div>
              <div className="sp-bubble sp-bubble-bot">
                {displayedQ}
                {phase === 'typing' && <span className="sp-cursor" />}
              </div>
            </div>
          </div>
        )}

        {phase === 'feedback' && (
          <div className="sp-msg sp-msg-user">
            <div className="sp-avatar sp-avatar-user"><Icons.User size={14} /></div>
            <div className="sp-bubble sp-bubble-user">{answer}</div>
          </div>
        )}

        {phase === 'scoring' && (
          <>
            <div className="sp-msg sp-msg-user">
              <div className="sp-avatar sp-avatar-user"><Icons.User size={14} /></div>
              <div className="sp-bubble sp-bubble-user">{answer}</div>
            </div>
            <div className="sp-msg sp-msg-bot">
              <div className="sp-avatar sp-avatar-bot"><Icons.Bot size={14} /></div>
              <div className="sp-bubble sp-bubble-bot">
                <div className="sp-scoring">
                  <div className="sp-mini-spinner" />
                  <span style={{ color: 'var(--text-mid)', fontSize: 12 }}>AI 正在分析你的回答...</span>
                </div>
              </div>
            </div>
          </>
        )}

        {showFeedback && feedback && (
          <div className="sp-feedback">
            <div className="sp-feedback-header">
              <span className="sp-feedback-title"><Icons.Award size={14} /> 回答评分</span>
              <div className={`sp-score-badge ${scoreClass(feedback.scores.overall)}`}>
                {feedback.scores.overall}
              </div>
            </div>
            <div className="sp-scores">
              <ScoreBar label="内容深度" score={feedback.scores.content} color="var(--primary)" barDelay={100} />
              <ScoreBar label="逻辑清晰度" score={feedback.scores.logic} color="#8B5CF6" barDelay={300} />
              <ScoreBar label="表达流畅度" score={feedback.scores.expression} color="#06B6D4" barDelay={500} />
            </div>
            <div className="sp-fb-items">
              {feedback.strengths?.map((s, i) => (
                <div key={i} className="sp-fb-item positive">
                  <span className="sp-fb-icon"><Icons.Check size={13} /></span><span>{s}</span>
                </div>
              ))}
              {feedback.improvements?.map((s, i) => (
                <div key={i} className="sp-fb-item negative">
                  <span className="sp-fb-icon"><Icons.Alert size={13} /></span><span>{s}</span>
                </div>
              ))}
            </div>
            {feedback.tips && (
              <div className="sp-tip">
                <button className="sp-tip-toggle" onClick={() => setExpandTip(!expandTip)}>
                  <Icons.Lightbulb size={13} /> 面试技巧提示
                  {expandTip ? <Icons.ChevronUp size={13} /> : <Icons.ChevronDown size={13} />}
                </button>
                {expandTip && <div className="sp-tip-content">{feedback.tips}</div>}
              </div>
            )}
          </div>
        )}

        {showFU && (
          <div className="sp-msg sp-msg-bot" style={{ animation: 'fadeIn 0.3s ease' }}>
            <div className="sp-avatar sp-avatar-bot"><Icons.Bot size={14} /></div>
            <div>
              <div className="sp-fu-tag"><Icons.Zap size={11} /> AI 追问</div>
              <div className="sp-bubble sp-bubble-fu">
                {displayedFU}
                {phase === 'fu_typing' && <span className="sp-cursor" />}
              </div>
            </div>
          </div>
        )}

        {phase === 'fu_done' && (
          <div className="sp-msg sp-msg-user">
            <div className="sp-avatar sp-avatar-user"><Icons.User size={14} /></div>
            <div className="sp-bubble sp-bubble-user">{fuAnswer}</div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <div className="sp-input">
        {phase === 'answering' && (
          <div className="sp-input-row">
            <textarea className="sp-textarea" value={answer} onChange={(e) => setAnswer(e.target.value)}
              placeholder="输入你的回答..." rows={3}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            />
            <button className="sp-send-btn primary" disabled={!answer.trim()} onClick={handleSubmit}>
              <Icons.Send size={18} />
            </button>
          </div>
        )}
        {phase === 'feedback' && (
          <button className="sp-action-btn primary" onClick={handleFollowUp}>
            {feedback?.scores?.overall >= 50 && q?.followUp
              ? <><Icons.Zap size={16} /> 继续追问</>
              : <>下一题 <Icons.ChevronRight size={16} /></>}
          </button>
        )}
        {phase === 'fu_answering' && (
          <div className="sp-input-row">
            <textarea className="sp-textarea fu-input" value={fuAnswer} onChange={(e) => setFuAnswer(e.target.value)}
              placeholder="回答追问..." rows={2}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitFU(); } }}
            />
            <button className="sp-send-btn accent" disabled={!fuAnswer.trim()} onClick={handleSubmitFU}>
              <Icons.Send size={18} />
            </button>
          </div>
        )}
        {phase === 'fu_done' && (
          <button className="sp-action-btn primary" onClick={handleNextQ}>
            {qIdx < questions.length - 1
              ? <>下一题 <Icons.ChevronRight size={16} /></>
              : <>查看面试报告 <Icons.Award size={16} /></>}
          </button>
        )}
        {(phase === 'typing' || phase === 'scoring' || phase === 'fu_typing' || phase === 'summarizing') && (
          <div className="sp-status-text">
            {phase === 'typing' ? '面试官提问中...' :
             phase === 'fu_typing' ? 'AI 正在追问...' :
             phase === 'summarizing' ? '正在生成面试报告...' : 'AI 分析中...'}
          </div>
        )}
      </div>
    </>
  );

  // Summary screen
  const renderSummary = () => {
    const avgScore = history.length
      ? Math.round(history.reduce((s, h) => s + (h.evaluation?.scores?.overall || 0), 0) / history.length)
      : 0;
    return (
      <div className={`sp-summary${isTabMode ? ' sp-tab-mode' : ''}`}>
        <div className="sp-summary-header">
          <div className="sp-summary-icon" style={{
            background: `linear-gradient(135deg, ${scoreColor(avgScore)}, ${scoreColor(avgScore)}dd)`,
            boxShadow: `0 8px 24px ${scoreColor(avgScore)}40`,
          }}>
            <Icons.Award size={28} />
          </div>
          <div className="sp-summary-score-label">综合评分</div>
          <div className="sp-summary-score" style={{ color: scoreColor(avgScore) }}>{avgScore}</div>
          <div className="sp-summary-meta">面试时长 {fmtTime(totalTime)} · 完成 {history.length} 道题目</div>
        </div>

        <div className="sp-card">
          <div className="sp-card-title"><Icons.Target size={14} style={{ color: 'var(--primary)' }} /> 各维度得分</div>
          {(() => {
            const dims = history.reduce((acc, h) => ({
              content: acc.content + (h.evaluation?.scores?.content || 0),
              logic: acc.logic + (h.evaluation?.scores?.logic || 0),
              expression: acc.expression + (h.evaluation?.scores?.expression || 0),
            }), { content: 0, logic: 0, expression: 0 });
            const n = history.length || 1;
            return (
              <>
                <ScoreBar label="内容深度" score={Math.round(dims.content / n)} color="var(--primary)" barDelay={200} />
                <ScoreBar label="逻辑清晰度" score={Math.round(dims.logic / n)} color="#8B5CF6" barDelay={400} />
                <ScoreBar label="表达流畅度" score={Math.round(dims.expression / n)} color="#06B6D4" barDelay={600} />
              </>
            );
          })()}
        </div>

        <div className="sp-card">
          <div className="sp-card-title"><Icons.Message size={14} style={{ color: 'var(--primary)' }} /> 题目详情</div>
          {history.filter(h => h.type !== 'followup').map((h, i) => (
            <div key={i} className="sp-q-item">
              <div className="sp-q-item-header">
                <span className="sp-q-item-title">Q{i + 1}: {h.typeLabel}</span>
                <span className="sp-q-item-score" style={{ color: scoreColor(h.evaluation?.scores?.overall || 0) }}>
                  {h.evaluation?.scores?.overall || '-'}分
                </span>
              </div>
              <div className="sp-q-item-desc">{h.question.slice(0, 50)}{h.question.length > 50 ? '...' : ''}</div>
              {h.evaluation?.strengths?.[0] && (
                <div className="sp-q-item-fb" style={{ color: 'var(--success)' }}>
                  <Icons.Check size={11} /> {h.evaluation.strengths[0]}
                </div>
              )}
            </div>
          ))}
        </div>

        {summary && (
          <div className="sp-card sp-card-tip">
            <div className="sp-card-title"><Icons.Lightbulb size={14} style={{ color: 'var(--accent)' }} /> 面试官总结</div>
            <div className="sp-card-tip-content">{summary.overallComment}</div>
            {summary.encouragement && (
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--primary)', fontWeight: 500 }}>
                {summary.encouragement}
              </div>
            )}
          </div>
        )}

        <div className="sp-actions">
          <button className="sp-outline-btn" onClick={handleRestart}>
            <Icons.RotateCcw size={15} /> 重新面试
          </button>
          <button className="sp-action-btn accent" style={{ flex: 1 }} onClick={() => {
            const report = `AI模拟面试报告\n\n岗位: ${analysis?.jobTitle || ''}\n综合评分: ${avgScore}分\n面试时长: ${fmtTime(totalTime)}\n\n${
              history.filter(h => h.type !== 'followup').map((h, i) =>
                `Q${i + 1} [${h.typeLabel}]: ${h.evaluation?.scores?.overall || '-'}分\n  亮点: ${h.evaluation?.strengths?.[0] || '无'}\n  建议: ${h.evaluation?.improvements?.[0] || '无'}`
              ).join('\n\n')
            }`;
            const blob = new Blob([report], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'AI模拟面试报告.txt'; a.click();
            URL.revokeObjectURL(url);
          }}>
            <Icons.FileText size={15} /> 导出报告
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {showInterviewRoom && analysis && questions.length > 0 && (
        <InterviewRoom
          questions={questions}
          jdAnalysis={analysis}
          aiService={aiServiceAdapter}
          onComplete={(hist, time) => {
            setShowInterviewRoom(false);
            setHistory(hist);
            setTotalTime(time);
            setScreen('summary');
          }}
          onExit={() => setShowInterviewRoom(false)}
        />
      )}
      {renderHeader()}
      {screen === 'setup' && renderSetup()}
      {screen === 'home' && renderHome()}
      {screen === 'interview' && renderInterview()}
      {screen === 'summary' && renderSummary()}
    </>
  );
}

// ---- Mount ----
const root = createRoot(document.getElementById('root'));
root.render(<App />);
