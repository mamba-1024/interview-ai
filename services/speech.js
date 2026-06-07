// ============================================================
// Speech Service - 语音识别 (STT) + 语音合成 (TTS)
// 支持 3 种 STT 引擎：
//   1. 浏览器原生 Web Speech API（默认）
//   2. Deepgram Nova-2（实时流式 WebSocket）
//   3. 科大讯飞（实时流式 WebSocket + PCM）
// ============================================================

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// 讯飞流式听写：16kHz PCM 每 40ms 发送 1280 字节（640 样本）
const IFLYTEK_PCM_FRAME_SAMPLES = 640;
const IFLYTEK_SEND_INTERVAL_MS = 40;
// 讯飞单帧 audio(base64) 上限 2000000 字符；保守限制 PCM 缓冲与单次发送量
const IFLYTEK_MAX_PCM_BUFFER_SAMPLES = 16000 * 30; // 30 秒
const IFLYTEK_MAX_FRAMES_PER_SESSION = 1375; // 单次连接最长 60s，提前 5s 主动重连

class SpeechService {
  constructor() {
    this.recognition = null;
    this.synth = window.speechSynthesis;
    this.isListening = false;
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.lang = 'zh-CN';
    this._callbacks = {};
    this._shouldRestart = false;
    // 面试官性别：'male' | 'female'，影响 TTS 语音选择
    this.gender = 'female';
    // STT 引擎: 'web' | 'deepgram' | 'iflytek'
    this.sttEngine = 'web';
    this.deepgramApiKey = '';
    this.iflytekAppId = '';
    this.iflytekApiKey = '';
    this.iflytekApiSecret = '';
    // 异步 STT 是否正在处理中（录音中或等待 API 返回）
    this.isAsyncProcessing = false;
    this._mediaStream = null;
    // Deepgram WebSocket + AudioContext
    this._deepgramWs = null;
    this._deepgramAudioCtx = null;
    this._deepgramSource = null;
    this._deepgramWorkletNode = null;
    this._deepgramSilentGain = null;
    this._deepgramSessionGen = 0;
    this._deepgramCommittedText = ''; // 已完成语句（speech_final 后提交）
    this._deepgramUtteranceSegments = []; // 当前语句内 is_final 分段
    this._deepgramInterimText = '';
    this._deepgramCloseTimeout = null;
    // 科大讯飞 WebSocket + AudioContext
    this._iflytekWs = null;
    this._iflytekGracefulClosingWs = null; // graceful 关闭中、仍等待最终结果的旧连接
    this._iflytekAudioCtx = null;
    this._iflytekSource = null;
    this._iflytekWorkletNode = null;
    this._iflytekSessionGen = 0; // 会话代数，防止并发启动互相干扰
    this._iflytekIntentionalStop = false; // 用户主动停止，不自动重连
    this._iflytekInputSampleRate = 48000;
    this._iflytekWpgsEnabled = true; // 未授权时自动降级
    this._iflytekSpillPcm = null; // 重连间隙暂存 PCM
    // 防重复启动 debounce
    this._startDebounceTimer = null;
    // TTS 语音列表（Chrome 异步加载，需监听 voiceschanged）
    this._ttsVoices = [];
    this._initTtsVoices();
  }

  _initTtsVoices() {
    if (!this.synth) return;
    const refresh = () => {
      const list = this.synth.getVoices();
      if (list.length) this._ttsVoices = list;
    };
    refresh();
    if (typeof this.synth.addEventListener === 'function') {
      this.synth.addEventListener('voiceschanged', refresh);
    } else {
      this.synth.onvoiceschanged = refresh;
    }
  }

  _getTtsVoices() {
    if (this._ttsVoices.length) return this._ttsVoices;
    const list = this.synth?.getVoices() || [];
    if (list.length) this._ttsVoices = list;
    return this._ttsVoices;
  }

  /**
   * 按面试官性别选择中文 TTS 语音（兼容 macOS / Windows / Chrome 各平台命名）
   * @returns {{ voice: SpeechSynthesisVoice | null, pitch: number }}
   */
  _pickTtsVoice() {
    const voices = this._getTtsVoices();
    const zhVoices = voices.filter(v => /^zh/i.test(v.lang));
    const isMale = this.gender === 'male';

    const femaleRe = /female|女|ting.?ting|tian.?tian|meijia|sin.?ji|yaoyao|huihui|yu.?shu|xiaoxiao|xiaoyi|lili|xiaohan|xiaomeng|google.*普通话|google.*國語|google.*粤語|cantonese|sinji/i;
    const maleRe = /male|男|kangkang|kang.?kang|li.?mu|limu|yunxi|yunyang|siri_male|云希|云扬|康康|李牧/i;

    const voiceText = (v) => `${v.name} ${v.voiceURI || ''}`;
    const isFemaleVoice = (v) => femaleRe.test(voiceText(v));
    const isMaleVoice = (v) => maleRe.test(voiceText(v));

    if (isMale) {
      const maleVoice = zhVoices.find(isMaleVoice);
      if (maleVoice) return { voice: maleVoice, pitch: 0.9 };

      const neutral = zhVoices.find(v => !isFemaleVoice(v) && !isMaleVoice(v));
      if (neutral) return { voice: neutral, pitch: 0.78 };

      const notFemale = zhVoices.find(v => !isFemaleVoice(v));
      if (notFemale) return { voice: notFemale, pitch: 0.72 };

      const fallback = zhVoices.find(v => !v.default) || zhVoices[1] || voices.find(v => isMaleVoice(v));
      return { voice: fallback || zhVoices[0] || voices[0] || null, pitch: 0.65 };
    }

    const femaleVoice = zhVoices.find(isFemaleVoice);
    if (femaleVoice) return { voice: femaleVoice, pitch: 1.05 };

    const notMale = zhVoices.find(v => !isMaleVoice(v));
    if (notMale) return { voice: notMale, pitch: 1.1 };

    return { voice: zhVoices[0] || voices[0] || null, pitch: 1.15 };
  }

  /**
   * 设置 STT 引擎
   * @param {'web' | 'deepgram' | 'iflytek'} engine
   */
  setSttEngine(engine) {
    const valid = ['web', 'deepgram', 'iflytek'];
    const next = valid.includes(engine) ? engine : 'web';
    if (this.sttEngine !== next) {
      this._forceStop();
    }
    this.sttEngine = next;
  }

  /**
   * 设置 Deepgram API Key
   * @param {string} apiKey
   */
  setDeepgramApiKey(apiKey) {
    this.deepgramApiKey = apiKey || '';
  }

  /**
   * 设置科大讯飞鉴权信息
   * @param {string} appId
   * @param {string} apiKey
   * @param {string} apiSecret
   */
  setIflytekConfig(appId, apiKey, apiSecret) {
    this.iflytekAppId = appId || '';
    this.iflytekApiKey = apiKey || '';
    this.iflytekApiSecret = apiSecret || '';
  }

  /**
   * 设置面试官性别（影响语音合成的音调和语音选择）
   * @param {'male' | 'female'} gender
   */
  setGender(gender) {
    this.gender = gender === 'male' ? 'male' : 'female';
  }

  /**
   * 初始化语音识别（每次调用都重新创建实例，避免状态残留）
   */
  initRecognition(options = {}) {
    if (!SpeechRecognition) {
      console.warn('[SpeechService] SpeechRecognition not supported in this context');
      return null;
    }

    // 每次创建新实例，避免旧实例的状态问题
    const recognition = new SpeechRecognition();
    recognition.continuous = options.continuous ?? true;
    recognition.interimResults = options.interimResults ?? true;
    recognition.lang = options.lang || this.lang;
    recognition.maxAlternatives = 1;

    this.recognition = recognition;
    return recognition;
  }

