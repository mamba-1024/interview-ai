// ============================================================
// Popup Script - 弹出窗口交互逻辑
// ============================================================

document.addEventListener('DOMContentLoaded', init);

// ---- State ----
let config = null;
let currentJD = null;
let analysis = null;
let questions = null;

// ---- Elements ----
const $ = (sel) => document.querySelector(sel);
const viewSetup = $('#viewSetup');
const viewHome = $('#viewHome');
const loadingOverlay = $('#loadingOverlay');
const loadingText = $('#loadingText');

// ---- Init ----
async function init() {
  bindEvents();
  await loadConfig();
  await loadExistingData();
}

// ---- Events ----
function bindEvents() {
  $('#btnSettings').addEventListener('click', toggleSettings);
  $('#btnSaveConfig').addEventListener('click', saveConfig);
  $('#btnExtractJD').addEventListener('click', handleExtractJD);
  $('#btnManualJD').addEventListener('click', toggleManualJD);
  $('#btnAnalyzeManual').addEventListener('click', handleAnalyzeManual);
  $('#btnStartInterview').addEventListener('click', handleStartInterview);
}

// ---- Config ----
async function loadConfig() {
  const resp = await sendMessage('getConfig');
  config = resp?.config || {};

  if (!config.apiKey) {
    viewSetup.classList.remove('hidden');
    viewHome.classList.add('hidden');
    // 填充默认值
    $('#inputApiUrl').value = config.apiUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    $('#inputModel').value = config.model || 'glm-5';
  } else {
    viewSetup.classList.add('hidden');
    viewHome.classList.remove('hidden');
  }
}

async function saveConfig() {
  const newConfig = {
    apiUrl: $('#inputApiUrl').value.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKey: $('#inputApiKey').value.trim(),
    model: $('#inputModel').value.trim() || 'glm-5',
  };

  if (!newConfig.apiKey) {
    alert('请输入 API Key');
    return;
  }

  await sendMessage('saveConfig', { config: newConfig });
  config = newConfig;
  viewSetup.classList.add('hidden');
  viewHome.classList.remove('hidden');
  await loadExistingData();
}

function toggleSettings() {
  if (viewSetup.classList.contains('hidden')) {
    viewSetup.classList.remove('hidden');
    viewHome.classList.add('hidden');
    $('#inputApiUrl').value = config.apiUrl || '';
    $('#inputApiKey').value = config.apiKey || '';
    $('#inputModel').value = config.model || '';
  } else {
    if (config.apiKey) {
      viewSetup.classList.add('hidden');
      viewHome.classList.remove('hidden');
    }
  }
}

// ---- Load existing data ----
async function loadExistingData() {
  const resp = await sendMessage('getInterviewData');
  if (!resp?.success) return;

  // 使用统计
  if (resp.usage) {
    $('#todayCount').textContent = resp.usage.todaySessions || 0;
    $('#totalCount').textContent = resp.usage.totalSessions || 0;
  }

  // 已有的 JD 和分析结果
  if (resp.jd) {
    currentJD = resp.jd;
    showJDInfo(resp.jd);
  }

  if (resp.analysis) {
    analysis = resp.analysis;
    showAnalysis(analysis);
  }

  if (resp.questions) {
    questions = resp.questions;
    showQuestions(questions);
  }

  // 尝试从当前页面检测 JD
  if (!currentJD) {
    tryDetectJD();
  }
}

// ---- JD Detection ----
async function tryDetectJD() {
  $('#jdStatusText').textContent = '正在检测当前页面...';

  const resp = await sendMessage('extractJD');

  if (resp?.success) {
    currentJD = resp;
    showJDInfo(resp, true);
  } else {
    $('#jdStatusText').textContent = resp?.error || '当前页面未检测到岗位描述，可手动粘贴JD';
    $('.status-icon').classList.remove('detected');
  }
}

function showJDInfo(jd, detected = false) {
  $('.status-icon').classList.add('detected');
  $('#jdStatusText').textContent = detected
    ? `已检测到岗位: ${jd.title || '未知岗位'}`
    : jd.title || '已加载岗位信息';

  if (jd.title || jd.company) {
    $('#jdInfo').classList.remove('hidden');
    $('#jdTitle').textContent = jd.title || '';
    $('#jdCompany').textContent = jd.company || '';
    if (jd.salary) {
      $('#jdSalary').textContent = jd.salary;
      $('#jdSalary').style.display = '';
    } else {
      $('#jdSalary').style.display = 'none';
    }
  }
}

