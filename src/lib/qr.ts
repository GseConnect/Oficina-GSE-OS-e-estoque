import type { Snapshot } from '../types';

/** Conteúdo gravado nas etiquetas impressas. */
export const equipPayload = (id: string) => `GSE:EQ:${id}`;
export const partPayload = (pn: string) => `GSE:PECA:${pn}`;

export type QrTarget = { kind: 'equip'; id: string } | { kind: 'part'; id: string };

/** Aceita "GSE:EQ:TMX-04", "GSE:PECA:PN-10021" e também só o código ("TMX-04", "PN-10021"). */
export function parseQr(raw: string, snap: Snapshot): QrTarget | null {
  const text = raw.trim().toUpperCase();
  const m = text.match(/^GSE:(EQ|PECA):(.+)$/);
  const body = m ? m[2].trim() : text;
  const type = m?.[1];
  if (type !== 'PECA') {
    const eq = snap.equipment.find((e) => e.id.toUpperCase() === body);
    if (eq) return { kind: 'equip', id: eq.id };
  }
  if (type !== 'EQ') {
    const part = snap.parts.find((p) => p.pn.toUpperCase() === body || p.id.toUpperCase() === body);
    if (part) return { kind: 'part', id: part.id };
  }
  return null;
}
