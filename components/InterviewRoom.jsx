// ============================================================
// InterviewRoom - 视频面试间组件
// 模拟线上视频面试场景：虚拟面试官 + 摄像头 + 语音交互
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import InterviewAvatar from './InterviewAvatar.jsx';
import { speechService } from '../services/speech.js';
import { SpeechService } from '../services/speech.js';

const InterviewRoom = ({ questions, jdAnalysis, aiService, onComplete, onExit }) => {
  // 状态
  // 随机选择面试官性别（每次进入面试间决定一次）
  const [gender] = useState(() => Math.random() > 0.5 ? 'male' : 'female');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState('intro'); // intro | asking | listening | scoring | done
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [micDetected, setMicDetected] = useState(null); // null=未检测, true=可用, false=不可用
  const [micLevel, setMicLevel] = useState(0); // 实时音量 0-100
  const [micErrorMsg, setMicErrorMsg] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [history, setHistory] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [, setTick] = useState(0); // 每秒触发重渲染，用于实时显示答题时长
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [sttError, setSttError] = useState(null);
  const [audioActive, setAudioActive] = useState(false);
  const [manualText, setManualText] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [retryRef, setRetryRef] = useState(null); // { questionIdx, answer, evaluation }
  const [showDoneBanner, setShowDoneBanner] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const transcriptRef = useRef('');
  const isEvaluatingRef = useRef(false);
  const evaluateAnswerRef = useRef(null);
  const isRetryModeRef = useRef(false); // 是否处于重新作答模式
  const questionStartMarkRef = useRef(null); // 当前题目开始作答时的 elapsedTime
  const micStreamRef = useRef(null); // 麦克风检测音频流
  const micAnalyserRef = useRef(null); // 音频分析器
  const micAnimRef = useRef(null); // requestAnimationFrame ID

  const currentQuestion = questions[currentIdx];
  const totalQuestions = questions.length;

  // 检查 STT 支持
  const sttSupported = SpeechService.isSupported().stt;

  // 初始化摄像头 + 设置语音性别
  useEffect(() => {
    speechService.setGender(gender);
    startCamera();
    return () => {
      stopCamera();
      speechService.stopSpeaking();
      speechService.stopListening();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // 计时器
  useEffect(() => {
    if (phase !== 'intro' && phase !== 'done') {
      timerRef.current = setInterval(() => {
        setElapsedTime(t => t + 1);
        setTick(t => t + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // 面试结束时显示完成横幅
  useEffect(() => {
    if (phase === 'done') {
      setShowDoneBanner(true);
    }
  }, [phase]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraError(null);
    } catch (err) {
      console.warn('[InterviewRoom] Camera error:', err);
      setCameraError('摄像头权限获取失败，请允许摄像头访问');
      setCameraOn(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const toggleCamera = () => {
    if (cameraOn) {
      stopCamera();
      setCameraOn(false);
    } else {
      startCamera();
      setCameraOn(true);
    }
  };

  // 结束回答（防止重复触发 evaluateAnswer）
  const finishAnswer = useCallback(() => {
    if (isEvaluatingRef.current) return;
    isEvaluatingRef.current = true;
    speechService.stopListening();
    setAudioActive(false);
    setPhase('scoring');
    // 通过 ref 调用最新的 evaluateAnswer，避免闭包陈旧
    evaluateAnswerRef.current && evaluateAnswerRef.current();
  }, []);

  // 停止麦克风检测
  const stopMicDetect = () => {
    if (micAnimRef.current) {
      cancelAnimationFrame(micAnimRef.current);
      micAnimRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    micAnalyserRef.current = null;
    setMicLevel(0);
  };

  // 启动麦克风检测（获取权限 + 实时音量）
  const startMicDetect = async () => {
    stopMicDetect();
    setMicDetected(null);
    setMicErrorMsg(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setMicDetected(true);

      // Web Audio 分析音量
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      micAnalyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        micAnimRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      console.warn('[InterviewRoom] Mic detection error:', err);
      setMicDetected(false);
      setMicErrorMsg(err.name === 'NotAllowedError' ? '麦克风权限被拒绝' : '无法访问麦克风');
      setMicLevel(0);
    }
  };

  const toggleMic = () => {
    if (micOn) {
      // 关闭麦克风
      stopMicDetect();
      setMicOn(false);
    } else {
      // 打开麦克风并检测
      setMicOn(true);
      startMicDetect();
    }
  };

  // 初始化时自动检测麦克风
  useEffect(() => {
    startMicDetect();
    return () => { stopMicDetect(); };
  }, []);

  // AI 朗读题目
  const askQuestion = useCallback((idx) => {
    const q = questions[idx];
    if (!q) return;

    isEvaluatingRef.current = false;
    setPhase('asking');
    setActiveTab(idx);
    setTranscript('');
    setInterimText('');
    setManualText('');
    setSttError(null);
    transcriptRef.current = '';

    // TTS 朗读，读完后直接开始聆听（不加 setTimeout）
    speechService.speak(q.question, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => {
        setIsSpeaking(false);
        startListening();
      },
      onError: () => {
        // TTS 出错也直接进入聆听
        setIsSpeaking(false);
        startListening();
      },
    });
  }, [questions]);

  // 开始语音识别
  const startListening = () => {
    setPhase('listening');
    setTranscript('');
    setInterimText('');
    setSttError(null);
    setAudioActive(false);
    transcriptRef.current = '';
    questionStartMarkRef.current = elapsedTime; // 记录开始作答时间

    speechService.startListening({
      onStart: () => {
        console.log('[InterviewRoom] STT started');
      },
      onAudioStart: () => {
        setAudioActive(true);
        console.log('[InterviewRoom] Audio capturing');
      },
      onResult: (text) => {
        transcriptRef.current += (transcriptRef.current ? ' ' : '') + text;
        setTranscript(transcriptRef.current);
      },
      onInterim: (text) => {
        setInterimText(text);
      },
      onEnd: () => {
        setAudioActive(false);
        // 有内容则自动进入评分
        if (transcriptRef.current.trim().length > 0) {
          finishAnswer();
        }
      },
      onError: (errorType, message) => {
        setAudioActive(false);
        console.warn('[InterviewRoom] STT error:', errorType, message);

        if (errorType === 'not-supported') {
          setSttError('当前浏览器不支持语音识别，请使用文字输入');
        } else if (errorType === 'not-allowed') {
          setSttError(message || '麦克风权限被拒绝');
        } else if (errorType === 'start-failed') {
          setSttError('语音识别启动失败: ' + (message || ''));
        } else {
          setSttError('语音识别出错: ' + errorType);
        }
      },
    });
  };

  // 手动提交回答（语音或文字）
  const submitAnswer = () => {
    const text = manualText.trim() || transcriptRef.current || transcript || interimText;
    if (text) {
      transcriptRef.current = text;
      setTranscript(text);
      finishAnswer();
    }
  };

  // 文本输入变化
  const handleManualInput = (e) => {
    setManualText(e.target.value);
    // 同步到 transcriptRef 以便 submitAnswer 使用
    transcriptRef.current = e.target.value;
  };

  // AI 评分
  const evaluateAnswer = async () => {
    setPhase('scoring');
    setIsSpeaking(false);

    const answerText = transcriptRef.current || transcript || manualText;
    const q = questions[currentIdx];

    if (!answerText?.trim()) {
      // 没有回答内容
      isEvaluatingRef.current = false;
      if (isRetryModeRef.current) {
        isRetryModeRef.current = false;
        setPhase('done');
        return;
      }
      // 正常流程：跳到下一题或结束
      if (currentIdx + 1 < totalQuestions) {
        const nextIdx = currentIdx + 1;
        setCurrentIdx(nextIdx);
        askQuestion(nextIdx);
      } else {
        setPhase('done');
        onComplete && onComplete(history, elapsedTime);
      }
      return;
    }

    try {
      const evaluation = await aiService.evaluateAnswer(
        q.question,
        answerText,
        jdAnalysis
      );

      const entry = {
        question: q.question,
        answer: answerText,
        type: q.type,
        typeLabel: q.typeLabel,
        evaluation,
        duration: questionStartMarkRef.current != null ? elapsedTime - questionStartMarkRef.current : null,
      };

      const newHistory = [...history, entry];
      setHistory(newHistory);
      setRetryRef(null); // 清除重新作答参考

      // 语音反馈
      const feedbackText = `你的回答得分 ${evaluation.scores?.overall || 0} 分。${evaluation.strengths?.[0] || ''}。${evaluation.improvements?.[0] || ''}`;

      speechService.speak(feedbackText, {
        onStart: () => setIsSpeaking(true),
        onEnd: () => {
          setIsSpeaking(false);
          isEvaluatingRef.current = false;

          if (isRetryModeRef.current) {
            // 重新作答模式：停留在当前题，回到 done 让用户浏览
            isRetryModeRef.current = false;
            setPhase('done');
            return;
          }

          // 正常流程：下一题或结束
          if (currentIdx + 1 < totalQuestions) {
            const nextIdx = currentIdx + 1;
            setCurrentIdx(nextIdx);
            askQuestion(nextIdx);
          } else {
            setPhase('done');
            speechService.speak('面试结束，感谢你的参与！祝你面试顺利！', {
              onStart: () => setIsSpeaking(true),
              onEnd: () => setIsSpeaking(false),
            });
            onComplete && onComplete(newHistory, elapsedTime);
          }
        },
        onError: () => {
          setIsSpeaking(false);
          isEvaluatingRef.current = false;

          if (isRetryModeRef.current) {
            isRetryModeRef.current = false;
            setPhase('done');
            return;
          }

          if (currentIdx + 1 < totalQuestions) {
            const nextIdx = currentIdx + 1;
            setCurrentIdx(nextIdx);
            askQuestion(nextIdx);
          } else {
            setPhase('done');
            onComplete && onComplete(newHistory, elapsedTime);
          }
        },
      });
    } catch (err) {
      console.error('[InterviewRoom] Evaluation error:', err);
      isEvaluatingRef.current = false;

      if (isRetryModeRef.current) {
        isRetryModeRef.current = false;
        setPhase('done');
        return;
      }

      if (currentIdx + 1 < totalQuestions) {
        const nextIdx = currentIdx + 1;
        setCurrentIdx(nextIdx);
        askQuestion(nextIdx);
      } else {
        setPhase('done');
        onComplete && onComplete(history, elapsedTime);
      }
    }
  };

  // 始终保持 ref 指向最新的 evaluateAnswer
  evaluateAnswerRef.current = evaluateAnswer;

  // 格式化时间
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 格式化答题时长
  const formatDuration = (seconds) => {
    if (seconds == null) return '--:--';
    if (seconds < 60) return `${seconds}秒`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}分${s}秒` : `${m}分`;
  };

  // 重新作答某道题
  const handleReAnswer = useCallback((tabIdx) => {
    const q = questions[tabIdx];
    if (!q) return;

    // 标记为重新作答模式（评估后不自动跳转）
    isRetryModeRef.current = true;

    // 关闭完成横幅
    setShowDoneBanner(false);

    // 暂存上次的回答作为参考
    const oldEntry = history.find(h => h.question === q.question);
    if (oldEntry) {
      setRetryRef({
        questionIdx: tabIdx,
        answer: oldEntry.answer,
        evaluation: oldEntry.evaluation,
        duration: oldEntry.duration || null,
      });
    }

    // 移除该题的历史记录
    setHistory(prev => prev.filter(h => h.question !== q.question));

    // 停止当前所有语音活动
    speechService.stopSpeaking();
    speechService.stopListening();
    setIsSpeaking(false);
    setAudioActive(false);

    // 重新定位到该题并开始
    setCurrentIdx(tabIdx);
    askQuestion(tabIdx);
  }, [questions, history, askQuestion]);

  // 退出面试间
  const handleExit = () => {
    speechService.stopSpeaking();
    speechService.stopListening();
    stopCamera();
    onExit && onExit();
  };

  // 显示的答案文本（语音识别结果或手动输入）
  const displayText = transcript || interimText || manualText;

  return (
    <div className="ir-room">
      {/* 顶部信息栏 */}
      <div className="ir-topbar">
        <div className="ir-topbar-left">
          <div className="ir-logo">AI</div>
          <span className="ir-title">AI 模拟面试</span>
        </div>
        <div className="ir-topbar-center">
          <span className="ir-timer">{formatTime(elapsedTime)}</span>
          <span className="ir-progress">
            第 {currentIdx + 1} / {totalQuestions} 题
          </span>
        </div>
        <div className="ir-topbar-right">
          <button
            className={`ir-icon-btn ${showSubtitle ? 'ir-icon-btn--active' : ''}`}
            onClick={() => setShowSubtitle(!showSubtitle)}
            title="字幕"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 14h2M10 14h4M16 14h2M6 18h12" />
            </svg>
          </button>
          <button className="ir-exit-btn" onClick={handleExit}>
            结束面试
          </button>
        </div>
      </div>

      {/* 视频区域 - AI头像 + 摄像头 各占一半 */}
      <div className="ir-video-row">
        {/* 左：AI 面试官 */}
        <div className="ir-video-cell">
          <div className="ir-video-inner">
            <InterviewAvatar isSpeaking={isSpeaking} size={220} gender={gender} />
          </div>
          <div className="ir-video-label">
            <span className={`ir-video-dot ${isSpeaking ? 'ir-video-dot--active' : ''}`} />
            AI 面试官
            <span className="ir-video-status">
              {phase === 'asking' ? '提问中' :
               phase === 'listening' ? (audioActive ? '聆听中' : '等待中') :
               phase === 'scoring' ? '评估中' :
               phase === 'done' ? '已结束' : '准备中'}
            </span>
          </div>
        </div>

        {/* 右：用户摄像头 */}
        <div className="ir-video-cell">
          <div className={`ir-camera-box ${!cameraOn ? 'ir-camera-box--off' : ''}`}>
            {cameraOn ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="ir-camera-video"
              />
            ) : (
              <div className="ir-camera-off">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5">
                  <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <span>已关闭</span>
              </div>
            )}
            {cameraError && (
              <div className="ir-camera-error">{cameraError}</div>
            )}
          </div>
          <div className="ir-video-label">
            <span className="ir-video-dot ir-video-dot--user" />
            我
          </div>
        </div>
      </div>

      {/* 题目 Tab 栏 */}
      <div className="ir-tabs">
        {questions.map((q, i) => {
          const isDone = history.some(h => h.question === q.question);
          const isCurrent = i === activeTab;
          return (
            <div
              key={i}
              className={`ir-tab ${isCurrent ? 'ir-tab--active' : ''} ${isDone ? 'ir-tab--done' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              {isDone && <span className="ir-tab-check">✓</span>}
              <span className={`ir-tab-tag ir-tab-tag--${q.type}`}>
                {q.type === 'technical' ? '技' : q.type === 'project' ? '项' : q.type === 'scenario' ? '景' : '行'}
              </span>
              第{i + 1}题
            </div>
          );
        })}
      </div>

      {/* 文字区域 - 可滚动 */}
      <div className="ir-text-area">
        {/* 当前 Tab 对应的题目 */}
        {(() => {
          const tabQ = questions[activeTab];
          if (!tabQ) return null;
          const tabHistory = history.find(h => h.question === tabQ.question);
          const isLiveTab = activeTab === currentIdx && phase !== 'done' && phase !== 'intro';
          const isFuture = !tabHistory && !isLiveTab;
          const liveDuration = isLiveTab && questionStartMarkRef.current != null
            ? elapsedTime - questionStartMarkRef.current : null;

          return (
            <>
              {/* 题目内容 */}
              <div className="ir-subtitle-box">
                <div className="ir-subtitle-label">
                  <span className={`ir-q-tag ir-q-tag--${tabQ.type}`}>
                    {tabQ.typeLabel}
                  </span>
                  面试官提问
                  {tabHistory?.duration != null && (
                    <span className="ir-duration-badge">⏱ {formatDuration(tabHistory.duration)}</span>
                  )}
                </div>
                <div className="ir-subtitle-text">{tabQ.question}</div>
              </div>

              {/* AI 正在提问 */}
              {isLiveTab && phase === 'asking' && (
                <div className="ir-action-bar">
                  <span className="ir-action-hint">
                    <span className={`ir-video-dot ${isSpeaking ? 'ir-video-dot--active' : ''}`} />
                    AI 面试官正在提问...
                  </span>
                </div>
              )}

              {/* 已完成的历史回答 */}
              {tabHistory && tabHistory.evaluation && (
                <div className="ir-answer-box">
                  <div className="ir-answer-label">📝 你的回答</div>
                  <div className="ir-answer-text">{tabHistory.answer}</div>
                  {tabHistory.evaluation.scores && (
                    <div className="ir-score-row">
                      <span className="ir-score-label">得分</span>
                      <span className="ir-score-value">{tabHistory.evaluation.scores.overall}</span>
                      {tabHistory.duration != null && (
                        <span className="ir-score-duration">用时 {formatDuration(tabHistory.duration)}</span>
                      )}
                    </div>
                  )}
                  {tabHistory.evaluation.strengths?.length > 0 && (
                    <div className="ir-eval-item">
                      <span className="ir-eval-tag ir-eval-tag--good">亮点</span>
                      {tabHistory.evaluation.strengths.map((s, i) => (
                        <span key={i} className="ir-eval-text">{s}</span>
                      ))}
                    </div>
                  )}
                  {tabHistory.evaluation.improvements?.length > 0 && (
                    <div className="ir-eval-item">
                      <span className="ir-eval-tag ir-eval-tag--tip">建议</span>
                      {tabHistory.evaluation.improvements.map((s, i) => (
                        <span key={i} className="ir-eval-text">{s}</span>
                      ))}
                    </div>
                  )}
                  <div className="ir-retry-row">
                    <button
                      className="ir-retry-btn"
                      onClick={() => handleReAnswer(activeTab)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 4v6h6" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                      </svg>
                      重新作答
                    </button>
                  </div>
                </div>
              )}

              {/* 重新作答时展示上次回答作为参考 */}
              {isLiveTab && retryRef && retryRef.questionIdx === activeTab && (
                <div className="ir-retry-ref">
                  <div className="ir-retry-ref-header">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4M12 8h.01" />
                    </svg>
                    上次回答参考
                    {retryRef.evaluation?.scores && (
                      <span className="ir-retry-ref-score">{retryRef.evaluation.scores.overall} 分</span>
                    )}
                    {retryRef.duration != null && (
                      <span className="ir-retry-ref-score">用时 {formatDuration(retryRef.duration)}</span>
                    )}
                  </div>
                  <div className="ir-retry-ref-text">{retryRef.answer}</div>
                  {retryRef.evaluation?.improvements?.length > 0 && (
                    <div className="ir-retry-ref-tips">
                      {retryRef.evaluation.improvements.map((s, i) => (
                        <span key={i} className="ir-retry-ref-tip">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 当前正在进行的回答 */}
              {isLiveTab && phase === 'listening' && !tabHistory && (
                <div className="ir-answer-box">
                  <div className="ir-answer-label">
                    {audioActive ? '🎤 正在聆听...' : '🎤 等待语音输入...'}
                    {liveDuration != null && (
                      <span className="ir-live-duration">{formatDuration(liveDuration)}</span>
                    )}
                  </div>

                  {sttError && (
                    <div className="ir-stt-error">
                      <span>⚠️ {sttError}</span>
                      <span className="ir-stt-hint">请使用下方文字输入框</span>
                    </div>
                  )}

                  <div className="ir-answer-text">
                    {displayText || <span className="ir-placeholder">
                      {sttError ? '请在下方输入你的回答...' : '等待语音输入或手动输入...'}
                    </span>}
                    {interimText && !transcript && <span className="ir-interim">{interimText}</span>}
                  </div>

                  {phase === 'listening' && (
                    <textarea
                      className="ir-manual-input"
                      placeholder={sttError ? '在此输入你的回答...' : '或在此手动输入回答...'}
                      value={manualText}
                      onChange={handleManualInput}
                      rows={3}
                    />
                  )}

                  {/* 结束作答 + 提交回答 */}
                  <div className="ir-action-bar">
                    <button className="ir-action-btn ir-action-btn--stop" onClick={finishAnswer}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                      结束作答
                    </button>
                    <button className="ir-action-btn ir-action-btn--submit" onClick={submitAnswer}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                      </svg>
                      提交回答
                    </button>
                  </div>
                </div>
              )}

              {/* 评估中 */}
              {isLiveTab && phase === 'scoring' && !tabHistory && (
                <div className="ir-answer-box">
                  <div className="ir-answer-label">⏳ AI 正在评估你的回答...</div>
                  <div className="ir-answer-text">
                    {transcript || manualText || <span className="ir-placeholder">回答内容处理中...</span>}
                  </div>
                </div>
              )}

              {/* 未作答的题目 - 开始作答 */}
              {isFuture && !tabHistory && (
                <div className="ir-answer-box">
                  <div className="ir-action-bar ir-action-bar--center">
                    <button className="ir-action-btn ir-action-btn--start" onClick={() => {
                      speechService.stopSpeaking();
                      speechService.stopListening();
                      if (phase === 'done') isRetryModeRef.current = true;
                      setShowDoneBanner(false);
                      setCurrentIdx(activeTab);
                      askQuestion(activeTab);
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      开始作答
                    </button>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* 底部控制栏 */}
      <div className="ir-controls">
        {phase === 'done' ? (
          <>
            <div className="ir-done-summary">
              <span>共 {history.length}/{totalQuestions} 题已作答</span>
              {history.length > 0 && (
                <span>平均 {Math.round(history.reduce((s, h) => s + (h.evaluation?.scores?.overall || 0), 0) / history.length)} 分</span>
              )}
            </div>
            <button
              className="ir-ctrl-btn ir-ctrl-btn--submit"
              onClick={() => onComplete && onComplete(history, elapsedTime)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span>查看面试报告</span>
            </button>
          </>
        ) : (
          <>
            <button
              className={`ir-ctrl-btn ${!micOn ? 'ir-ctrl-btn--off' : ''} ${micOn && micLevel > 5 ? 'ir-ctrl-btn--active' : ''}`}
              onClick={toggleMic}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 19v4M8 23h8" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
              <span>麦克风{micOn ? '开' : '关'}</span>
              {micOn && micLevel > 0 && (
                <span className="ir-mic-level">
                  <span className="ir-mic-level-bar" style={{ height: `${Math.min(16, 4 + micLevel * 0.12)}px` }} />
                  <span className="ir-mic-level-bar" style={{ height: `${Math.min(16, 4 + micLevel * 0.16)}px` }} />
                  <span className="ir-mic-level-bar" style={{ height: `${Math.min(16, 4 + micLevel * 0.1)}px` }} />
                </span>
              )}
            </button>
            {micOn && micDetected === false && (
              <span className="ir-mic-warn" title={micErrorMsg}>⚠ 麦克风不可用</span>
            )}
            {micOn && micDetected === null && (
              <span className="ir-mic-checking">检测中...</span>
            )}

            <button
              className={`ir-ctrl-btn ${!cameraOn ? 'ir-ctrl-btn--off' : ''}`}
              onClick={toggleCamera}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
              <span>摄像头{cameraOn ? '开' : '关'}</span>
            </button>
          </>
        )}
      </div>

      {/* 面试结束横幅 - 可关闭，不阻挡浏览 */}
      {phase === 'done' && showDoneBanner && (
        <div className="ir-done-banner">
          <div className="ir-done-banner-content">
            <span className="ir-done-banner-icon">🎉</span>
            <div className="ir-done-banner-info">
              <strong>面试完成！</strong>
              <span>共 {totalQuestions} 题，用时 {formatTime(elapsedTime)}
                {history.length > 0 && (
                  <>，平均 {Math.round(history.reduce((sum, h) => sum + (h.evaluation?.scores?.overall || 0), 0) / history.length)} 分</>
                )}
              </span>
            </div>
            <button
              className="ir-done-banner-report"
              onClick={() => onComplete && onComplete(history, elapsedTime)}
            >
              查看报告
            </button>
            <button
              className="ir-done-banner-close"
              onClick={() => setShowDoneBanner(false)}
              title="关闭"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterviewRoom;
