import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChartColumn,
  CircleCheck,
  ClipboardList,
  ClipboardPlus,
  Clock,
  House,
  LogOut,
  Mic,
  Minus,
  Package,
  PackageX,
  Plus,
  TriangleAlert,
  Undo2,
  Wrench,
} from 'lucide-react';
import { useStore } from '../data/storeContext';
import { AppError } from '../data/rules';
import { ago, dateTime, firstName } from '../lib/format';
import { equipPayload, parseQr, partPayload } from '../lib/qr';
import { cx } from '../lib/cx';
import type { Part, User, WorkOrder } from '../types';
import { AppHeader } from '../components/AppHeader';
import { OrderCard } from '../components/OrderCard';
import { partsText } from '../lib/orders';
import { ScanBox, type DemoCode } from '../components/ScanBox';
import { DEMO_EQUIP, DEMO_PARTS, KIND, PROBLEMS } from '../components/status';
import { ActionCard, BackBar, Button, EmptyState, Loading, Notice, ResultHead, RowList } from '../components/ui';

type Screen =
  | { s: 'home' }
  | { s: 'open-scan' }
  | { s: 'open-busy'; equipId: string }
  | { s: 'open-confirm'; equipId: string }
  | { s: 'open-problem'; equipId: string }
  | { s: 'open-voice'; equipId: string }
  | { s: 'open-done'; osId: number }
  | { s: 'pick-os' }
  | { s: 'pick-scan'; osId: number; undone?: boolean }
  | { s: 'pick-qty'; osId: number; partId: string }
  | { s: 'pick-done'; osId: number; partId: string; qty: number }
  | { s: 'pick-empty'; osId: number; partId: string }
  | { s: 'wait-done'; osId: number; partId: string }
  | { s: 'close-scan'; osId?: number }
  | { s: 'close-confirm'; osId: number }
  | { s: 'close-done'; osId: number };

interface Props {
  user: User;
  onLogout: () => void;
  /** Dentro do celular desenhado no modo apresentação. */
  embedded?: boolean;
}

const UNKNOWN_QR = 'QR code não reconhecido. Tente de novo ou use um QR de teste.';

