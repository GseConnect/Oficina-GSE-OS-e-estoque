import {
  ChevronsUp,
  CircleCheck,
  Clock,
  Cog,
  Disc3,
  Droplet,
  LifeBuoy,
  Luggage,
  Mic,
  Plane,
  PlugZap,
  Power,
  TriangleAlert,
  Truck,
  Warehouse,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { EquipKind, EquipLocation, EquipStatus, OrderStatus, Part } from '../types';
import { KIND_INFO, LOCATION_LABEL } from '../lib/kinds';

export type Tone = 'coral' | 'amber' | 'blue' | 'red' | 'green' | 'neutral';

export interface StatusInfo {
  label: string;
  tone: Tone;
  icon: LucideIcon;
}

export const EQUIP_STATUS: Record<EquipStatus, StatusInfo> = {
  ok: { label: 'Disponível', tone: 'green', icon: CircleCheck },
  down: { label: 'Baixado', tone: 'red', icon: Wrench },
  wait: { label: 'Aguardando peça', tone: 'amber', icon: Clock },
};

export const ORDER_STATUS: Record<OrderStatus, StatusInfo> = {
  open: { label: 'Em execução', tone: 'blue', icon: Wrench },
  wait: { label: 'Aguardando peça', tone: 'amber', icon: Clock },
  closed: { label: 'Fechada', tone: 'green', icon: CircleCheck },
};

export type PartLevel = 'ok' | 'low' | 'out';
export const partLevel = (p: Part): PartLevel => (p.qty === 0 ? 'out' : p.qty < p.min ? 'low' : 'ok');
export const PART_LEVEL: Record<PartLevel, StatusInfo> = {
  ok: { label: 'OK', tone: 'green', icon: CircleCheck },
  low: { label: 'Abaixo do mínimo', tone: 'amber', icon: TriangleAlert },
  out: { label: 'Em falta', tone: 'red', icon: TriangleAlert },
};

const KIND_ICON: Record<EquipKind, LucideIcon> = {
  tmx: Truck,
  nbl: Luggage,
  gpu: PlugZap,
  escada: ChevronsUp,
  outro: Cog,
};

export const KIND: Record<EquipKind, { label: string; group: string; hasHourMeter: boolean; icon: LucideIcon }> = {
  tmx: { ...KIND_INFO.tmx, icon: KIND_ICON.tmx },
  nbl: { ...KIND_INFO.nbl, icon: KIND_ICON.nbl },
  gpu: { ...KIND_INFO.gpu, icon: KIND_ICON.gpu },
  escada: { ...KIND_INFO.escada, icon: KIND_ICON.escada },
  outro: { ...KIND_INFO.outro, icon: KIND_ICON.outro },
};
export { KIND_ORDER } from '../lib/kinds';

export const LOCATION: Record<EquipLocation, { label: string; long: string; icon: LucideIcon }> = {
  oficina: { label: LOCATION_LABEL.oficina, long: 'Na oficina', icon: Warehouse },
  operacao: { label: LOCATION_LABEL.operacao, long: 'Na operação (rampa)', icon: Plane },
};

export const PROBLEMS: Array<{ id: string; label: string; icon: LucideIcon; sub?: string; tone: Tone }> = [
  { id: 'naoliga', label: 'Não liga', icon: Power, tone: 'blue' },
  { id: 'freio', label: 'Freio', icon: Disc3, tone: 'blue' },
  { id: 'pneu', label: 'Pneu', icon: LifeBuoy, tone: 'blue' },
  { id: 'vazamento', label: 'Vazamento', icon: Droplet, tone: 'blue' },
  { id: 'eletrica', label: 'Parte elétrica', icon: Zap, tone: 'blue' },
  { id: 'outro', label: 'Outro', sub: 'Falar o problema', icon: Mic, tone: 'coral' },
];

/** Atalhos para descrever o serviço no fechamento, sem precisar digitar tudo. */
export const SERVICE_CHIPS = [
  'Troca de peça',
  'Ajuste e regulagem',
  'Reparo elétrico',
  'Reparo hidráulico',
  'Troca de pneu',
  'Limpeza e lubrificação',
];

/** Equipamentos que aparecem como "QR de teste" na abertura de OS. */
export const DEMO_EQUIP = ['TMX-04', 'TMX-07', 'NBL-06', 'NBL-09'];
/** Peças que aparecem como "QR de teste" na retirada. */
export const DEMO_PARTS = ['P1', 'P3', 'P4', 'P5', 'P6', 'P7'];
