// ============================================================
// Speech Service - 语音识别 (STT) + 语音合成 (TTS)
// 使用浏览器原生 Web Speech API
// ============================================================

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

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
   * 开始语音识别
   * @param {Object} callbacks - { onResult, onInterim, onStart, onEnd, onError, onAudioEnd }
   */
  startListening(callbacks = {}) {
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
      if (callbacks.onEnd) callbacks.onEnd();
    };

    recognition.onerror = (event) => {
      console.warn('[SpeechService] Recognition error:', event.error, event.message);
      this.isListening = false;

      // not-allowed 表示麦克风权限被拒绝
      if (event.error === 'not-allowed') {
        this._shouldRestart = false;
        if (callbacks.onError) callbacks.onError('not-allowed', '麦克风权限被拒绝，请在浏览器地址栏左侧点击锁图标允许麦克风访问');
        return;
      }

      // no-speech 是正常情况（用户没有说话），不需要报错
      if (event.error === 'no-speech') {
        return;
      }

      // aborted 通常是因为我们主动 stop()，不需要重启
      if (event.error === 'aborted') {
        return;
      }

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
    this._forceStop();
  }

  _forceStop() {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (e) {
        // ignore
      }
    }
    this.isListening = false;
  }

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

    this.stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.lang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // 尝试选择中文语音
    const voices = this.synth.getVoices();
    const zhVoice = voices.find(v => v.lang.startsWith('zh')) || voices[0];
    if (zhVoice) utterance.voice = zhVoice;

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
      console.warn('[SpeechService] TTS error:', e);
      if (callbacks.onError) callbacks.onError(e);
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
    return {
      stt: !!SpeechRecognition,
      tts: !!window.speechSynthesis,
    };
  }
}

const speechService = new SpeechService();

export { SpeechService, speechService };

if (typeof globalThis !== 'undefined') {
  globalThis.speechService = speechService;
}
