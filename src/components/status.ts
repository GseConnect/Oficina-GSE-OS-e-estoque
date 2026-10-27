import {
  CircleCheck,
  Clock,
  Disc3,
  Droplet,
  LifeBuoy,
  Luggage,
  Mic,
  Power,
  TriangleAlert,
  Truck,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { EquipKind, EquipStatus, OrderStatus, Part } from '../types';

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

export const KIND: Record<EquipKind, { label: string; group: string; icon: LucideIcon }> = {
  tmx: { label: 'Rebocador TMX 150', group: 'Rebocadores TMX 150', icon: Truck },
  nbl: { label: 'Esteira TLD NBL', group: 'Esteiras TLD NBL', icon: Luggage },
};

export const PROBLEMS: Array<{ id: string; label: string; icon: LucideIcon; sub?: string; tone: Tone }> = [
  { id: 'naoliga', label: 'Não liga', icon: Power, tone: 'blue' },
  { id: 'freio', label: 'Freio', icon: Disc3, tone: 'blue' },
  { id: 'pneu', label: 'Pneu', icon: LifeBuoy, tone: 'blue' },
  { id: 'vazamento', label: 'Vazamento', icon: Droplet, tone: 'blue' },
  { id: 'eletrica', label: 'Parte elétrica', icon: Zap, tone: 'blue' },
  { id: 'outro', label: 'Outro', sub: 'Falar o problema', icon: Mic, tone: 'coral' },
];

/** Equipamentos que aparecem como "QR de teste" na abertura de OS. */
export const DEMO_EQUIP = ['TMX-04', 'TMX-07', 'NBL-06', 'NBL-09'];
/** Peças que aparecem como "QR de teste" na retirada. */
export const DEMO_PARTS = ['P1', 'P3', 'P4', 'P5', 'P6', 'P7'];
