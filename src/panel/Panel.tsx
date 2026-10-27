import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Boxes,
  ChartColumn,
  CircleCheck,
  ClipboardList,
  Clock,
  Gauge,
  History,
  LayoutGrid,
  MapPin,
  Package,
  Presentation,
  QrCode,
  RotateCcw,
  Search,
  Smartphone,
  Undo2,
  Volume2,
  VolumeX,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../data/storeContext';
import { ago, clock, firstName, plural } from '../lib/format';
import { audioReady, chime, unlockAudio } from '../lib/sound';
import { cx } from '../lib/cx';
import type { Equipment, LogEntry, Part, Snapshot, WorkOrder } from '../types';
import { AppHeader } from '../components/AppHeader';
import { OrderCard } from '../components/OrderCard';
import { EQUIP_STATUS, KIND, ORDER_STATUS, PART_LEVEL, partLevel, type Tone } from '../components/status';
import { Button, Chips, EmptyState, Loading, Pill, StatCard } from '../components/ui';

type Tab = 'frota' | 'os' | 'estoque' | 'mov';

// Chave e "assinatura" de cada lista, para saber o que mudou
interface KpiItem {
  k: string;
  v: number;
}
const eqKey = (e: Equipment) => e.id;
const eqSig = (e: Equipment) => `${e.status}|${e.osId}`;
const osKey = (o: WorkOrder) => String(o.id);
const osSig = (o: WorkOrder) => `${o.status}|${JSON.stringify(o.parts)}`;
const partKey = (p: Part) => p.id;
const partSig = (p: Part) => String(p.qty);
const kpiKey = (x: KpiItem) => x.k;
const kpiSig = (x: KpiItem) => String(x.v);

/** Marca por alguns segundos os itens que mudaram desde a última atualização (vale também para mudanças vindas de outro aparelho). */
function useChanged<T>(items: T[] | undefined, key: (t: T) => string, sig: (t: T) => string) {
  const prev = useRef<Map<string, string> | null>(null);
  const [changed, setChanged] = useState<{ keys: Set<string>; at: number }>({ keys: new Set(), at: 0 });
  useEffect(() => {
    if (!items) return;
    const cur = new Map(items.map((i) => [key(i), sig(i)]));
    const before = prev.current;
    prev.current = cur;
    if (!before) return;
    const keys = new Set<string>();
    cur.forEach((v, k) => {
      if (before.get(k) !== v) keys.add(k);
    });
    if (keys.size) setChanged({ keys, at: Date.now() });
  }, [items, key, sig]);
  useEffect(() => {
    if (!changed.keys.size) return undefined;
    const t = window.setTimeout(() => setChanged({ keys: new Set(), at: 0 }), 3200);
    return () => window.clearTimeout(t);
  }, [changed.at, changed.keys.size]);
  return changed;
}

const SOUND_PREF = 'oficina-gse-som';

function useSoundAlerts(log: LogEntry[] | undefined) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(SOUND_PREF) !== '0';
    } catch {
      return true;
    }
  });
  const [ready, setReady] = useState(audioReady);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const onTap = () => {
      unlockAudio();
      window.setTimeout(() => setReady(audioReady()), 60);
    };
    document.addEventListener('pointerdown', onTap);
    return () => document.removeEventListener('pointerdown', onTap);
  }, []);

  // Toca um alerta quando entra uma OS nova
  useEffect(() => {
    if (!log) return;
    const opens = log.filter((l) => l.kind === 'open');
    if (!seen.current) {
      seen.current = new Set(opens.map((l) => l.id));
      return;
    }
    const fresh = opens.filter((l) => !seen.current?.has(l.id));
    fresh.forEach((l) => seen.current?.add(l.id));
    if (fresh.length && enabled) chime();
  }, [log, enabled]);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem(SOUND_PREF, next ? '1' : '0');
    } catch {
      /* sem armazenamento */
    }
    if (next) {
      unlockAudio();
      window.setTimeout(() => setReady(audioReady()), 60);
    }
  };
  return { enabled, ready, toggle };
}

