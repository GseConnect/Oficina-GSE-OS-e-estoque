import type { User } from '../types';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "A, B e C" */
export const joinPt = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;

export function ago(ts: number, now: number): string {
  const d = Math.max(0, now - ts);
  if (d < MIN) return 'agora';
  if (d < HOUR) return `há ${Math.floor(d / MIN)} min`;
  if (d < DAY) return `há ${Math.floor(d / HOUR)} h`;
  const days = Math.floor(d / DAY);
  return `há ${days} ${plural(days, 'dia', 'dias')}`;
}

const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const clock = (ts: number) => timeFmt.format(ts);
export const longDay = (ts: number) => {
  const s = dayFmt.format(ts);
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const dateTime = (ts: number) => dateTimeFmt.format(ts);

export const firstName = (name: string) => (name.startsWith('BP ') ? name : name.split(' ')[0]);
export const whoOf = (u: User) => u.name ?? `BP ${u.bp}`;

const hourFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
export const formatHours = (h: number) => `${hourFmt.format(h)} h`;

/** Lê o horímetro digitado: aceita "1234", "1234,5", "1.234,5" e "1234.5". Devolve null se não for número. */
export function parseHours(text: string): number | null {
  const t = text.trim().replace(/\s|h$/gi, '');
  if (!t) return null;
  let norm: string;
  if (t.includes(',')) norm = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) norm = t.replace(/\./g, '');
  else norm = t;
  if (!/^\d+(\.\d+)?$/.test(norm)) return null;
  const n = Number(norm);
  return Number.isFinite(n) && n < 1_000_000 ? Math.round(n * 10) / 10 : null;
}

/** "35 min", "2 h 10 min", "1 dia e 3 h" */
export function duration(ms: number): string {
  const total = Math.max(1, Math.round(ms / MIN));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr ? `${d} ${plural(d, 'dia', 'dias')} e ${hr} h` : `${d} ${plural(d, 'dia', 'dias')}`;
}
