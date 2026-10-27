import type { LogEntry, OrderPart, Part, WorkOrder } from '../types';

/** Erro com mensagem pronta para mostrar ao técnico. */
export class AppError extends Error {}

export const logText = {
  open: (who: string, id: number, equip: string, problem: string) =>
    `${who} abriu a OS ${id} para o ${equip} (${problem})`,
  pick: (who: string, qty: number, part: string, os: number) => `${who} retirou ${qty} × ${part} para a OS ${os}`,
  undo: (who: string, qty: number, part: string, os: number) =>
    `${who} desfez a retirada de ${qty} × ${part} da OS ${os}`,
  wait: (os: number, equip: string, part: string) => `A OS ${os} do ${equip} está aguardando ${part}`,
  close: (who: string, os: number, equip: string) => `${who} fechou a OS ${os} e liberou o ${equip}`,
};

export function addPart(list: OrderPart[], partId: string, qty: number): OrderPart[] {
  const found = list.some((x) => x.partId === partId);
  const next = found
    ? list.map((x) => (x.partId === partId ? { ...x, qty: x.qty + qty } : x))
    : [...list, { partId, qty }];
  return next.filter((x) => x.qty > 0);
}

export function assertOpen(o: WorkOrder | undefined, osId: number): WorkOrder {
  if (!o) throw new AppError(`A OS ${osId} não foi encontrada.`);
  if (o.status === 'closed') throw new AppError(`A OS ${osId} já foi fechada.`);
  return o;
}

export function assertStock(p: Part | undefined, qty: number): Part {
  if (!p) throw new AppError('Peça não encontrada no estoque.');
  if (p.qty < qty)
    throw new AppError(p.qty === 0 ? `${p.name} está em falta.` : `Só há ${p.qty} de ${p.name} no estoque.`);
  return p;
}

export const newLog = (kind: LogEntry['kind'], text: string, at: number): LogEntry => ({
  id: `${at}-${Math.random().toString(36).slice(2, 8)}`,
  at,
  kind,
  text,
});