function SoundLine({ log }: { log: LogEntry[] | undefined }) {
  const { enabled, ready, toggle } = useSoundAlerts(log);
  const text = !enabled
    ? 'Alertas sonoros desativados'
    : ready
      ? 'Alertas sonoros ativados'
      : 'Toque na tela para ativar os alertas sonoros';
  const tone: Tone = !enabled ? 'neutral' : ready ? 'green' : 'amber';
  return (
    <button
      type="button"
      className={cx('sound', `tone-${tone}`)}
      onClick={toggle}
      aria-pressed={enabled}
      title="Tocar um som quando abrir uma OS nova"
    >
      {enabled ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />}
      {text}
    </button>
  );
}

function ResetButton() {
  const { store } = useStore();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <Button
      variant={armed ? 'soft' : 'outline'}
      tone="red"
      icon={RotateCcw}
      busy={busy}
      onClick={async () => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setBusy(true);
        try {
          await store.reset();
        } finally {
          setBusy(false);
          setArmed(false);
        }
      }}
    >
      {armed ? 'Toque de novo para confirmar' : 'Reiniciar demonstração'}
    </Button>
  );
}

const TABS: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: 'frota', label: 'Frota', icon: LayoutGrid },
  { id: 'os', label: 'Ordens de serviço', icon: ClipboardList },
  { id: 'estoque', label: 'Estoque', icon: Boxes },
  { id: 'mov', label: 'Movimentações', icon: History },
];

export function Panel({ embedded }: { embedded?: boolean }) {
  const { snap, store } = useStore();
  const [tab, setTab] = useState<Tab>('frota');

  const eqChanged = useChanged(snap?.equipment, eqKey, eqSig);
  const osChanged = useChanged(snap?.orders, osKey, osSig);
  const partChanged = useChanged(snap?.parts, partKey, partSig);

  const kpi = useMemo(() => {
    if (!snap) return null;
    const total = snap.equipment.length;
    const ok = snap.equipment.filter((e) => e.status === 'ok').length;
    return {
      total,
      ok,
      pct: total ? Math.round((ok / total) * 100) : 0,
      down: snap.equipment.filter((e) => e.status === 'down').length,
      wait: snap.equipment.filter((e) => e.status === 'wait').length,
      low: snap.parts.filter((p) => p.qty < p.min).length,
      open: snap.orders.filter((o) => o.status !== 'closed').length,
    };
  }, [snap]);
  const kpiItems = useMemo<KpiItem[] | undefined>(
    () =>
      kpi
        ? [
            { k: 'pct', v: kpi.pct },
            { k: 'down', v: kpi.down },
            { k: 'wait', v: kpi.wait },
            { k: 'low', v: kpi.low },
          ]
        : undefined,
    [kpi],
  );
  const kpiChanged = useChanged(kpiItems, kpiKey, kpiSig);

  const header = !embedded && (
    <AppHeader
      title="Oficina GSE"
      subtitle="Painel de OS e estoque · tempo real"
      icon={Wrench}
      right={
        <a className="user-btn" href="#/">
          <span>App do técnico</span>
          <Smartphone size={18} aria-hidden />
        </a>
      }
    />
  );

  if (!snap || !kpi) {
    return (
      <div className="page">
        {header}
        <Loading />
      </div>
    );
  }

  return (
    <div className={cx('page', embedded && 'is-embedded')}>
      {header}
      <SoundLine log={snap.log} />

      <div className="stats">
        <StatCard
          tone="green"
          icon={Gauge}
          value={`${kpi.pct}%`}
          label="Disponibilidade"
          sub={`${kpi.ok} de ${kpi.total} equipamentos`}
          flash={kpiChanged.keys.has('pct')}
        />
        <StatCard
          tone="red"
          icon={Wrench}
          value={kpi.down}
          label="Baixados"
          sub="em manutenção"
          flash={kpiChanged.keys.has('down')}
        />
        <StatCard
          tone="amber"
          icon={Clock}
          value={kpi.wait}
          label="Aguardando peça"
          sub={plural(kpi.wait, 'parado por falta de peça', 'parados por falta de peça')}
          flash={kpiChanged.keys.has('wait')}
        />
        <StatCard
          tone="blue"
          icon={Package}
          value={kpi.low}
          label="Estoque crítico"
          sub={plural(kpi.low, 'item abaixo do mínimo', 'itens abaixo do mínimo')}
          flash={kpiChanged.keys.has('low')}
        />
      </div>

      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="Seções do painel">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={cx('tab', tab === t.id && 'is-on')}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={17} aria-hidden />
              {t.label}
              {t.id === 'os' && <span className="tab-count">{kpi.open}</span>}
            </button>
          ))}
        </div>
        {!embedded && (
          <div className="toolbar-actions">
            <a className="btn btn-outline btn-md" href="#/apresentacao">
              <Presentation size={17} aria-hidden />
              <span>Modo apresentação</span>
            </a>
            <a className="btn btn-outline btn-md" href="#/etiquetas">
              <QrCode size={17} aria-hidden />
              <span>Etiquetas QR</span>
            </a>
            <ResetButton />
          </div>
        )}
      </div>

      {tab === 'frota' && <FleetTab snap={snap} changed={eqChanged.keys} at={eqChanged.at} />}
      {tab === 'os' && <OrdersTab snap={snap} changed={osChanged.keys} />}
      {tab === 'estoque' && <StockTab parts={snap.parts} changed={partChanged.keys} />}
      {tab === 'mov' && <MovesTab log={snap.log} />}

      <p className="footnote-box">
        {store.mode === 'firebase'
          ? 'Dados no Firebase: o que o técnico faz no celular aparece aqui na hora, em qualquer aparelho.'
          : 'Modo demonstração: os dados ficam só neste navegador. Com o Firebase configurado, todos os aparelhos ficam sincronizados.'}{' '}
        Protótipo com dados de exemplo.
      </p>
    </div>
  );
}

