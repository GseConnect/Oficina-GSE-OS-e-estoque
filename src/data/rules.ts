import type { CloseInput, LogEntry, NewEquipmentInput, NewTechnicianInput, OrderPart, Part, WorkOrder } from '../types';
import { formatHours } from '../lib/format';
import { KIND_INFO } from '../lib/kinds';

/** Erro com mensagem pronta para mostrar na tela. */
export class AppError extends Error {}

export const logText = {
  open: (who: string, id: number, equip: string, problem: string) =>
    `${who} abriu a OS ${id} para o ${equip} (${problem})`,
  pick: (who: string, qty: number, part: string, os: number) => `${who} retirou ${qty} × ${part} para a OS ${os}`,
  undo: (who: string, qty: number, part: string, os: number) =>
    `${who} desfez a retirada de ${qty} × ${part} da OS ${os}`,
  wait: (os: number, equip: string, part: string) => `A OS ${os} do ${equip} está aguardando ${part}`,
  close: (who: string, os: number, equip: string) => `${who} fechou a OS ${os} e liberou o ${equip}`,
  equipment: (e: NewEquipmentInput) => `Equipamento ${e.id} cadastrado (${KIND_INFO[e.kind].label})`,
  technician: (t: NewTechnicianInput) => `Técnico ${t.name} (BP ${t.bp}) cadastrado`,
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

/** Fechamento: serviço descrito e horímetro final não menor que o da abertura. */
export function assertClose(o: WorkOrder, input: CloseInput): void {
  if (!input.serviceDone.trim()) throw new AppError('Descreva o serviço executado.');
  if (input.hourMeter !== null && o.hourMeterStart !== null && input.hourMeter < o.hourMeterStart) {
    throw new AppError(`O horímetro final não pode ser menor que o da abertura (${formatHours(o.hourMeterStart)}).`);
  }
}

export const normalizeEquipId = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, '-');

export function assertEquipmentInput(e: NewEquipmentInput): void {
  if (e.id.length < 3 || e.id.length > 12 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(e.id)) {
    throw new AppError('Use de 3 a 12 letras, números e hífen no prefixo, como TMX-09.');
  }
}

export function assertTechnicianInput(t: NewTechnicianInput): void {
  if (!/^\d{7}$/.test(t.bp)) throw new AppError('O BP tem 7 números.');
  if (t.name.trim().length < 3) throw new AppError('Escreva o nome completo do técnico.');
}

export const newLog = (kind: LogEntry['kind'], text: string, at: number): LogEntry => ({
  id: `${at}-${Math.random().toString(36).slice(2, 8)}`,
  at,
  kind,
  text,
});
