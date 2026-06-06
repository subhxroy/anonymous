/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class SoundEffects {
  private static ctx: AudioContext | null = null;
  private static isMuted = localStorage.getItem('anonym_muted') === 'true';

  private static init() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not supported in this browser:', e);
      }
    }
  }

  public static toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    localStorage.setItem('anonym_muted', String(this.isMuted));
    return this.isMuted;
  }

  public static getMuted(): boolean {
    return this.isMuted;
  }

  private static playTone(freqs: number[], type: OscillatorType, duration: number, gains: number[]) {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;
      
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freqs[0], this.ctx.currentTime);
      if (freqs.length > 1) {
        osc.frequency.exponentialRampToValueAtTime(freqs[1], this.ctx.currentTime + duration);
      }

      gainNode.gain.setValueAtTime(gains[0], this.ctx.currentTime);
      if (gains.length > 1) {
        gainNode.gain.exponentialRampToValueAtTime(gains[1], this.ctx.currentTime + duration);
      } else {
        gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      }

      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio Tone failed to play:', e);
    }
  }

  // Short sci-fi click/beep
  public static playClick() {
    this.playTone([800, 1000], 'sine', 0.05, [0.1, 0.0001]);
  }

  // Upward swoop chime
  public static playCreate() {
    this.playTone([220, 880], 'triangle', 0.35, [0.15, 0.0001]);
  }

  // Ascending musical chime (harmony chord)
  public static playDecrypt() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const notes = [261.63, 329.63, 392.00, 523.25]; // C major triad
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gainNode = this.ctx!.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + idx * 0.08);

        gainNode.gain.setValueAtTime(0, this.ctx!.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.08, this.ctx!.currentTime + idx * 0.08 + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx!.currentTime + idx * 0.08 + 0.4);

        osc.connect(gainNode);
        gainNode.connect(this.ctx!.destination);

        osc.start(this.ctx!.currentTime + idx * 0.08);
        osc.stop(this.ctx!.currentTime + idx * 0.08 + 0.4);
      });
    } catch {}
  }

  // White noise explosion for self-destruct
  public static playBurn() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const duration = 0.8;
      const bufferSize = this.ctx.sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Generate random white noise waves
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + duration);

      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      noiseNode.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      noiseNode.start();
      noiseNode.stop(this.ctx.currentTime + duration);
    } catch {}
  }
}
