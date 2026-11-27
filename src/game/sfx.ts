// WebAudio 절차적 효과음. 외부 오디오 파일 없음.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function noiseBuffer(c: AudioContext, dur: number): AudioBuffer {
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function env(c: AudioContext, g: GainNode, peak: number, attack: number, release: number) {
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
}

function noise(dur: number, freq: number, q: number, peak: number, type: BiquadFilterType = "bandpass") {
  const c = ac();
  if (!c || !master) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, dur);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  env(c, g, peak, 0.005, dur);
  src.connect(f).connect(g).connect(master);
  src.start();
}

function tone(freq: number, toFreq: number, dur: number, peak: number, type: OscillatorType = "sine", delay = 0) {
  const c = ac();
  if (!c || !master) return;
  const o = c.createOscillator();
  o.type = type;
  const t = c.currentTime + delay;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  swing: () => noise(0.12, 1800, 1.2, 0.25),
  heavySwing: () => noise(0.22, 900, 0.8, 0.35),
  hit: () => { noise(0.08, 2500, 2, 0.5); tone(180, 70, 0.1, 0.4, "square"); },
  heavyHit: () => { noise(0.15, 1200, 1, 0.7); tone(120, 40, 0.2, 0.6, "square"); },
  stagger: () => tone(600, 1400, 0.25, 0.25, "triangle"),
  dodge: () => noise(0.18, 600, 0.7, 0.2, "lowpass"),
  hurt: () => { tone(220, 90, 0.18, 0.4, "sawtooth"); noise(0.1, 800, 1, 0.3); },
  kill: () => { tone(500, 120, 0.25, 0.3, "triangle"); noise(0.25, 3000, 0.6, 0.2); },
  levelUp: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.25, 0.25, "triangle", i * 0.09)),
  charge: () => tone(200, 500, 0.3, 0.12, "sine"),
  spit: () => tone(400, 150, 0.15, 0.2, "sawtooth"),
  telegraph: () => tone(900, 700, 0.12, 0.08, "square"),
};
