let audioCtx: AudioContext | null = null;

function getCtx() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/** Refined soft ping for unlocked country hover */
export function playHoverSound() {
  const ctx = getCtx();
  const t = ctx.currentTime;

  // Soft sine tone with gentle fade
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(580, t);
  osc.frequency.exponentialRampToValueAtTime(480, t + 0.12);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1200, t);
  filter.frequency.exponentialRampToValueAtTime(600, t + 0.15);
  filter.Q.setValueAtTime(1.5, t);

  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.07, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

  osc.start(t);
  osc.stop(t + 0.18);
}

/** Two-tone descending "restricted" buzz for locked country hover */
export function playHoverLockedSound() {
  const ctx = getCtx();
  const t = ctx.currentTime;

  // Low warning tone
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(300, t);
  osc1.frequency.exponentialRampToValueAtTime(180, t + 0.1);
  gain1.gain.setValueAtTime(0.03, t);
  gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc1.start(t);
  osc1.stop(t + 0.12);

  // Second pulse — slightly delayed
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(250, t + 0.06);
  osc2.frequency.exponentialRampToValueAtTime(150, t + 0.14);
  gain2.gain.setValueAtTime(0.022, t + 0.06);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc2.start(t + 0.06);
  osc2.stop(t + 0.15);
}

/** Minimal tap click */
export function playClickSound() {
  const ctx = getCtx();
  const t = ctx.currentTime;

  // Noise-like tap using high-frequency sine burst
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1000, t);

  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1000, t);
  filter.Q.setValueAtTime(0.5, t);

  gain.gain.setValueAtTime(0.03, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

  osc.start(t);
  osc.stop(t + 0.03);
}

/** Subtle tick for nav/button hover */
export function playNavHoverSound() {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(2000, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.03);

  gain.gain.setValueAtTime(0.04, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.04);
}