  /**
   * 校验当前 STT 引擎配置是否完整
   */
  _validateSttEngine(callbacks = {}) {
    const engine = this.sttEngine;

    if (!SpeechService.isEngineSupported(engine)) {
      callbacks.onError?.('not-supported', `当前环境不支持 ${engine} 语音识别`);
      return false;
    }

    if (engine === 'deepgram' && !this.deepgramApiKey) {
      callbacks.onError?.('config-missing', '请先在设置中配置 Deepgram API Key');
      return false;
    }
    if (engine === 'iflytek') {
      if (!this.iflytekAppId || !this.iflytekApiKey || !this.iflytekApiSecret) {
        callbacks.onError?.('config-missing', '请先在设置中配置完整的科大讯飞 AppID / APIKey / APISecret');
        return false;
      }
    }
    if (engine === 'web' && !SpeechRecognition) {
      callbacks.onError?.('not-supported', '当前浏览器不支持 Web Speech API，请切换其他语音识别引擎');
      return false;
    }

    return true;
  }

  _setAsyncProcessing(value) {
    this.isAsyncProcessing = value;
  }

  /**
   * 开始语音识别（根据引擎选择对应实现）
   * @param {Object} callbacks - { onResult, onInterim, onStart, onEnd, onError, onAudioEnd }
   */
  startListening(callbacks = {}) {
    // 取消之前防抖计时器（防止快速重复调用）
    if (this._startDebounceTimer) {
      clearTimeout(this._startDebounceTimer);
      this._startDebounceTimer = null;
    }

    if (!this._validateSttEngine(callbacks)) return;

    if (this.sttEngine === 'deepgram') {
      return this._startDeepgramListening(callbacks);
    }
    if (this.sttEngine === 'iflytek') {
      return this._startIflytekListening(callbacks);
    }
    return this._startWebListening(callbacks);
  }

  /**
   * Web Speech API 语音识别
   */
  _startWebListening(callbacks = {}) {
    // 先停掉旧的
    this._forceStop();

    const recognition = this.initRecognition();
    if (!recognition) {
      if (callbacks.onError) callbacks.onError('not-supported');
      return;
    }

    this._callbacks = callbacks;
    this._shouldRestart = true;

    recognition.onstart = () => {
      this.isListening = true;
      this._shouldRestart = true;
      console.log('[SpeechService] Recognition started');
      if (callbacks.onStart) callbacks.onStart();
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript && callbacks.onResult) {
        callbacks.onResult(finalTranscript.trim());
      }
      if (interimTranscript && callbacks.onInterim) {
        callbacks.onInterim(interimTranscript);
      }
    };

    recognition.onaudiostart = () => {
      console.log('[SpeechService] Audio capturing started');
      if (callbacks.onAudioStart) callbacks.onAudioStart();
    };

    recognition.onend = () => {
      console.log('[SpeechService] Recognition ended, shouldRestart:', this._shouldRestart);
      this.isListening = false;

      // Chrome 会在静音超时后自动结束，此时自动重启以保持持续聆听
      if (this._shouldRestart && this.recognition === recognition) {
        try {
          recognition.start();
          this.isListening = true;
          return;
        } catch (e) {
          console.warn('[SpeechService] Recognition restart failed:', e.message);
        }
      }

      if (callbacks.onEnd) callbacks.onEnd({ reason: 'stopped' });
    };

    recognition.onerror = (event) => {
      this.isListening = false;

      // aborted 通常是因为我们主动 stop()，静默处理
      if (event.error === 'aborted') {
        return;
      }

      // no-speech 是正常情况（用户没有说话），静默处理
      if (event.error === 'no-speech') {
        return;
      }

      // not-allowed 表示麦克风权限被拒绝
      if (event.error === 'not-allowed') {
        this._shouldRestart = false;
        console.warn('[SpeechService] Recognition error: not-allowed');
        if (callbacks.onError) callbacks.onError('not-allowed', '麦克风权限被拒绝，请在浏览器地址栏左侧点击锁图标允许麦克风访问');
        return;
      }

      console.warn('[SpeechService] Recognition error:', event.error, event.message || '');
      if (callbacks.onError) callbacks.onError(event.error, event.message);
    };

