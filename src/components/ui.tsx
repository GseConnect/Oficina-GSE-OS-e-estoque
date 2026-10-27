import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, type LucideIcon } from 'lucide-react';
import { cx } from '../lib/cx';
import type { Tone } from './status';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'soft' | 'outline' | 'ghost';
  tone?: Tone;
  size?: 'md' | 'lg' | 'xl';
  icon?: LucideIcon;
  busy?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'soft',
  tone = 'blue',
  size = 'md',
  icon: Icon,
  busy,
  block,
  className,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const iconSize = size === 'xl' ? 22 : size === 'lg' ? 20 : 17;
  return (
    <button
      type="button"
      className={cx(
        'btn',
        `btn-${variant}`,
        variant === 'soft' && `tone-${tone}`,
        `btn-${size}`,
        block && 'btn-block',
        className,
      )}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? (
        <LoaderCircle size={iconSize} className="spin" aria-hidden />
      ) : Icon ? (
        <Icon size={iconSize} aria-hidden />
      ) : null}
      <span>{children}</span>
    </button>
  );
}

export function Pill({ tone, icon: Icon, children }: { tone: Tone; icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className={cx('pill', `tone-${tone}`)}>
      {Icon && <Icon size={15} aria-hidden />}
      {children}
    </span>
  );
}

export function StatCard({
  tone,
  icon: Icon,
  value,
  label,
  sub,
  flash,
}: {
  tone: Tone;
  icon: LucideIcon;
  value: ReactNode;
  label: string;
  sub?: string;
  flash?: boolean;
}) {
  return (
    <div className={cx('stat', `tone-${tone}`, flash && 'flash')}>
      <Icon className="stat-ic" size={26} aria-hidden />
      <div className="stat-v">{value}</div>
      <div className="stat-l">{label}</div>
      {sub && <div className="stat-s">{sub}</div>}
    </div>
  );
}

export function ActionCard({
  tone,
  icon: Icon,
  title,
  sub,
  onClick,
}: {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={cx('action', `tone-${tone}`)} onClick={onClick}>
      <Icon className="action-ic" size={30} aria-hidden />
      <span className="action-t">{title}</span>
      <span className="action-s">{sub}</span>
    </button>
  );
}

export function BackBar({ onBack, step, total }: { onBack: () => void; step?: number; total?: number }) {
  return (
    <div className="backbar">
      <button type="button" className="back" onClick={onBack}>
        <ChevronLeft size={24} aria-hidden />
        Voltar
      </button>
      {step ? (
        <span className="step">
          Passo {step} de {total}
        </span>
      ) : null}
    </div>
  );
}

export function ResultHead({
  tone,
  icon: Icon,
  title,
  sub,
}: {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  sub?: string;
}) {
  return (
    <div className={cx('result', `tone-${tone}`)}>
      <span className="result-ic">
        <Icon size={48} strokeWidth={2.4} aria-hidden />
      </span>
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
  );
}

export function Notice({
  tone = 'blue',
  icon: Icon,
  children,
}: {
  tone?: Tone;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className={cx('notice', `tone-${tone}`)} role={tone === 'red' ? 'alert' : undefined}>
      <Icon size={22} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text?: string }) {
  return (
    <div className="empty">
      <span className="empty-ic">
        <Icon size={26} aria-hidden />
      </span>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
    </div>
  );
}

export interface RowItem {
  key: string;
  title: string;
  sub: string;
  icon: LucideIcon;
  tone?: Tone;
  onClick: () => void;
}

export function RowList({ items }: { items: RowItem[] }) {
  return (
    <div className="list">
      {items.map((it) => (
        <button key={it.key} type="button" className="list-row" onClick={it.onClick}>
          <span className={cx('row-ic', `tone-${it.tone ?? 'blue'}`)}>
            <it.icon size={22} aria-hidden />
          </span>
          <span className="row-main">
            <strong>{it.title}</strong>
            <span>{it.sub}</span>
          </span>
          <ChevronRight className="chev" size={20} aria-hidden />
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="chips" role="group" aria-label="Filtro">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={cx('chip', o.id === value && 'is-on')}
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Loading({ text = 'Carregando…' }: { text?: string }) {
  return (
    <div className="boot" role="status">
      <LoaderCircle className="spin" size={26} aria-hidden />
      {text}
    </div>
  );
}
