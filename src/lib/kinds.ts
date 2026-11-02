import type { EquipKind, EquipLocation } from '../types';

/** Categorias de equipamento (sem ícones, para a camada de dados). */
export const KIND_INFO: Record<EquipKind, { label: string; group: string; hasHourMeter: boolean }> = {
  tmx: { label: 'Rebocador TMX 150', group: 'Rebocadores TMX 150', hasHourMeter: true },
  nbl: { label: 'Esteira TLD NBL', group: 'Esteiras TLD NBL', hasHourMeter: true },
  gpu: { label: 'GPU (fonte de energia)', group: 'GPUs', hasHourMeter: true },
  escada: { label: 'Escada de embarque', group: 'Escadas de embarque', hasHourMeter: false },
  outro: { label: 'Outro equipamento', group: 'Outros equipamentos', hasHourMeter: false },
};

export const KIND_ORDER: EquipKind[] = ['tmx', 'nbl', 'gpu', 'escada', 'outro'];

export const LOCATION_LABEL: Record<EquipLocation, string> = {
  oficina: 'Oficina',
  operacao: 'Operação',
};
