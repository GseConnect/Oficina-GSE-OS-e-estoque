import type { Snapshot, WorkOrder } from '../types';

/** "2 × Filtro de óleo do motor, 1 × Fusível 30 A" */
export const partsText = (o: WorkOrder, snap: Snapshot) =>
  o.parts.map((x) => `${x.qty} × ${snap.parts.find((p) => p.id === x.partId)?.name ?? x.partId}`).join(', ');
