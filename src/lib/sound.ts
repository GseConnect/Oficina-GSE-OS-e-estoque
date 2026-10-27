/** Alerta sonoro curto do painel (sem arquivos de áudio). */
type WithWebkit = Window & { webkitAudioContext?: typeof AudioContext };
let ctx: AudioContext | null = null;

/** O navegador só libera o som depois de um clique; chame isto em qualquer toque na página. */
export function unlockAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as WithWebkit).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* sem áudio neste navegador */
  }
}

export const audioReady = () => !!ctx && ctx.state === 'running';

export function chime(): void {
  if (!ctx || ctx.state !== 'running') return;
  const c = ctx;
  const t0 = c.currentTime;
  [784, 1175].forEach((freq, i) => {
    const t = t0 + i * 0.16;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.36);
  });
}