export function TechApp({ user, onLogout, embedded }: Props) {
  const { store, snap, now } = useStore();
  const [screen, setScreen] = useState<Screen>({ s: 'home' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Cada tela nova começa do topo
  useEffect(() => {
    const box = rootRef.current?.closest('.phone-screen');
    if (box) box.scrollTop = 0;
    else window.scrollTo({ top: 0 });
  }, [screen]);

  const go = (next: Screen) => {
    setScreen(next);
    setError(null);
    setScanError(null);
  };
  const home = () => go({ s: 'home' });

  /** Executa uma gravação, mostra "Salvando…" no botão e a mensagem de erro, se houver. */
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof AppError ? e.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <AppHeader
      title="Oficina GSE"
      subtitle="OS e estoque · tempo real"
      icon={Wrench}
      compact
      right={
        <button type="button" className="user-btn" onClick={onLogout} title="Sair">
          <span>{user.name ? firstName(user.name) : `BP ${user.bp}`}</span>
          <LogOut size={18} aria-hidden />
        </button>
      }
    />
  );

  if (!snap) {
    return (
      <div className="tech" ref={rootRef}>
        {header}
        <Loading />
      </div>
    );
  }

  const eqOf = (id: string) => snap.equipment.find((e) => e.id === id);
  const orderOf = (id: number) => snap.orders.find((o) => o.id === id);
  const partOf = (id: string) => snap.parts.find((p) => p.id === id);
  const mine = snap.orders.filter((o) => o.status !== 'closed' && o.techBp === user.bp);
  const openOrders = snap.orders.filter((o) => o.status !== 'closed');
  const panelLink = embedded ? null : (
    <a className="btn btn-ghost btn-lg" href="#/painel">
      <ChartColumn size={20} aria-hidden />
      <span>Ver no painel</span>
    </a>
  );

  // Se a OS da tela atual foi fechada ou apagada (ex.: outro aparelho reiniciou a demonstração), volta ao início.
  let view: Screen = screen;
  if ('osId' in view && view.osId !== undefined) {
    const o = orderOf(view.osId);
    const isResult =
      view.s === 'open-done' || view.s === 'close-done' || view.s === 'pick-done' || view.s === 'wait-done';
    if (!o || (o.status === 'closed' && !isResult)) view = { s: 'home' };
  }

  /* ---------- leitura de QR em cada fluxo ---------- */
  const scanEquipForOpen = (raw: string) => {
    const t = parseQr(raw, snap);
    if (!t) return setScanError(UNKNOWN_QR);
    if (t.kind !== 'equip') return setScanError('Este é o QR de uma peça. Leia o QR colado no equipamento.');
    const e = eqOf(t.id);
    if (!e) return setScanError(UNKNOWN_QR);
    go(e.osId ? { s: 'open-busy', equipId: e.id } : { s: 'open-confirm', equipId: e.id });
  };

  const scanPart = (osId: number) => (raw: string) => {
    const t = parseQr(raw, snap);
    if (!t) return setScanError(UNKNOWN_QR);
    if (t.kind !== 'part') return setScanError('Este é o QR de um equipamento. Leia o QR da prateleira da peça.');
    const p = partOf(t.id);
    if (!p) return setScanError(UNKNOWN_QR);
    go(p.qty > 0 ? { s: 'pick-qty', osId, partId: p.id } : { s: 'pick-empty', osId, partId: p.id });
  };

  const scanEquipForClose = (expected?: WorkOrder) => (raw: string) => {
    const t = parseQr(raw, snap);
    if (!t) return setScanError(UNKNOWN_QR);
    if (t.kind !== 'equip') return setScanError('Este é o QR de uma peça. Leia o QR do equipamento.');
    const e = eqOf(t.id);
    if (!e) return setScanError(UNKNOWN_QR);
    if (expected && expected.equipId !== e.id)
      return setScanError(`Este QR é do ${e.id}. Leia o QR do ${expected.equipId}.`);
    if (!e.osId) return setScanError(`O ${e.id} não tem OS aberta.`);
    go({ s: 'close-confirm', osId: e.osId });
  };

  const equipCode = (id: string, sub?: string): DemoCode => {
    const e = eqOf(id);
    const kind = e ? KIND[e.kind] : KIND.tmx;
    return { key: id, title: id, sub: sub ?? kind.label, icon: kind.icon, code: equipPayload(id) };
  };
  const partCode = (p: Part): DemoCode => ({
    key: p.id,
    title: p.name,
    sub: `Prateleira ${p.loc}`,
    icon: Package,
    tone: 'blue',
    code: partPayload(p.pn),
  });

  const startPick = () => (mine.length === 1 ? go({ s: 'pick-scan', osId: mine[0].id }) : go({ s: 'pick-os' }));

  /* ---------- telas ---------- */
  let body: ReactNode;

  switch (view.s) {
    case 'open-scan':
      body = (
        <>
          <BackBar onBack={home} step={1} total={3} />
          <h2 className="screen-t">Leia o QR do equipamento</h2>
          <p className="screen-s">Aponte a câmera para a etiqueta colada no equipamento.</p>
          <ScanBox
            hint="Aponte para o QR do equipamento"
            items={DEMO_EQUIP.map((id) => equipCode(id))}
            onCode={scanEquipForOpen}
            error={scanError}
          />
        </>
      );
      break;

    case 'open-busy': {
      const e = eqOf(view.equipId);
      const o = e?.osId ? orderOf(e.osId) : undefined;
      if (!e || !o) {
        body = <EmptyState icon={TriangleAlert} title="Equipamento não encontrado" />;
        break;
      }
      const isMine = o.techBp === user.bp;
      body = (
        <>
          <BackBar onBack={() => go({ s: 'open-scan' })} />
          <ResultHead
            tone="amber"
            icon={TriangleAlert}
            title="Este equipamento já tem OS aberta"
            sub={`O ${e.id} está na OS ${o.id}, com ${isMine ? 'você' : o.tech}.`}
          />
          {isMine && (
            <Button size="xl" tone="blue" block icon={Package} onClick={() => go({ s: 'pick-scan', osId: o.id })}>
              Pegar peça para esta OS
            </Button>
          )}
          <Button variant="outline" size="lg" block icon={House} onClick={home}>
            Voltar ao início
          </Button>
        </>
      );
      break;
    }

    case 'open-confirm': {
      const e = eqOf(view.equipId);
      if (!e) {
        body = <EmptyState icon={TriangleAlert} title="Equipamento não encontrado" />;
        break;
      }
      const kind = KIND[e.kind];
      const equipId = e.id;
      body = (
        <>
          <BackBar onBack={() => go({ s: 'open-scan' })} step={2} total={3} />
          <h2 className="screen-t">É este o equipamento?</h2>
          <div className="equip-hero">
            <span className="equip-hero-ic">
              <kind.icon size={46} aria-hidden />
            </span>
            <strong>{e.id}</strong>
            <span>{kind.label}</span>
          </div>
          <Button variant="primary" size="xl" block onClick={() => go({ s: 'open-problem', equipId })}>
            Sim, é este
          </Button>
          <Button variant="outline" size="lg" block onClick={() => go({ s: 'open-scan' })}>
            Não, ler de novo
          </Button>
        </>
      );
      break;
    }

    case 'open-problem': {
      const equipId = view.equipId;
      const open = (problem: string, key: string) =>
        run(key, async () => {
          const id = await store.openOrder({ equipId, problem, user });
          go({ s: 'open-done', osId: id });
        });
      body = (
        <>
          <BackBar onBack={() => go({ s: 'open-confirm', equipId })} step={3} total={3} />
          <h2 className="screen-t">Qual é o problema?</h2>
          <p className="screen-s">Equipamento {equipId}</p>
          <div className="tiles">
            {PROBLEMS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={cx('tile', `tone-${p.tone}`)}
                disabled={!!busy}
                onClick={() => (p.id === 'outro' ? go({ s: 'open-voice', equipId }) : open(p.label, p.id))}
              >
                <span className="tile-ic">
                  <p.icon size={26} aria-hidden />
                </span>
                <span>
                  {busy === p.id ? 'Abrindo…' : p.label}
                  {p.sub && <small>{p.sub}</small>}
                </span>
              </button>
            ))}
          </div>
        </>
      );
      break;
    }

    case 'open-voice': {
      const equipId = view.equipId;
      body = (
        <>
          <BackBar onBack={() => go({ s: 'open-problem', equipId })} step={3} total={3} />
          <VoiceStep
            equipId={equipId}
            busy={busy === 'voice'}
            onSubmit={(text) =>
              run('voice', async () => {
                const id = await store.openOrder({ equipId, problem: text, user });
                go({ s: 'open-done', osId: id });
              })
            }
          />
        </>
      );
      break;
    }

    case 'open-done': {
      const o = orderOf(view.osId);
      if (!o) {
        body = null;
        break;
      }
      const osId = o.id;
      body = (
        <>
          <ResultHead tone="green" icon={CircleCheck} title={`OS ${o.id} aberta`} sub={`${o.equipId} · ${o.problem}`} />
          <Notice icon={ChartColumn}>
            No painel, o <strong>{o.equipId}</strong> já aparece como <strong>baixado</strong>. Ninguém precisou digitar
            nada.
          </Notice>
          <Button size="xl" tone="blue" block icon={Package} onClick={() => go({ s: 'pick-scan', osId })}>
            Pegar peça para esta OS
          </Button>
          <Button variant="outline" size="lg" block icon={House} onClick={home}>
            Voltar ao início
          </Button>
          {panelLink}
        </>
      );
      break;
    }

    case 'pick-os':
      body = (
        <>
          <BackBar onBack={home} />
          <h2 className="screen-t">Para qual OS é a peça?</h2>
          {mine.length === 0 ? (
            <>
              <EmptyState
                icon={ClipboardList}
                title="Você não tem OS aberta agora"
                text="Abra uma OS antes de retirar peças."
              />
              <Button variant="primary" size="xl" block icon={ClipboardPlus} onClick={() => go({ s: 'open-scan' })}>
                Abrir OS
              </Button>
            </>
          ) : (
            <RowList
              items={mine.map((o) => ({
                key: String(o.id),
                title: `OS ${o.id} · ${o.equipId}`,
                sub: o.problem,
                icon: Wrench,
                tone: o.status === 'wait' ? 'amber' : 'blue',
                onClick: () => go({ s: 'pick-scan', osId: o.id }),
              }))}
            />
          )}
        </>
      );
      break;

    case 'pick-scan': {
      const o = orderOf(view.osId);
      if (!o) {
        body = null;
        break;
      }
      body = (
        <>
          <BackBar onBack={() => (mine.length > 1 ? go({ s: 'pick-os' }) : home())} step={1} total={2} />
          <h2 className="screen-t">Leia o QR da prateleira</h2>
          <p className="screen-s">
            A peça vai para a OS {o.id} ({o.equipId}).
          </p>
          {view.undone && (
            <Notice tone="green" icon={Undo2}>
              Retirada desfeita. A peça voltou para o estoque.
            </Notice>
          )}
          <ScanBox
            hint="Aponte para o QR da prateleira"
            items={DEMO_PARTS.map(partOf)
              .filter((p): p is Part => !!p)
              .map(partCode)}
            onCode={scanPart(o.id)}
            error={scanError}
          />
        </>
      );
      break;
    }

    case 'pick-qty': {
      const o = orderOf(view.osId);
      const p = partOf(view.partId);
      if (!o || !p) {
        body = null;
        break;
      }
      body = (
        <>
          <BackBar onBack={() => go({ s: 'pick-scan', osId: o.id })} step={2} total={2} />
          <QtyStep
            key={p.id}
            part={p}
            order={o}
            busy={busy === 'pick'}
            onConfirm={(qty) =>
              run('pick', async () => {
                await store.pickPart({ osId: o.id, partId: p.id, qty, user });
                go({ s: 'pick-done', osId: o.id, partId: p.id, qty });
              })
            }
          />
        </>
      );
      break;
    }

    case 'pick-done': {
      const p = partOf(view.partId);
      if (!p) {
        body = null;
        break;
      }
      const { osId, qty } = view;
      const low = p.qty < p.min;
      body = (
        <>
          <ResultHead
            tone="green"
            icon={CircleCheck}
            title="Retirada registrada"
            sub={`${qty} × ${p.name} para a OS ${osId}`}
          />
          <div className="left-row">
            <span>Ficaram no estoque</span>
            <strong>{p.qty}</strong>
          </div>
          {low && (
            <Notice tone="amber" icon={TriangleAlert}>
              Ficou abaixo do mínimo de {p.min}. O almoxarifado já recebeu o aviso para repor.
            </Notice>
          )}
          <Button size="xl" tone="blue" block icon={Package} onClick={() => go({ s: 'pick-scan', osId })}>
            Pegar outra peça
          </Button>
          <Button variant="outline" size="lg" block icon={House} onClick={home}>
            Voltar ao início
          </Button>
          <Button
            variant="ghost"
            size="lg"
            icon={Undo2}
            busy={busy === 'undo'}
            onClick={() =>
              run('undo', async () => {
                await store.undoPick({ osId, partId: p.id, qty, user });
                go({ s: 'pick-scan', osId, undone: true });
              })
            }
          >
            Errei, desfazer
          </Button>
          {panelLink}
        </>
      );
      break;
    }

    case 'pick-empty': {
      const o = orderOf(view.osId);
      const p = partOf(view.partId);
      if (!o || !p) {
        body = null;
        break;
      }
      body = (
        <>
          <BackBar onBack={() => go({ s: 'pick-scan', osId: o.id })} />
          <ResultHead tone="amber" icon={PackageX} title="Esta peça está em falta" sub={`${p.name} · estoque zerado`} />
          <Notice icon={ChartColumn}>
            Marque a OS como aguardando peça. A coordenação e o almoxarifado veem na hora.
          </Notice>
          <Button
            variant="primary"
            size="xl"
            block
            icon={Clock}
            busy={busy === 'wait'}
            onClick={() =>
              run('wait', async () => {
                await store.markWaiting({ osId: o.id, partId: p.id, user });
                go({ s: 'wait-done', osId: o.id, partId: p.id });
              })
            }
          >
            Marcar como aguardando peça
          </Button>
          <Button variant="outline" size="lg" block onClick={() => go({ s: 'pick-scan', osId: o.id })}>
            Escolher outra peça
          </Button>
        </>
      );
      break;
    }

    case 'wait-done': {
      const o = orderOf(view.osId);
      const p = partOf(view.partId);
      if (!o || !p) {
        body = null;
        break;
      }
      body = (
        <>
          <ResultHead tone="amber" icon={Clock} title={`OS ${o.id} aguardando peça`} sub={p.name} />
          <Notice icon={ChartColumn}>
            No painel, o <strong>{o.equipId}</strong> agora aparece como <strong>aguardando peça</strong>.
          </Notice>
          <Button variant="outline" size="lg" block icon={House} onClick={home}>
            Voltar ao início
          </Button>
          {panelLink}
        </>
      );
      break;
    }

    case 'close-scan': {
      const target = view.osId ? orderOf(view.osId) : undefined;
      const list = target
        ? [target]
        : [...openOrders].sort(
            (a, b) => Number(b.techBp === user.bp) - Number(a.techBp === user.bp) || b.openedAt - a.openedAt,
          );
      body = (
        <>
          <BackBar onBack={home} step={1} total={2} />
          <h2 className="screen-t">Leia o QR do equipamento</h2>
          <p className="screen-s">
            {target
              ? `Para fechar a OS ${target.id}, leia o QR do ${target.equipId}.`
              : 'Leia o QR do equipamento que ficou pronto.'}
          </p>
          <ScanBox
            hint="Aponte para o QR do equipamento"
            items={list.map((o) =>
              equipCode(o.equipId, `OS ${o.id} · ${o.problem}${o.techBp === user.bp ? '' : ` (${firstName(o.tech)})`}`),
            )}
            onCode={scanEquipForClose(target)}
            error={scanError}
          />
        </>
      );
      break;
    }

    case 'close-confirm': {
      const o = orderOf(view.osId);
      if (!o) {
        body = null;
        break;
      }
      const e = eqOf(o.equipId);
      body = (
        <>
          <BackBar onBack={() => go({ s: 'close-scan' })} step={2} total={2} />
          <h2 className="screen-t">Fechar a OS {o.id}?</h2>
          <dl className="details">
            <div>
              <dt>Equipamento</dt>
              <dd>
                {o.equipId}
                {e ? `, ${KIND[e.kind].label}` : ''}
              </dd>
            </div>
            <div>
              <dt>Problema</dt>
              <dd>{o.problem}</dd>
            </div>
            <div>
              <dt>Técnico</dt>
              <dd>{o.tech}</dd>
            </div>
            <div>
              <dt>Aberta</dt>
              <dd>
                {dateTime(o.openedAt)} ({ago(o.openedAt, now)})
              </dd>
            </div>
            <div>
              <dt>Peças usadas</dt>
              <dd>{partsText(o, snap) || 'Nenhuma'}</dd>
            </div>
          </dl>
          <p className="question">O equipamento está pronto para operar?</p>
          <Button
            size="xl"
            tone="green"
            block
            icon={CircleCheck}
            busy={busy === 'close'}
            onClick={() =>
              run('close', async () => {
                await store.closeOrder({ osId: o.id, user });
                go({ s: 'close-done', osId: o.id });
              })
            }
          >
            Sim, liberar equipamento
          </Button>
          <Button variant="outline" size="lg" block onClick={home}>
            Ainda não
          </Button>
        </>
      );
      break;
    }

    case 'close-done': {
      const o = orderOf(view.osId);
      if (!o) {
        body = null;
        break;
      }
      body = (
        <>
          <ResultHead
            tone="green"
            icon={CircleCheck}
            title={`OS ${o.id} fechada`}
            sub={`${o.equipId} liberado para operar`}
          />
          <Notice tone="green" icon={ChartColumn}>
            No painel, o <strong>{o.equipId}</strong> voltou a aparecer como <strong>disponível</strong>.
          </Notice>
          <Button variant="outline" size="lg" block icon={House} onClick={home}>
            Voltar ao início
          </Button>
          {panelLink}
        </>
      );
      break;
    }

    default:
      body = (
        <>
          <div className="hello">
            <h2>Olá, {user.name ? firstName(user.name) : 'técnico'}</h2>
            <p>{user.name ? `${user.name} · BP ${user.bp}` : `BP ${user.bp}`}</p>
          </div>
          <div className="actions">
            <ActionCard
              tone="coral"
              icon={ClipboardPlus}
              title="Abrir OS"
              sub="Ler o QR do equipamento"
              onClick={() => go({ s: 'open-scan' })}
            />
            <ActionCard
              tone="blue"
              icon={Package}
              title="Pegar peça"
              sub="Ler o QR da prateleira"
              onClick={startPick}
            />
            <ActionCard
              tone="green"
              icon={CircleCheck}
              title="Fechar OS"
              sub="Ler o QR do equipamento"
              onClick={() => go({ s: 'close-scan' })}
            />
          </div>
          <div className="sec-h">
            <ClipboardList size={20} aria-hidden />
            <h3>Suas OS abertas</h3>
            <span className="sec-count">{mine.length}</span>
          </div>
          {mine.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Nenhuma OS aberta no seu nome"
              text="Toque em Abrir OS quando um equipamento chegar com problema."
            />
          ) : (
            <div className="olist">
              {mine.map((o) => (
                <OrderCard
                  key={o.id}
                  o={o}
                  snap={snap}
                  actions={
                    <>
                      <Button size="lg" tone="blue" icon={Package} onClick={() => go({ s: 'pick-scan', osId: o.id })}>
                        Pegar peça
                      </Button>
                      <Button
                        size="lg"
                        tone="green"
                        icon={CircleCheck}
                        onClick={() => go({ s: 'close-scan', osId: o.id })}
                      >
                        Fechar OS
                      </Button>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </>
      );
  }

  return (
    <div className="tech" ref={rootRef} data-screen={view.s}>
      {header}
      <main className="tech-body">
        {body}
        {error && (
          <Notice tone="red" icon={TriangleAlert}>
            {error}
          </Notice>
        )}
      </main>
    </div>
  );
}

/* ---------- passo da quantidade ---------- */
function QtyStep({
  part,
  order,
  busy,
  onConfirm,
}: {
  part: Part;
  order: WorkOrder;
  busy: boolean;
  onConfirm: (qty: number) => void;
}) {
  const [qty, setQty] = useState(1);
  return (
    <>
      <h2 className="screen-t">Quantas você vai pegar?</h2>
      <div className="part-card">
        <span className="part-ic">
          <Package size={34} aria-hidden />
        </span>
        <div>
          <strong>{part.name}</strong>
          <span>
            {part.pn} · prateleira {part.loc}
          </span>
          <span className="part-stock">
            Em estoque: <b>{part.qty}</b>
          </span>
        </div>
      </div>
      <div className="stepper">
        <button
          type="button"
          className="step-btn"
          aria-label="Diminuir"
          disabled={qty <= 1}
          onClick={() => setQty((q) => Math.max(1, q - 1))}
        >
          <Minus size={34} aria-hidden />
        </button>
        <output className="qty" aria-live="polite">
          {qty}
        </output>
        <button
          type="button"
          className="step-btn"
          aria-label="Aumentar"
          disabled={qty >= part.qty}
          onClick={() => setQty((q) => Math.min(part.qty, q + 1))}
        >
          <Plus size={34} aria-hidden />
        </button>
      </div>
      <Button variant="primary" size="xl" block busy={busy} onClick={() => onConfirm(qty)}>
        Confirmar retirada
      </Button>
      <p className="hint">
        Vai para a OS {order.id} ({order.equipId})
      </p>
    </>
  );
}

/* ---------- problema falado ---------- */
function VoiceStep({ equipId, busy, onSubmit }: { equipId: string; busy: boolean; onSubmit: (text: string) => void }) {
  const [phase, setPhase] = useState<'idle' | 'listening' | 'done'>('idle');
  const [text, setText] = useState('');
  useEffect(() => {
    if (phase !== 'listening') return undefined;
    const t = window.setTimeout(() => {
      setText('Barulho estranho no motor ao acelerar');
      setPhase('done');
    }, 1600);
    return () => window.clearTimeout(t);
  }, [phase]);
  return (
    <>
      <h2 className="screen-t">Fale qual é o problema</h2>
      <p className="screen-s">Equipamento {equipId}</p>
      <button
        type="button"
        className={cx('mic', phase === 'listening' && 'is-on')}
        aria-label="Falar o problema"
        onClick={() => setPhase('listening')}
      >
        <Mic size={54} aria-hidden />
      </button>
      <p className="mic-state" aria-live="polite">
        {phase === 'listening' ? 'Ouvindo…' : phase === 'done' ? 'Confira o texto:' : 'Toque no microfone para falar'}
      </p>
      {phase === 'done' && (
        <>
          <textarea
            className="text-field"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Descrição do problema"
          />
          <Button
            variant="primary"
            size="xl"
            block
            busy={busy}
            disabled={!text.trim()}
            onClick={() => onSubmit(text.trim())}
          >
            Abrir OS
          </Button>
        </>
      )}
      <p className="hint">No app de verdade, o celular escreve o que a pessoa fala.</p>
    </>
  );
}
