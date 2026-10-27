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
