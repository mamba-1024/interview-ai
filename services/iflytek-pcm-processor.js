// ============================================================
// iFlytek PCM AudioWorklet Processor
// 在音频线程批量采集并重采样到 16kHz，减少主线程 postMessage 频率
// ============================================================

const TARGET_RATE = 16000;
const FRAME_SAMPLES = 640; // 40ms @ 16kHz

class IflytekPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.srcPos = 0;
    this.carry = new Float32Array(0);
    this.outBuf = new Int16Array(FRAME_SAMPLES);
    this.outIdx = 0;
  }

  _toInt16(v) {
    v = Math.max(-1, Math.min(1, v));
    return v < 0 ? v * 0x8000 : v * 0x7fff;
  }

  _sampleAt(input, pos) {
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = input[idx] ?? 0;
    const s1 = input[idx + 1] ?? s0;
    return s0 + (s1 - s0) * frac;
  }

  _drainResample(input) {
    let pos = this.srcPos;

    while (pos + 1 < input.length) {
      this.outBuf[this.outIdx++] = this._toInt16(this._sampleAt(input, pos));
      pos += this.ratio;

      if (this.outIdx >= FRAME_SAMPLES) {
        const frame = this.outBuf.slice(0);
        this.port.postMessage(frame, [frame.buffer]);
        this.outBuf = new Int16Array(FRAME_SAMPLES);
        this.outIdx = 0;
      }
    }

    const consumed = Math.floor(pos);
    this.srcPos = pos - consumed;
    return consumed;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel?.length) return true;

    let input;
    if (this.carry.length) {
      input = new Float32Array(this.carry.length + channel.length);
      input.set(this.carry);
      input.set(channel, this.carry.length);
      this.carry = new Float32Array(0);
    } else {
      input = channel;
    }

    const consumed = this._drainResample(input);
    if (consumed < input.length) {
      this.carry = input.slice(consumed);
    }

    return true;
  }
}

registerProcessor('iflytek-pcm-processor', IflytekPcmProcessor);