// ---- Extract & Analyze ----
async function handleExtractJD() {
  if (!currentJD) {
    // 尝试提取
    const extractResp = await sendMessage('extractJD');
    if (!extractResp?.success) {
      alert(extractResp?.error || '无法提取 JD，请确保当前页面包含岗位信息');
      return;
    }
    currentJD = extractResp;
    showJDInfo(currentJD, true);
  }

  showLoading('正在分析岗位要求...');

  const resp = await sendMessage('analyzeJD', {
    jdText: currentJD.fullText,
    jdData: currentJD,
  });

  if (!resp?.success) {
    hideLoading();
    alert(resp?.error || '分析失败');
    return;
  }

  analysis = resp.analysis;
  showAnalysis(analysis);

  // 生成面试题
  setLoadingText('正在生成面试题...');
  const qResp = await sendMessage('generateQuestions', {
    analysis,
    count: 5,
  });

  hideLoading();

  if (qResp?.success) {
    questions = qResp.questions;
    showQuestions(questions);
  } else {
    alert(qResp?.error || '生成面试题失败');
  }
}

// ---- Manual JD ----
function toggleManualJD() {
  const section = $('#manualJDSection');
  section.classList.toggle('hidden');
  if (!section.classList.contains('hidden')) {
    $('#manualJDInput').focus();
  }
}

async function handleAnalyzeManual() {
  const text = $('#manualJDInput').value.trim();
  if (!text) {
    alert('请粘贴岗位描述');
    return;
  }

  currentJD = { fullText: text, title: '手动输入' };
  showJDInfo(currentJD);
  $('#manualJDSection').classList.add('hidden');

  showLoading('正在分析岗位要求...');

  const resp = await sendMessage('analyzeJD', {
    jdText: text,
    jdData: currentJD,
  });

  if (!resp?.success) {
    hideLoading();
    alert(resp?.error || '分析失败');
    return;
  }

  analysis = resp.analysis;
  showAnalysis(analysis);

  setLoadingText('正在生成面试题...');
  const qResp = await sendMessage('generateQuestions', {
    analysis,
    count: 5,
  });

  hideLoading();

  if (qResp?.success) {
    questions = qResp.questions;
    showQuestions(questions);
  }
}

// ---- Show Analysis ----
function showAnalysis(analysis) {
  $('#analysisResult').classList.remove('hidden');

  const content = $('#analysisContent');
  let html = '';

  if (analysis.jobTitle) {
    html += `<div><span class="label">岗位：</span>${analysis.jobTitle}</div>`;
  }
  if (analysis.level) {
    html += `<div><span class="label">级别：</span>${analysis.level}</div>`;
  }
  if (analysis.keySkills?.length) {
    html += `<div style="margin-top:6px"><span class="label">核心技能：</span></div>`;
    html += `<div>${analysis.keySkills.map((s) => `<span class="tag">${s}</span>`).join('')}</div>`;
  }
  if (analysis.interviewFocus?.length) {
    html += `<div style="margin-top:6px"><span class="label">面试重点：</span></div>`;
    html += `<div>${analysis.interviewFocus.map((s) => `<span class="tag">${s}</span>`).join('')}</div>`;
  }

  content.innerHTML = html;
}

// ---- Show Questions ----
function showQuestions(questions) {
  $('#questionsSection').classList.remove('hidden');

  const list = $('#questionsList');
  list.innerHTML = questions
    .map(
      (q, i) => `
    <div class="question-item">
      <div class="q-header">
        <span class="q-num">Q${i + 1}</span>
        <span class="q-type ${q.type}">${q.typeLabel || q.type}</span>
      </div>
      <div class="q-text">${q.question}</div>
    </div>
  `
    )
    .join('');
}

// ---- Start Interview (open side panel) ----
async function handleStartInterview() {
  const btn = $('#btnStartInterview');
  btn.disabled = true;

  try {
    const resp = await sendMessage('openSidePanel');
    if (!resp?.success) {
      alert('打开侧边栏失败: ' + (resp?.error || '请确保 Chrome 版本支持 Side Panel'));
    }
  } catch (err) {
    alert('打开失败: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ---- Helpers ----
function showLoading(text) {
  loadingText.textContent = text || '处理中...';
  loadingOverlay.classList.remove('hidden');
}

function setLoadingText(text) {
  loadingText.textContent = text;
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

function sendMessage(action, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, ...data }, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(resp);
      }
    });
  });
}
