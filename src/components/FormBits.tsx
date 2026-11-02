import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { formatHours } from '../lib/format';
import type { EquipLocation } from '../types';
import { LOCATION } from './status';

export function FieldBlock({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="fld">
      <span className="fld-l">{label}</span>
      {children}
      {hint && <span className="fld-h">{hint}</span>}
    </div>
  );
}

/** Horímetro com teclado numérico do celular. */
export function HourInput({
  label = 'Horímetro',
  value,
  onChange,
  lastKnown,
  required,
  warning,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  lastKnown?: number | null;
  required?: boolean;
  warning?: string;
}) {
  return (
    <div className="fld">
      <span className="fld-l">
        {label}
        {!required && <small> (se tiver)</small>}
      </span>
      <div className="input-wrap">
        <input
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          inputMode="decimal"
          autoComplete="off"
          placeholder="Ex.: 1234,5"
          aria-label={label}
        />
        <span className="suffix" aria-hidden>
          h
        </span>
      </div>
      {lastKnown != null && <span className="fld-h">Último registrado: {formatHours(lastKnown)}</span>}
      {warning && <span className="fld-warn">{warning}</span>}
    </div>
  );
}

/** Onde o equipamento está: dois botões grandes. */
export function LocationToggle({
  value,
  onChange,
  compact,
}: {
  value: EquipLocation;
  onChange: (v: EquipLocation) => void;
  compact?: boolean;
}) {
  return (
    <div className={cx('toggle', compact && 'is-compact')} role="group" aria-label="Localização do equipamento">
      {(['oficina', 'operacao'] as const).map((id) => {
        const L = LOCATION[id];
        return (
          <button
            key={id}
            type="button"
            className={cx('toggle-btn', value === id && 'is-on')}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            <L.icon size={compact ? 18 : 24} aria-hidden />
            {compact ? L.label : L.long}
          </button>
        );
      })}
    </div>
  );
}