/* ---------- Frota ---------- */
function FleetTab({ snap, changed, at }: { snap: Snapshot; changed: Set<string>; at: number }) {
  const groups: Array<Equipment['kind']> = ['tmx', 'nbl'];
  return (
    <div className="tab-body">
      {groups.map((kind) => {
        const list = snap.equipment.filter((e) => e.kind === kind);
        const ok = list.filter((e) => e.status === 'ok').length;
        const K = KIND[kind];
        return (
          <section key={kind} className="group-sec" aria-label={K.group}>
            <div className="sec-h">
              <K.icon size={20} aria-hidden />
              <h3>{K.group}</h3>
              <span className="sec-muted">
                {ok} de {list.length} disponíveis
              </span>
            </div>
            <div className="fleet">
              {list.map((e) => {
                const st = EQUIP_STATUS[e.status];
                const o = e.osId ? snap.orders.find((x) => x.id === e.osId) : undefined;
                const hit = changed.has(e.id);
                return (
                  <div key={hit ? `${e.id}@${at}` : e.id} className={cx('etile', `tone-${st.tone}`, hit && 'flash')}>
                    <strong>{e.id}</strong>
                    <Pill tone={st.tone} icon={st.icon}>
                      {st.label}
                    </Pill>
                    {o && (
                      <p>
                        OS {o.id} · {firstName(o.tech)}
                      </p>
                    )}
                    {o && <p className="etile-sub">{o.problem}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- Ordens de serviço ---------- */
type OsFilter = 'todas' | 'open' | 'wait' | 'closed';

function OrdersTab({ snap, changed }: { snap: Snapshot; changed: Set<string> }) {
  const [filter, setFilter] = useState<OsFilter>('todas');
  const [q, setQ] = useState('');
  const count = (f: OsFilter) =>
    f === 'todas' ? snap.orders.length : snap.orders.filter((o) => o.status === f).length;
  const term = q.trim().toLowerCase();
  const matches = (o: WorkOrder) =>
    !term || [String(o.id), o.equipId, o.problem, o.tech, o.techBp].some((v) => v.toLowerCase().includes(term));
  const rank = (o: WorkOrder) => (o.status === 'closed' ? 1 : 0);
  const list = snap.orders
    .filter((o) => (filter === 'todas' || o.status === filter) && matches(o))
    .sort((a, b) => rank(a) - rank(b) || b.openedAt - a.openedAt);
  return (
    <div className="tab-body">
      <label className="search">
        <Search size={18} aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por OS, equipamento, problema ou técnico"
          aria-label="Buscar ordens de serviço"
        />
      </label>
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'todas', label: `Todas (${count('todas')})` },
          { id: 'open', label: `${ORDER_STATUS.open.label} (${count('open')})` },
          { id: 'wait', label: `${ORDER_STATUS.wait.label} (${count('wait')})` },
          { id: 'closed', label: `Fechadas (${count('closed')})` },
        ]}
      />
      <p className="showing">
        Mostrando {list.length} de {snap.orders.length} ordens de serviço
      </p>
      {list.length === 0 ? (
        <EmptyState icon={Search} title="Nenhuma OS encontrada" text="Ajuste a busca ou troque o filtro." />
      ) : (
        <div className="olist">
          {list.map((o) => (
            <OrderCard
              key={changed.has(String(o.id)) ? `${o.id}@flash` : o.id}
              o={o}
              snap={snap}
              flash={changed.has(String(o.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Estoque ---------- */
type StockFilter = 'todas' | 'low' | 'out';

function StockTab({ parts, changed }: { parts: Part[]; changed: Set<string> }) {
  const [filter, setFilter] = useState<StockFilter>('todas');
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const list = parts.filter((p) => {
    const lvl = partLevel(p);
    const okFilter = filter === 'todas' || (filter === 'low' ? lvl === 'low' : lvl === 'out');
    const okTerm = !term || [p.name, p.pn, p.loc, p.fits].some((v) => v.toLowerCase().includes(term));
    return okFilter && okTerm;
  });
  const n = (f: StockFilter) => (f === 'todas' ? parts.length : parts.filter((p) => partLevel(p) === f).length);
  return (
    <div className="tab-body">
      <label className="search">
        <Search size={18} aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar peça, P/N ou prateleira"
          aria-label="Buscar no estoque"
        />
      </label>
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'todas', label: `Todas (${n('todas')})` },
          { id: 'low', label: `Abaixo do mínimo (${n('low')})` },
          { id: 'out', label: `Em falta (${n('out')})` },
        ]}
      />
      {list.length === 0 ? (
        <EmptyState icon={Search} title="Nenhuma peça encontrada" text="Ajuste a busca ou troque o filtro." />
      ) : (
        <div className="stock">
          {list.map((p) => {
            const lvl = PART_LEVEL[partLevel(p)];
            const hit = changed.has(p.id);
            return (
              <article key={hit ? `${p.id}@flash` : p.id} className={cx('scard', `tone-${lvl.tone}`, hit && 'flash')}>
                <span className="scard-ic">
                  <Package size={22} aria-hidden />
                </span>
                <div className="scard-main">
                  <strong>{p.name}</strong>
                  <span>
                    {p.pn} · {p.fits}
                  </span>
                </div>
                <div className="scard-qty">
                  <strong>{p.qty}</strong>
                  <span>mín. {p.min}</span>
                </div>
                <div className="scard-foot">
                  <span>
                    <MapPin size={15} aria-hidden />
                    Prateleira {p.loc}
                  </span>
                  <Pill tone={lvl.tone} icon={lvl.icon}>
                    {lvl.label}
                  </Pill>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Movimentações ---------- */
const LOG_ICON: Record<LogEntry['kind'], { icon: LucideIcon; tone: Tone }> = {
  open: { icon: ClipboardList, tone: 'coral' },
  pick: { icon: Package, tone: 'blue' },
  undo: { icon: Undo2, tone: 'neutral' },
  wait: { icon: Clock, tone: 'amber' },
  close: { icon: CircleCheck, tone: 'green' },
};

function MovesTab({ log }: { log: LogEntry[] }) {
  const { now } = useStore();
  if (log.length === 0) return <EmptyState icon={ChartColumn} title="Nenhuma movimentação ainda" />;
  return (
    <div className="list feed">
      {log.map((l) => {
        const k = LOG_ICON[l.kind];
        return (
          <div key={l.id} className="list-row">
            <span className={cx('row-ic', `tone-${k.tone}`)}>
              <k.icon size={20} aria-hidden />
            </span>
            <span className="row-main">
              <strong className="feed-txt">{l.text}</strong>
            </span>
            <span className="feed-time">
              {clock(l.at)}
              <small>{ago(l.at, now)}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}