    try {
      recognition.start();
      console.log('[SpeechService] Calling recognition.start()');
    } catch (e) {
      console.warn('[SpeechService] Failed to start recognition:', e.message);
      this.isListening = false;
      if (callbacks.onError) callbacks.onError('start-failed', e.message);
    }
  }

  /**
   * 停止语音识别
   */
  stopListening() {
    this._shouldRestart = false;
    if (this.sttEngine === 'deepgram') {
      this._stopDeepgram(true);
    } else if (this.sttEngine === 'iflytek') {
      this._stopIflytek(true);
    } else {
      this._forceStop();
    }
  }

  _forceStop() {
    this._iflytekSessionGen++;
    this._deepgramSessionGen++;
    this._iflytekIntentionalStop = true;
    this._iflytekSpillPcm = null;
    this._cleanupIflytekConnections();
    this._stopDeepgram(false);
    this._stopIflytekAudioGraph();
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (e) {
        // ignore
      }
    }
    this.isListening = false;
    this._setAsyncProcessing(false);
  }

  // ================== Deepgram STT (WebSocket 实时流式) ==================

  _buildDeepgramWsUrl() {
    const params = new URLSearchParams({
      model: 'nova-2',
      language: 'multi',
      punctuate: 'true',
      smart_format: 'true',
      interim_results: 'true',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      endpointing: '300',
      utterance_end_ms: '1000',
      vad_events: 'true',
    });
    return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
  }

  _getDeepgramDisplayText() {
    const pending = [
      ...this._deepgramUtteranceSegments,
      this._deepgramInterimText,
    ].filter(Boolean).join(' ').trim();

    const committed = this._deepgramCommittedText || '';
    if (!pending) return committed;
    return committed ? `${committed} ${pending}` : pending;
  }

  /**
   * 合并 Deepgram 流式结果（按官方文档：is_final 分段累积，speech_final 提交整句）
   */
  _mergeDeepgramResult(data) {
    const transcript = data.channel?.alternatives?.[0]?.transcript?.trim() || '';

    if (transcript) {
      if (data.is_final) {
        this._deepgramUtteranceSegments.push(transcript);
        this._deepgramInterimText = '';
      } else {
        // 新语句开始时 interim 会重置，把上一句未提交的 interim 先固化
        const prev = this._deepgramInterimText;
        if (
          prev &&
          prev.length > 2 &&
          !transcript.startsWith(prev) &&
          !prev.startsWith(transcript)
        ) {
          this._deepgramUtteranceSegments.push(prev);
        }
        this._deepgramInterimText = transcript;
      }
    }

    if (data.speech_final) {
      let utterance = this._deepgramUtteranceSegments.join(' ').trim();
      if (!utterance && transcript) {
        utterance = transcript;
      }
      if (utterance) {
        this._deepgramCommittedText += (this._deepgramCommittedText ? ' ' : '') + utterance;
      }
      this._deepgramUtteranceSegments = [];
      this._deepgramInterimText = '';
    }

    return this._getDeepgramDisplayText();
  }

  _flushDeepgramPendingText() {
    const pending = [
      ...this._deepgramUtteranceSegments,
      this._deepgramInterimText,
    ].filter(Boolean).join(' ').trim();
    if (pending) {
      this._deepgramCommittedText += (this._deepgramCommittedText ? ' ' : '') + pending;
    }
    this._deepgramUtteranceSegments = [];
    this._deepgramInterimText = '';
  }

  _handleDeepgramPcmFrame(pcm16) {
    const ws = this._deepgramWs;
    if (!ws || ws.readyState !== WebSocket.OPEN || !pcm16?.length) return;
    const buf = pcm16.buffer.slice(pcm16.byteOffset, pcm16.byteOffset + pcm16.byteLength);
    ws.send(buf);
  }

  async _setupDeepgramAudioGraph(stream, sessionGen) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this._deepgramAudioCtx = audioCtx;

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    await this._loadIflytekWorkletModule(audioCtx);
    if (sessionGen !== this._deepgramSessionGen) {
      audioCtx.close().catch(() => {});
      return false;
    }

    const source = audioCtx.createMediaStreamSource(stream);
    this._deepgramSource = source;

    const workletNode = new AudioWorkletNode(audioCtx, 'iflytek-pcm-processor');
    this._deepgramWorkletNode = workletNode;

    workletNode.port.onmessage = (e) => {
      if (sessionGen !== this._deepgramSessionGen) return;
      this._handleDeepgramPcmFrame(e.data);
    };

    const silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
    this._deepgramSilentGain = silentGain;

    source.connect(workletNode);
    workletNode.connect(silentGain);
    silentGain.connect(audioCtx.destination);

    console.log('[SpeechService] Deepgram AudioWorklet started, sampleRate:', audioCtx.sampleRate);
    return true;
  }

  _stopDeepgramAudioGraph() {
    try {
      if (this._deepgramWorkletNode) {
        this._deepgramWorkletNode.port.onmessage = null;
        this._deepgramWorkletNode.disconnect();
      }
      if (this._deepgramSource) this._deepgramSource.disconnect();
      if (this._deepgramSilentGain) this._deepgramSilentGain.disconnect();
      if (this._deepgramAudioCtx && this._deepgramAudioCtx.state !== 'closed') {
        this._deepgramAudioCtx.close();
      }
    } catch (e) { /* ignore */ }
    this._deepgramAudioCtx = null;
    this._deepgramSource = null;
    this._deepgramWorkletNode = null;
    this._deepgramSilentGain = null;
  }

  _detachDeepgramWs(ws) {
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
  }

  _closeDeepgramWs(ws) {
    if (!ws) return;
    this._detachDeepgramWs(ws);
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000);
      }
    } catch (e) { /* ignore */ }
    if (this._deepgramWs === ws) this._deepgramWs = null;
  }

  /**
   * Deepgram 实时流式语音识别：WebSocket + 16kHz PCM
   */
  async _startDeepgramListening(callbacks = {}) {
    this._iflytekSessionGen++;
    this._iflytekIntentionalStop = true;
    this._iflytekSpillPcm = null;
    this._cleanupIflytekConnections();

    const sessionGen = ++this._deepgramSessionGen;
    this._stopDeepgram(false);
    this._stopIflytekAudioGraph();
    this._callbacks = callbacks;
    this._deepgramCommittedText = '';
    this._deepgramUtteranceSegments = [];
    this._deepgramInterimText = '';
    this._setAsyncProcessing(true);

    const apiKey = (this.deepgramApiKey || '').trim().replace(/[^\x20-\x7E]/g, '');
    if (!apiKey) {
      this._setAsyncProcessing(false);
      callbacks.onError?.('config-missing', '请先在设置中配置 Deepgram API Key');
      return;
    }

    try {
      console.log('[SpeechService] Deepgram connecting...');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      if (sessionGen !== this._deepgramSessionGen) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      this._mediaStream = stream;

      const audioReady = await this._setupDeepgramAudioGraph(stream, sessionGen);
      if (!audioReady || sessionGen !== this._deepgramSessionGen) return;

      const ws = new WebSocket(this._buildDeepgramWsUrl(), ['token', apiKey]);
      ws._deepgramSessionGen = sessionGen;
      this._deepgramWs = ws;

      let connected = false;
      const connectTimeout = setTimeout(() => {
        if (!connected && this._deepgramWs === ws) {
          console.warn('[SpeechService] Deepgram connection timeout');
          this._closeDeepgramWs(ws);
          this._stopDeepgramAudioGraph();
          this._setAsyncProcessing(false);
          callbacks.onError?.('api-error', 'Deepgram 连接超时，请检查网络和 API Key');
        }
      }, 10000);

      ws.onopen = () => {
        if (sessionGen !== this._deepgramSessionGen || this._deepgramWs !== ws) {
          this._closeDeepgramWs(ws);
          return;
        }
        clearTimeout(connectTimeout);
        connected = true;
        this.isListening = true;
        console.log('[SpeechService] Deepgram WebSocket connected');
        callbacks.onStart?.();
        callbacks.onAudioStart?.();
      };

      ws.onmessage = (msg) => {
        if (this._deepgramWs !== ws) return;

        try {
          const data = JSON.parse(msg.data);

          if (data.type === 'Error') {
            console.warn('[SpeechService] Deepgram error:', data.description || data.message);
            const desc = (data.description || data.message || '').toLowerCase();
            if (desc.includes('auth') || desc.includes('401') || desc.includes('credential')) {
              callbacks.onError?.('auth-failed', 'Deepgram API Key 无效，请在设置中检查');
            } else {
              callbacks.onError?.('api-error', data.description || data.message || 'Deepgram 识别错误');
            }
            this._stopDeepgram(false);
            return;
          }

          if (data.type === 'UtteranceEnd') {
            this._flushDeepgramPendingText();
            callbacks.onInterim?.(this._getDeepgramDisplayText());
            return;
          }

          if (data.type !== 'Results') return;

          const transcript = data.channel?.alternatives?.[0]?.transcript?.trim() || '';
          if (!transcript && !data.is_final) return;

          const displayText = this._mergeDeepgramResult(data);
          if (displayText) {
            callbacks.onInterim?.(displayText);
          }

          if (data.is_final && transcript) {
            callbacks.onResult?.(transcript);
          }

          if (data.speech_final) {
            console.log('[SpeechService] Deepgram utterance end:', displayText?.slice(-50));
          }
        } catch (e) {
          console.warn('[SpeechService] Deepgram parse error:', e);
        }
      };

      ws.onclose = (e) => {
        if (this._deepgramWs !== ws && ws._deepgramSessionGen !== sessionGen) return;

        console.log('[SpeechService] Deepgram WebSocket closed:', e.code, e.reason?.slice(0, 60));
        clearTimeout(connectTimeout);
        if (this._deepgramCloseTimeout) {
          clearTimeout(this._deepgramCloseTimeout);
          this._deepgramCloseTimeout = null;
        }
        if (this._deepgramWs === ws) this._deepgramWs = null;

        this.isListening = false;
        this._setAsyncProcessing(false);

        if (ws._deepgramGraceful) {
          const displayText = this._getDeepgramDisplayText();
          callbacks.onEnd?.({
            reason: 'stopped',
            empty: !displayText,
          });
        }
      };

      ws.onerror = () => {
        console.warn('[SpeechService] Deepgram WebSocket error');
      };

    } catch (err) {
      this.isListening = false;
      this._setAsyncProcessing(false);
      this._stopDeepgram(false);
      if (err.name === 'NotAllowedError') {
        callbacks.onError?.('not-allowed', '麦克风权限被拒绝');
      } else if (err.name === 'NotFoundError') {
        callbacks.onError?.('not-supported', '未找到麦克风设备');
      } else {
        callbacks.onError?.('start-failed', err.message);
      }
    }
  }

  /**
   * 停止 Deepgram 流式识别
   * @param {boolean} graceful - 发送 CloseStream 等待最终结果
   */
  _stopDeepgram(graceful = false) {
    if (this._deepgramCloseTimeout) {
      clearTimeout(this._deepgramCloseTimeout);
      this._deepgramCloseTimeout = null;
    }

    this._flushDeepgramPendingText();
    this._stopDeepgramAudioGraph();

    const ws = this._deepgramWs;
    const callbacks = this._callbacks;

    if (ws?.readyState === WebSocket.OPEN) {
      if (graceful) {
        ws._deepgramGraceful = true;
        try {
          ws.send(JSON.stringify({ type: 'CloseStream' }));
        } catch (e) { /* ignore */ }
        this._deepgramCloseTimeout = setTimeout(() => {
          this._deepgramCloseTimeout = null;
          if (this._deepgramWs === ws) {
            this._closeDeepgramWs(ws);
            this.isListening = false;
            this._setAsyncProcessing(false);
            const displayText = this._getDeepgramDisplayText();
            callbacks?.onEnd?.({ reason: 'stopped', empty: !displayText });
          }
        }, 1500);
      } else {
        this._closeDeepgramWs(ws);
        this.isListening = false;
        this._setAsyncProcessing(false);
      }
    } else {
      this._closeDeepgramWs(ws);
      this.isListening = false;
      this._setAsyncProcessing(false);
    }

    if (this._mediaStream) {
      this._mediaStream.getTracks().forEach(t => t.stop());
      this._mediaStream = null;
    }
  }

  // ================== 科大讯飞 STT (实时 PCM 流式) ==================

  /**
   * 构建科大讯飞鉴权 WebSocket URL
   */
  async _buildIflytekUrl() {
    const host = 'iat-api.xfyun.cn';
    const path = '/v2/iat';
    const date = new Date().toUTCString();
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;

    console.log('[SpeechService] iFlytek credentials - appId:', this.iflytekAppId?.length,
      'apiKey:', this.iflytekApiKey?.length, 'apiSecret:', this.iflytekApiSecret?.length);

    // Web Crypto API 计算 HMAC-SHA256
    const keyData = new TextEncoder().encode(this.iflytekApiSecret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(signatureOrigin));
    const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

    const authOrigin = `api_key="${this.iflytekApiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
    const authorization = btoa(authOrigin);

    const params = new URLSearchParams({ authorization, date, host });
    console.log('[SpeechService] iFlytek auth URL built');
    return `wss://${host}${path}?${params}`;
  }

  /**
   * Float32 音频数据转 Int16 PCM
   */
  _floatTo16BitPCM(input) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }

  /**
   * 将 Float32 音频重采样到 16kHz（讯飞要求 16kHz PCM）
   */
  _resampleTo16k(float32Data, fromSampleRate) {
    const targetRate = 16000;
    if (fromSampleRate === targetRate) {
      return this._floatTo16BitPCM(float32Data);
    }

    const ratio = fromSampleRate / targetRate;
    const outLength = Math.max(1, Math.floor(float32Data.length / ratio));
    const resampled = new Float32Array(outLength);

    for (let i = 0; i < outLength; i++) {
      const srcIdx = i * ratio;
      const idx = Math.floor(srcIdx);
      const frac = srcIdx - idx;
      const s0 = float32Data[idx] || 0;
      const s1 = float32Data[idx + 1] ?? s0;
      resampled[i] = s0 + (s1 - s0) * frac;
    }

    return this._floatTo16BitPCM(resampled);
  }

  _iflytekEndFramePayload(remainingPcm = null) {
    let audio = '';
    if (remainingPcm && remainingPcm.length > 0) {
      audio = this._arrayBufferToBase64(remainingPcm.buffer, remainingPcm.byteOffset, remainingPcm.byteLength);
    }
    return {
      data: {
        status: 2,
        format: 'audio/L16;rate=16000',
        encoding: 'raw',
        audio,
      },
    };
  }

  _iflytekBusinessParams() {
    const params = {
      language: 'zh_cn',
      domain: 'iat',
      accent: 'mandarin',
      ptt: 1,
      eos: 10000,
    };
    if (this._iflytekWpgsEnabled) {
      params.dwa = 'wpgs';
    }
    return params;
  }

  /**
   * 初始化单个 WebSocket 的讯飞会话状态（与连接绑定，避免多连接共享状态）
   */
  _initIflytekWsState(ws) {
    ws._iflytekState = {
      sid: null,
      frameStatus: 0, // 0=首帧未发, 1=中间帧, 2=已结束
      pcmBuffer: new Int16Array(8192),
      pcmBufferLen: 0,
      sentFrameCount: 0,
      accumulatedText: '',
      wpgsParts: {},
      wpgsTemp: '',
      lastSendTime: 0,
      ended: false,
    };
    return ws._iflytekState;
  }

  _getIflytekState(ws) {
    return ws?._iflytekState || null;
  }

  /**
   * 追加重采样 PCM 到指定连接的缓冲
   */
  _appendIflytekPcm(ws, pcm16) {
    const state = this._getIflytekState(ws);
    if (!state || state.ended || !pcm16.length) return;

    const needed = state.pcmBufferLen + pcm16.length;
    if (needed > IFLYTEK_MAX_PCM_BUFFER_SAMPLES) {
      const overflow = needed - IFLYTEK_MAX_PCM_BUFFER_SAMPLES;
      if (overflow >= state.pcmBufferLen) {
        state.pcmBufferLen = 0;
      } else {
        state.pcmBuffer.copyWithin(0, overflow, state.pcmBufferLen);
        state.pcmBufferLen -= overflow;
      }
    }

    const neededAfterTrim = state.pcmBufferLen + pcm16.length;
    if (neededAfterTrim > state.pcmBuffer.length) {
      const expanded = new Int16Array(Math.max(neededAfterTrim, state.pcmBuffer.length * 2));
      expanded.set(state.pcmBuffer.subarray(0, state.pcmBufferLen));
      state.pcmBuffer = expanded;
    }
    state.pcmBuffer.set(pcm16, state.pcmBufferLen);
    state.pcmBufferLen += pcm16.length;
  }

  _getIflytekPreservedText(state) {
    if (!state) return '';
    return (state.accumulatedText || '') + (state.wpgsTemp || '');
  }

  _concatInt16(a, b) {
    if (!a?.length) return b || null;
    if (!b?.length) return a;
    const out = new Int16Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
  }

  _takeIflytekPendingPcm(state) {
    let pcm = null;
    if (state?.pcmBufferLen > 0) {
      pcm = state.pcmBuffer.slice(0, state.pcmBufferLen);
      state.pcmBufferLen = 0;
    }
    if (this._iflytekSpillPcm?.length) {
      pcm = this._concatInt16(pcm, this._iflytekSpillPcm);
      this._iflytekSpillPcm = null;
    }
    return pcm;
  }

  /**
   * status=2 或接近 60s 上限时，主动结束当前 WS 并立即重连（避免 server read msg timeout）
   */
  _retireIflytekWsForReconnect(ws, sessionGen, callbacks, reason = 'status=2') {
    if (sessionGen !== this._iflytekSessionGen) return;
    if (ws !== this._iflytekWs) return;

    const state = this._getIflytekState(ws);
    if (!state || state.ended || state.reconnectPending) return;

    state.reconnectPending = true;
    state.ended = true;

    const preservedText = this._getIflytekPreservedText(state);
    const pendingPcm = this._takeIflytekPendingPcm(state);

    this._stopIflytekSendTimerForWs(ws);
    this._iflytekWs = null;
    ws._iflytekRetiring = true;

    this._detachIflytekWs(ws);
    try {
      if (ws.readyState === WebSocket.OPEN) ws.close(1000);
    } catch (e) { /* ignore */ }

    console.log('[SpeechService] iFlytek proactive reconnect (' + reason + '), preserved chars:', preservedText.length);

    this._connectIflytekWs(sessionGen, callbacks, {
      accumulatedText: preservedText,
      pendingPcm,
      isReconnect: true,
    }).catch((err) => {
      console.warn('[SpeechService] iFlytek reconnect failed:', err);
      this.isListening = false;
      this._setAsyncProcessing(false);
      callbacks.onError?.('api-error', '科大讯飞重连失败: ' + err.message);
    });
  }

  _startIflytekSendTimer(ws) {
    this._stopIflytekSendTimerForWs(ws);
    ws._iflytekSendTimer = setInterval(() => {
      if (!this._isActiveIflytekWs(ws) || ws.readyState !== WebSocket.OPEN) return;
      this._trySendIflytekFrames(ws);
    }, IFLYTEK_SEND_INTERVAL_MS);
  }

  /**
   * 按 40ms 节奏发送音频帧；缓冲积压时允许追帧
   */
  _trySendIflytekFrames(ws) {
    const state = this._getIflytekState(ws);
    if (!state || state.ended || ws.readyState !== WebSocket.OPEN) return;

    if (this._iflytekAudioCtx?.state === 'suspended') {
      this._iflytekAudioCtx.resume().catch(() => {});
    }

    const maxCatchUp = 3; // 单次最多连发 3 帧（120ms），避免突发触发 10165
    let sent = 0;
    while (
      sent < maxCatchUp &&
      state.pcmBufferLen >= IFLYTEK_PCM_FRAME_SAMPLES
    ) {
      const now = performance.now();
      if (state.lastSendTime && now - state.lastSendTime < IFLYTEK_SEND_INTERVAL_MS) break;
      this._sendNextIflytekFrame(ws);
      state.lastSendTime = performance.now();
      sent++;
    }
  }

  _stopIflytekSendTimerForWs(ws) {
    if (ws?._iflytekSendTimer) {
      clearInterval(ws._iflytekSendTimer);
      ws._iflytekSendTimer = null;
    }
  }

  _stopAllIflytekSendTimers() {
    this._stopIflytekSendTimerForWs(this._iflytekWs);
    this._stopIflytekSendTimerForWs(this._iflytekGracefulClosingWs);
  }

  _sendNextIflytekFrame(ws) {
    const state = this._getIflytekState(ws);
    if (!state || state.ended || state.frameStatus >= 2) return;
    if (state.pcmBufferLen < IFLYTEK_PCM_FRAME_SAMPLES) return;

    const chunk = state.pcmBuffer.slice(0, IFLYTEK_PCM_FRAME_SAMPLES);
    state.pcmBuffer.copyWithin(0, IFLYTEK_PCM_FRAME_SAMPLES, state.pcmBufferLen);
    state.pcmBufferLen -= IFLYTEK_PCM_FRAME_SAMPLES;

    const base64audio = this._arrayBufferToBase64(
      chunk.buffer,
      chunk.byteOffset,
      chunk.byteLength
    );

    const business = this._iflytekBusinessParams();

    if (state.frameStatus === 0) {
      ws.send(JSON.stringify({
        common: { app_id: this.iflytekAppId },
        business,
        data: {
          status: 0,
          format: 'audio/L16;rate=16000',
          encoding: 'raw',
          audio: base64audio,
        },
      }));
      state.frameStatus = 1;
    } else {
      ws.send(JSON.stringify({
        data: {
          status: 1,
          format: 'audio/L16;rate=16000',
          encoding: 'raw',
          audio: base64audio,
        },
      }));
    }

    state.sentFrameCount++;
    if (state.sentFrameCount === 1 || state.sentFrameCount % 25 === 0) {
      console.log('[SpeechService] iFlytek sent', state.sentFrameCount,
        'audio frames (1280B / 40ms each), sid:', state.sid || '(pending)');
    }

    if (
      state.sentFrameCount >= IFLYTEK_MAX_FRAMES_PER_SESSION &&
      !state.reconnectPending
    ) {
      this._retireIflytekWsForReconnect(ws, ws._iflytekSessionGen, this._callbacks, '60s-limit');
    }
  }

  _flushIflytekPcmBeforeEnd(ws) {
    const state = this._getIflytekState(ws);
    if (!state || state.ended || ws.readyState !== WebSocket.OPEN) return;

    while (state.pcmBufferLen >= IFLYTEK_PCM_FRAME_SAMPLES && state.frameStatus >= 1) {
      this._sendNextIflytekFrame(ws);
    }
  }

  _takeIflytekRemainingPcm(state) {
    if (!state?.pcmBufferLen) return null;
    const remaining = state.pcmBuffer.slice(0, state.pcmBufferLen);
    state.pcmBufferLen = 0;
    return remaining;
  }

  _sendIflytekEndFrame(ws) {
    const state = this._getIflytekState(ws);
    if (!ws || ws.readyState !== WebSocket.OPEN || !state || state.ended) return;

    this._flushIflytekPcmBeforeEnd(ws);
    const remaining = this._takeIflytekRemainingPcm(state);
    const endChunk = remaining?.length > IFLYTEK_PCM_FRAME_SAMPLES
      ? remaining.slice(0, IFLYTEK_PCM_FRAME_SAMPLES)
      : remaining;

    if (state.frameStatus === 0) {
      const audio = endChunk?.length
        ? this._arrayBufferToBase64(endChunk.buffer, endChunk.byteOffset, endChunk.byteLength)
        : '';
      ws.send(JSON.stringify({
        common: { app_id: this.iflytekAppId },
        business: this._iflytekBusinessParams(),
        data: {
          status: 0,
          format: 'audio/L16;rate=16000',
          encoding: 'raw',
          audio,
        },
      }));
      ws.send(JSON.stringify(this._iflytekEndFramePayload()));
    } else {
      ws.send(JSON.stringify(this._iflytekEndFramePayload(endChunk)));
    }

    state.frameStatus = 2;
    state.ended = true;
  }

  /** 强制关闭时发送空结束帧，避免服务端残留 invalid handle */
  _sendIflytekAbortEndFrame(ws) {
    const state = this._getIflytekState(ws);
    if (!ws || ws.readyState !== WebSocket.OPEN || !state || state.ended) return;
    try {
      if (state.frameStatus === 0) {
        ws.send(JSON.stringify({
          common: { app_id: this.iflytekAppId },
          business: this._iflytekBusinessParams(),
          data: { status: 0, format: 'audio/L16;rate=16000', encoding: 'raw', audio: '' },
        }));
      }
      ws.send(JSON.stringify(this._iflytekEndFramePayload()));
      state.ended = true;
      state.frameStatus = 2;
    } catch (e) { /* ignore */ }
  }

  _abortIflytekWs(ws) {
    if (!ws) return;
    this._stopIflytekSendTimerForWs(ws);
    this._sendIflytekAbortEndFrame(ws);
    this._detachIflytekWs(ws);
    try {
      if (ws.readyState !== WebSocket.CLOSED) ws.close(1000);
    } catch (e) { /* ignore */ }
  }

  /**
   * 加载科大讯飞 AudioWorklet 模块（替代已废弃的 ScriptProcessorNode）
   */
  async _loadIflytekWorkletModule(audioCtx) {
    if (!audioCtx?.audioWorklet) {
      throw new Error('当前浏览器不支持 AudioWorklet');
    }

    const workletUrl = SpeechService._getIflytekWorkletUrl();
    await audioCtx.audioWorklet.addModule(workletUrl);
  }

  /**
   * 处理 AudioWorklet 采集到的 16kHz PCM 帧（自动路由到活跃 WS 或重连缓冲）
   */
  _handleIflytekPcmFrame(pcm16) {
    if (!pcm16?.length) return;

    const ws = this._iflytekWs;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const state = this._getIflytekState(ws);
      if (state && !state.ended) {
        this._appendIflytekPcm(ws, pcm16);
        this._trySendIflytekFrames(ws);
        return;
      }
    }

    // 重连间隙：暂存 PCM，避免丢失（上限 30 秒）
    this._iflytekSpillPcm = this._concatInt16(this._iflytekSpillPcm, pcm16);
    if (this._iflytekSpillPcm?.length > IFLYTEK_MAX_PCM_BUFFER_SAMPLES) {
      this._iflytekSpillPcm = this._iflytekSpillPcm.slice(
        this._iflytekSpillPcm.length - IFLYTEK_MAX_PCM_BUFFER_SAMPLES
      );
    }
  }

  /**
   * ArrayBuffer 转 Base64（分块，避免大字符串拼接卡顿）
   */
  _arrayBufferToBase64(buffer, byteOffset = 0, byteLength) {
    const bytes = new Uint8Array(buffer, byteOffset, byteLength ?? buffer.byteLength);
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  /**
   * 合并讯飞流式结果（支持 wpgs 动态修正）
   * @returns {string|null} 当前应显示的完整文本
   */
  _mergeIflytekResult(state, resultData) {
    const result = resultData?.result;
    if (!result?.ws) return null;

    let segment = '';
    for (const wsItem of result.ws) {
      for (const cw of wsItem.cw || []) {
        segment += cw.w || '';
      }
    }
    if (!segment && !result.pgs) return null;

    if (result.pgs) {
      if (result.pgs === 'apd') {
        state.wpgsParts[result.sn] = segment;
      } else if (result.pgs === 'rpl') {
        const rg = result.rg || [0, 0];
        for (let i = rg[0]; i <= rg[1]; i++) {
          delete state.wpgsParts[i];
        }
        state.wpgsParts[result.sn] = segment;
      }

      let temp = '';
      const keys = Object.keys(state.wpgsParts).map(Number).sort((a, b) => a - b);
      for (const k of keys) {
        if (state.wpgsParts[k]) temp += state.wpgsParts[k];
      }
      state.wpgsTemp = temp;

      if (result.ls) {
        state.accumulatedText += state.wpgsTemp;
        state.wpgsTemp = '';
        state.wpgsParts = {};
      }
      return state.accumulatedText + state.wpgsTemp;
    }

    state.accumulatedText += segment;
    return state.accumulatedText;
  }

  /**
   * 解析科大讯飞返回结果，提取文字
   * v2 WebAPI 格式: data.result.ws[].cw[].w
   * 旧版格式: data.cn.st.rt[].ws[].cw[].w
   */
  _extractIflytekText(resultData) {
    try {
      // 讯飞 IAT v2 WebAPI（当前使用）
      if (resultData?.result?.ws) {
        let text = '';
        for (const wsItem of resultData.result.ws) {
          if (wsItem?.cw) {
            for (const cw of wsItem.cw) {
              text += cw.w || '';
            }
          }
        }
        return text;
      }

      // 旧版格式兼容
      const rt = resultData?.cn?.st?.rt;
      if (!rt?.length) return '';
      let text = '';
      for (const sentence of rt) {
        if (sentence.ws) {
          for (const word of sentence.ws) {
            if (word.cw) {
              for (const char of word.cw) {
                text += char.w || '';
              }
            }
          }
        }
      }
      return text;
    } catch (e) {
      return '';
    }
  }

  /**
   * 启动 AudioWorklet 音频采集（与 WebSocket 解耦，支持断线重连）
   */
  async _setupIflytekAudioGraph(stream, sessionGen) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this._iflytekAudioCtx = audioCtx;
    const inputSampleRate = audioCtx.sampleRate;
    this._iflytekInputSampleRate = inputSampleRate;

    if (audioCtx.state === 'suspended') {
      console.log('[SpeechService] iFlytek resuming suspended AudioContext');
      await audioCtx.resume();
    }

    await this._loadIflytekWorkletModule(audioCtx);
    if (sessionGen !== this._iflytekSessionGen) {
      audioCtx.close().catch(() => {});
      return false;
    }

    const source = audioCtx.createMediaStreamSource(stream);
    this._iflytekSource = source;

    const workletNode = new AudioWorkletNode(audioCtx, 'iflytek-pcm-processor');
    this._iflytekWorkletNode = workletNode;

    workletNode.port.onmessage = (e) => {
      if (sessionGen !== this._iflytekSessionGen) return;
      this._handleIflytekPcmFrame(e.data);
    };

    const silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
    this._iflytekSilentGain = silentGain;

    source.connect(workletNode);
    workletNode.connect(silentGain);
    silentGain.connect(audioCtx.destination);

    console.log('[SpeechService] iFlytek AudioWorklet started, audioCtx state:', audioCtx.state,
      'sampleRate:', inputSampleRate);
    return true;
  }

  /**
   * 绑定讯飞 WebSocket 事件（首次连接与断线重连共用）
   */
  _bindIflytekWsHandlers(ws, sessionGen, callbacks, { isReconnect = false } = {}) {
    let iflytekConnected = false;
    let iflytekErrorReported = false;

    const iflytekTimeout = setTimeout(() => {
      if (!iflytekConnected && !iflytekErrorReported && this._iflytekWs === ws) {
        iflytekErrorReported = true;
        console.warn('[SpeechService] iFlytek connection timeout');
        this._detachIflytekWs(ws);
        this._iflytekIntentionalStop = true;
        this._stopIflytek(false);
        this._setAsyncProcessing(false);
        callbacks.onError?.('api-error', '科大讯飞连接超时，请检查网络和凭证');
      }
    }, 10000);

    ws.onopen = () => {
      if (sessionGen !== this._iflytekSessionGen || this._iflytekWs !== ws) {
        this._abortIflytekWs(ws);
        return;
      }

      clearTimeout(iflytekTimeout);
      iflytekConnected = true;
      console.log('[SpeechService] iFlytek WebSocket connected', isReconnect ? '(reconnected)' : '');
      this.isListening = true;
      this._setAsyncProcessing(true);

      if (!isReconnect) {
        callbacks.onStart?.();
        callbacks.onAudioStart?.();
      }

      this._startIflytekSendTimer(ws);
      this._trySendIflytekFrames(ws);
    };

    ws.onmessage = (msg) => {
      if (!this._isActiveIflytekWs(ws)) return;
      if (this.sttEngine !== 'iflytek' || ws._iflytekSessionGen !== sessionGen) return;

      const state = this._getIflytekState(ws);
      if (!state) return;

      try {
        const resp = JSON.parse(msg.data);
        const msgSid = resp.sid || '';

        if (state.sid && msgSid && msgSid !== state.sid) return;

        if (resp.code === 0 && msgSid) {
          state.sid = msgSid;
        }

        if (resp.code !== 0) {
          if (state.sid && msgSid && msgSid !== state.sid) return;

          console.warn('[SpeechService] iFlytek error:', resp.code, resp.message, 'sid:', msgSid);
          if (this.sttEngine !== 'iflytek' || ws._iflytekSessionGen !== sessionGen) return;
          if (resp.code === 11200 && this._iflytekWpgsEnabled) {
            console.log('[SpeechService] iFlytek wpgs not authorized, disabling dwa and reconnecting');
            this._iflytekWpgsEnabled = false;
            const preservedText = this._getIflytekPreservedText(state);
            this._stopIflytekSendTimerForWs(ws);
            if (this._iflytekWs === ws) this._iflytekWs = null;
            this._detachIflytekWs(ws);
            try { ws.close(1000); } catch (e) { /* ignore */ }
            this._connectIflytekWs(sessionGen, callbacks, {
              accumulatedText: preservedText,
              isReconnect: true,
            }).catch((err) => {
              callbacks.onError?.('api-error', '科大讯飞重连失败: ' + err.message);
            });
            return;
          }
          if (resp.code === 10105 || resp.code === 10110) {
            callbacks.onError?.('auth-failed', '科大讯飞鉴权失败，请检查 AppID/APIKey/APISecret');
          } else if (resp.code === 10165) {
            callbacks.onError?.('api-error', '科大讯飞帧乱序(10165)，请重试');
          } else {
            callbacks.onError?.('api-error', `科大讯飞错误(${resp.code}): ${resp.message || ''}`);
          }
          this._iflytekIntentionalStop = true;
          this._abortIflytekWs(ws);
          this._stopIflytekAudioGraph();
          this._setAsyncProcessing(false);
          return;
        }

        if (!resp.data) return;

        const resultData = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;

        const segment = this._extractIflytekText(resultData);
        const displayText = this._mergeIflytekResult(state, resultData);
        if (!displayText && !segment) {
          if (resultData.status === 2 && !state.reconnectPending) {
            this._retireIflytekWsForReconnect(ws, sessionGen, callbacks, 'status=2-empty');
          }
          return;
        }

        const isFinal = resultData?.result?.ls === true;
        const tail = (displayText || '').slice(-40);

        console.log('[SpeechService] iFlytek text:', (segment || '').slice(0, 30),
          '| tail:', tail, '| final:', isFinal);

        callbacks.onInterim?.(displayText || state.accumulatedText);

        if (isFinal) {
          callbacks.onResult?.(segment || displayText);
        }

        if (resultData.status === 2 && !state.reconnectPending) {
          this._retireIflytekWsForReconnect(ws, sessionGen, callbacks, 'status=2');
        }
      } catch (e) {
        console.warn('[SpeechService] iFlytek parse error:', e);
      }
    };

    ws.onclose = (e) => {
      const isGraceful = ws === this._iflytekGracefulClosingWs;
      const isActive = ws === this._iflytekWs;
      if (!isGraceful && !isActive && !ws._iflytekRetiring) return;

      const state = this._getIflytekState(ws);

      console.log('[SpeechService] iFlytek WebSocket closed:', e.code, e.reason?.slice(0, 80),
        'frames:', state?.sentFrameCount ?? 0, 'sid:', state?.sid,
        ws._iflytekRetiring ? '(retiring)' : isGraceful ? '(graceful)' : '(active)');

      this._stopIflytekSendTimerForWs(ws);
      if (isActive) this._iflytekWs = null;
      if (isGraceful) this._iflytekGracefulClosingWs = null;

      // 已由 status=2 主动重连处理，跳过
      if (ws._iflytekRetiring) return;

      if (isGraceful || this._iflytekIntentionalStop || ws._iflytekSessionGen !== this._iflytekSessionGen) {
        this.isListening = false;
        this._setAsyncProcessing(false);
        if (this._iflytekIntentionalStop) this._iflytekIntentionalStop = false;
        callbacks.onEnd?.({ reason: 'stopped' });
        return;
      }

      const preservedText = this._getIflytekPreservedText(state);
      const pendingPcm = this._takeIflytekPendingPcm(state);

      console.log('[SpeechService] iFlytek auto-reconnecting (onclose fallback), preserved chars:', preservedText.length);
      this._connectIflytekWs(sessionGen, callbacks, {
        accumulatedText: preservedText,
        pendingPcm,
        isReconnect: true,
      }).catch((err) => {
        console.warn('[SpeechService] iFlytek reconnect failed:', err);
        this.isListening = false;
        this._setAsyncProcessing(false);
        callbacks.onError?.('api-error', '科大讯飞重连失败: ' + err.message);
      });
    };

    ws.onerror = () => {
      if (!this._isActiveIflytekWs(ws)) return;
      console.warn('[SpeechService] iFlytek WebSocket error');
      if (this._iflytekWs === ws) this._iflytekWs = null;
    };
  }

  /**
   * 建立讯飞 WebSocket 连接（支持断线重连）
   */
  async _connectIflytekWs(sessionGen, callbacks, { accumulatedText = '', pendingPcm = null, isReconnect = false, wsUrl = null } = {}) {
    if (sessionGen !== this._iflytekSessionGen) return;

    const url = wsUrl || await this._buildIflytekUrl();
    if (sessionGen !== this._iflytekSessionGen) return;

    const ws = new WebSocket(url);
    ws._iflytekSessionGen = sessionGen;
    this._initIflytekWsState(ws);
    ws._iflytekState.accumulatedText = accumulatedText;
    const pending = this._concatInt16(pendingPcm, this._iflytekSpillPcm);
    this._iflytekSpillPcm = null;
    if (pending?.length) {
      this._appendIflytekPcm(ws, pending);
    }
    this._iflytekWs = ws;
    this._bindIflytekWsHandlers(ws, sessionGen, callbacks, { isReconnect });
  }

  /**
   * 科大讯飞实时流式语音识别：通过 AudioContext 采集 PCM，WebSocket 发送
   */
  async _startIflytekListening(callbacks = {}) {
    this._deepgramSessionGen++;

    const sessionGen = ++this._iflytekSessionGen;

    // 新会话开始前，发送结束帧并关闭所有旧连接
    this._cleanupIflytekConnections();
    this._stopDeepgram(false);
    this._stopIflytekAudioGraph();
    this._callbacks = callbacks;
    this._iflytekIntentionalStop = false;
    this._setAsyncProcessing(true);

    try {
      console.log('[SpeechService] iFlytek connecting...');

      const [stream, wsUrl] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          }
        }),
        this._buildIflytekUrl(),
      ]);
      if (sessionGen !== this._iflytekSessionGen) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      this._mediaStream = stream;

      try {
        const [audioReady] = await Promise.all([
          this._setupIflytekAudioGraph(stream, sessionGen),
          this._connectIflytekWs(sessionGen, callbacks, { wsUrl }),
        ]);
        if (!audioReady || sessionGen !== this._iflytekSessionGen) return;
      } catch (workletErr) {
        console.warn('[SpeechService] iFlytek AudioWorklet failed:', workletErr);
        this._iflytekIntentionalStop = true;
        this._stopIflytek(false);
        this._setAsyncProcessing(false);
        callbacks.onError?.('not-supported', 'AudioWorklet 不可用: ' + workletErr.message);
      }

    } catch (err) {
      this.isListening = false;
      this._setAsyncProcessing(false);
      this._stopIflytek(false);
      if (err.name === 'NotAllowedError') {
        callbacks.onError?.('not-allowed', '麦克风权限被拒绝');
      } else if (err.name === 'NotFoundError') {
        callbacks.onError?.('not-supported', '未找到麦克风设备');
      } else {
        callbacks.onError?.('start-failed', err.message);
      }
    }
  }

  /**
   * 判断 WebSocket 是否仍属于当前活跃或 graceful 收尾中的讯飞会话
   */
  _isActiveIflytekWs(ws) {
    return ws === this._iflytekWs || ws === this._iflytekGracefulClosingWs;
  }

  /**
   * 清除讯飞 WebSocket 引用
   */
  _clearIflytekWsRef(ws) {
    if (this._iflytekWs === ws) this._iflytekWs = null;
    if (this._iflytekGracefulClosingWs === ws) this._iflytekGracefulClosingWs = null;
  }

  /**
   * 关闭并 detach 所有讯飞 WebSocket（含 graceful 收尾中的旧连接）
   */
  _cleanupIflytekConnections() {
    this._stopAllIflytekSendTimers();

    if (this._iflytekCloseTimeout) {
      clearTimeout(this._iflytekCloseTimeout);
      this._iflytekCloseTimeout = null;
    }

    for (const ws of [this._iflytekGracefulClosingWs, this._iflytekWs]) {
      if (!ws) continue;
      this._abortIflytekWs(ws);
    }

    this._iflytekWs = null;
    this._iflytekGracefulClosingWs = null;
  }

  /**
   * 移除 WebSocket 事件监听，防止旧连接关闭时触发新会话回调
   */
  _detachIflytekWs(ws) {
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
  }

  _stopIflytekAudioGraph() {
    try {
      if (this._iflytekWorkletNode) {
        this._iflytekWorkletNode.port.onmessage = null;
        this._iflytekWorkletNode.disconnect();
      }
      if (this._iflytekSource) {
        this._iflytekSource.disconnect();
      }
      if (this._iflytekSilentGain) {
        this._iflytekSilentGain.disconnect();
      }
      if (this._iflytekAudioCtx && this._iflytekAudioCtx.state !== 'closed') {
        this._iflytekAudioCtx.close();
      }
    } catch (e) { /* ignore */ }
    this._iflytekAudioCtx = null;
    this._iflytekSource = null;
    this._iflytekWorkletNode = null;
    this._iflytekSilentGain = null;
  }

  /**
   * 科大讯飞: 停止录音并关闭 WebSocket
   * @param {boolean} graceful - 是否发送结束帧并等待服务端返回最终结果
   */
  _stopIflytek(graceful = false) {
    this._iflytekIntentionalStop = true;
    this._stopIflytekSendTimerForWs(this._iflytekWs);
    this._stopIflytekAudioGraph();
    this._iflytekSpillPcm = null;

    if (this._iflytekCloseTimeout) {
      clearTimeout(this._iflytekCloseTimeout);
      this._iflytekCloseTimeout = null;
    }

    const ws = this._iflytekWs;
    try {
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        if (graceful && ws.readyState === WebSocket.OPEN) {
          this._sendIflytekEndFrame(ws);

          this._iflytekGracefulClosingWs = ws;
          if (this._iflytekWs === ws) this._iflytekWs = null;

          if (this._mediaStream) {
            this._mediaStream.getTracks().forEach(t => t.stop());
            this._mediaStream = null;
          }

          this._iflytekCloseTimeout = setTimeout(() => {
            this._iflytekCloseTimeout = null;
            this._abortIflytekWs(ws);
            if (this._iflytekGracefulClosingWs === ws) this._iflytekGracefulClosingWs = null;
          }, 800);
          return;
        }

        this._abortIflytekWs(ws);
      }
    } catch (e) { /* ignore */ }

    this._clearIflytekWsRef(ws);
    this.isListening = false;

    if (this._mediaStream) {
      this._mediaStream.getTracks().forEach(t => t.stop());
      this._mediaStream = null;
    }
  }

  // ================== TTS 语音合成 ==================

  /**
   * 语音合成（文字转语音）
   * @param {string} text - 要朗读的文字
   * @param {Object} callbacks - { onStart, onEnd, onError }
   */
  speak(text, callbacks = {}) {
    if (!this.synth) {
      console.warn('[SpeechService] SpeechSynthesis not supported');
      if (callbacks.onError) callbacks.onError('tts-not-supported');
      return;
    }

    if (!this._getTtsVoices().length) {
      const retry = () => {
        const list = this.synth.getVoices();
        if (list.length) this._ttsVoices = list;
        if (typeof this.synth.removeEventListener === 'function') {
          this.synth.removeEventListener('voiceschanged', retry);
        }
        this.speak(text, callbacks);
      };
      if (typeof this.synth.addEventListener === 'function') {
        this.synth.addEventListener('voiceschanged', retry);
      } else {
        this.synth.onvoiceschanged = retry;
      }
      this.synth.getVoices();
      return;
    }

    this.stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.lang;
    utterance.rate = 1.0;
    utterance.volume = 1.0;

    const { voice, pitch } = this._pickTtsVoice();
    utterance.pitch = pitch;
    if (voice) utterance.voice = voice;

    utterance.onstart = () => {
      this.isSpeaking = true;
      if (callbacks.onStart) callbacks.onStart();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.currentUtterance = null;
      if (callbacks.onEnd) callbacks.onEnd();
    };

    utterance.onerror = (e) => {
      this.isSpeaking = false;
      this.currentUtterance = null;

      // interrupted / canceled 是主动 stopSpeaking() 触发的，静默处理
      const errType = e?.error || 'unknown';
      if (errType === 'interrupted' || errType === 'canceled' || errType === 'audio-busy') {
        return;
      }

      console.warn('[SpeechService] TTS error:', errType, e?.message || '');
      if (callbacks.onError) callbacks.onError(errType);
    };

    this.currentUtterance = utterance;

    // Chrome 有个 bug：如果长时间不调用 resume，synthesis 会暂停
    this.synth.resume();
    this.synth.speak(utterance);
  }

  /**
   * 停止语音合成
   */
  stopSpeaking() {
    if (this.synth.speaking || this.synth.pending) {
      this.synth.cancel();
    }
    this.isSpeaking = false;
    this.currentUtterance = null;
  }

  /**
   * 检查浏览器支持情况
   */
  static isSupported() {
    const hasMedia = !!navigator.mediaDevices?.getUserMedia;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const hasAudioCtx = !!AudioCtx;
    const hasAudioWorklet = hasAudioCtx && 'audioWorklet' in AudioCtx.prototype;
    return {
      stt: !!SpeechRecognition,
      deepgramStt: hasMedia && !!window.WebSocket && hasAudioWorklet,
      iflytekStt: hasMedia && !!window.WebSocket && hasAudioWorklet,
      tts: !!window.speechSynthesis,
    };
  }

  /**
   * 获取科大讯飞 AudioWorklet 模块 URL（扩展内静态文件，fallback 为 Blob URL）
   */
  static _getIflytekWorkletUrl() {
    if (SpeechService._iflytekWorkletBlobUrl) {
      return SpeechService._iflytekWorkletBlobUrl;
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      return chrome.runtime.getURL('services/iflytek-pcm-processor.js');
    }

    const workletCode = `
      class IflytekPcmProcessor extends AudioWorkletProcessor {
        process(inputs) {
          const channel = inputs[0]?.[0];
          if (channel && channel.length > 0) {
            this.port.postMessage(channel.slice(0));
          }
          return true;
        }
      }
      registerProcessor('iflytek-pcm-processor', IflytekPcmProcessor);
    `;
    SpeechService._iflytekWorkletBlobUrl = URL.createObjectURL(
      new Blob([workletCode], { type: 'application/javascript' })
    );
    return SpeechService._iflytekWorkletBlobUrl;
  }

  /**
   * 检查指定 STT 引擎在当前环境是否可用
   */
  static isEngineSupported(engine) {
    const caps = SpeechService.isSupported();
    switch (engine) {
      case 'web': return caps.stt;
      case 'deepgram': return caps.deepgramStt;
      case 'iflytek': return caps.iflytekStt;
      default: return false;
    }
  }
}

const speechService = new SpeechService();

SpeechService._iflytekWorkletBlobUrl = null;

export { SpeechService, speechService };

if (typeof globalThis !== 'undefined') {
  globalThis.speechService = speechService;
}
