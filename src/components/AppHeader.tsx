import type { ReactNode } from 'react';
import { Database, LoaderCircle, Wifi, WifiOff, type LucideIcon } from 'lucide-react';
import { useStore } from '../data/storeContext';
import { clock, longDay } from '../lib/format';
import { cx } from '../lib/cx';
import type { ConnStatus } from '../types';
import type { Tone } from './status';

const CONN: Record<ConnStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  online: { label: 'Conectado', tone: 'green', icon: Wifi },
  connecting: { label: 'Conectando…', tone: 'amber', icon: LoaderCircle },
  offline: { label: 'Sem conexão', tone: 'red', icon: WifiOff },
  error: { label: 'Erro no banco', tone: 'red', icon: WifiOff },
  demo: { label: 'Demonstração', tone: 'blue', icon: Database },
};

export function ConnPill() {
  const { status } = useStore();
  const c = CONN[status];
  return (
    <span
      className={cx('conn', `tone-${c.tone}`)}
      title={status === 'demo' ? 'Modo demonstração: dados só neste navegador' : c.label}
    >
      <c.icon size={17} className={status === 'connecting' ? 'spin' : undefined} aria-hidden />
      <span className="conn-label">{c.label}</span>
    </span>
  );
}

interface Props {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  right?: ReactNode;
  compact?: boolean;
}

/** Cabeçalho no mesmo modelo do GSE Connect: ícone coral, título, relógio, conexão e usuário. */
export function AppHeader({ title, subtitle, icon: Icon, right, compact }: Props) {
  const { now } = useStore();
  return (
    <header className={cx('app-header', compact && 'is-compact')}>
      <div className="brand">
        <span className="brand-ic">
          <Icon size={compact ? 24 : 28} aria-hidden />
        </span>
        <div className="brand-txt">
          <h1 className="brand-t">{title}</h1>
          <p className="brand-s">{subtitle}</p>
        </div>
      </div>
      <div className="header-right">
        {!compact && (
          <div className="clock">
            <strong>{clock(now)}</strong>
            <span>{longDay(now)}</span>
          </div>
        )}
        <ConnPill />
        {right}
      </div>
    </header>
  );
}
