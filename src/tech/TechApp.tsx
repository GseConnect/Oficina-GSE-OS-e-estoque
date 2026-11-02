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
import { SEED_EQUIP_IDS } from '../data/seed';
import { ago, dateTime, firstName, formatHours, parseHours } from '../lib/format';
import { partsText } from '../lib/orders';
import { equipPayload, parseQr, partPayload } from '../lib/qr';
import { cx } from '../lib/cx';
import type { EquipLocation, Equipment, Part, Snapshot, User, WorkOrder } from '../types';
import { AppHeader } from '../components/AppHeader';
import { FieldBlock, HourInput, LocationToggle } from '../components/FormBits';
import { OrderCard } from '../components/OrderCard';
import { PhotoPicker } from '../components/PhotoPicker';
import { ScanBox, type DemoCode } from '../components/ScanBox';
import { DEMO_EQUIP, DEMO_PARTS, KIND, LOCATION, PROBLEMS, SERVICE_CHIPS } from '../components/status';
import { ActionCard, BackBar, Button, Chips, EmptyState, Loading, Notice, ResultHead, RowList } from '../components/ui';

type Screen =
  | { s: 'home' }
  | { s: 'open-scan' }
  | { s: 'open-busy'; equipId: string }
  | { s: 'open-confirm'; equipId: string }
  | { s: 'open-problem'; equipId: string }
  | { s: 'open-voice'; equipId: string }
  | { s: 'open-details'; equipId: string; problem: string; description: string }
  | { s: 'open-done'; osId: number }
  | { s: 'pick-os' }
  | { s: 'pick-scan'; osId: number; undone?: boolean }
  | { s: 'pick-qty'; osId: number; partId: string }
  | { s: 'pick-done'; osId: number; partId: string; qty: number }
  | { s: 'pick-empty'; osId: number; partId: string }
  | { s: 'wait-done'; osId: number; partId: string }
  | { s: 'close-scan'; osId?: number }
  | { s: 'close-form'; osId: number }
  | { s: 'close-done'; osId: number };

type MineFilter = 'abertas' | 'aguardando' | 'finalizadas';

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
  const [mineFilter, setMineFilter] = useState<MineFilter>('abertas');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // No modo demonstração as fotos ficam no navegador, então saem menores.
  const photoSide = store.mode === 'demo' ? 720 : 1024;

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
  const myClosed = snap.orders
    .filter((o) => o.status === 'closed' && (o.techBp === user.bp || o.closedByBp === user.bp))
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
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
    go({ s: 'close-form', osId: e.osId });
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
  // Equipamentos cadastrados no painel também viram QR de teste
  const demoEquip = [...DEMO_EQUIP, ...snap.equipment.filter((e) => !SEED_EQUIP_IDS.has(e.id)).map((e) => e.id)].slice(
    0,
    8,
  );

  const startPick = () => (mine.length === 1 ? go({ s: 'pick-scan', osId: mine[0].id }) : go({ s: 'pick-os' }));

  /* ---------- telas ---------- */
  let body: ReactNode;

  switch (view.s) {
    case 'open-scan':
      body = (
        <>
          <BackBar onBack={home} step={1} total={4} />
          <h2 className="screen-t">Leia o QR do equipamento</h2>
          <p className="screen-s">Aponte a câmera para a etiqueta colada no equipamento.</p>
          <ScanBox
            hint="Aponte para o QR do equipamento"
            items={demoEquip.filter((id) => eqOf(id)).map((id) => equipCode(id))}
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
          <BackBar onBack={() => go({ s: 'open-scan' })} step={2} total={4} />
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
      body = (
        <>
          <BackBar onBack={() => go({ s: 'open-confirm', equipId })} step={3} total={4} />
          <h2 className="screen-t">Qual é o problema?</h2>
          <p className="screen-s">Equipamento {equipId}</p>
          <div className="tiles">
            {PROBLEMS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={cx('tile', `tone-${p.tone}`)}
                onClick={() =>
                  p.id === 'outro'
                    ? go({ s: 'open-voice', equipId })
                    : go({ s: 'open-details', equipId, problem: p.label, description: '' })
                }
              >
                <span className="tile-ic">
                  <p.icon size={26} aria-hidden />
                </span>
                <span>
                  {p.label}
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
          <BackBar onBack={() => go({ s: 'open-problem', equipId })} step={3} total={4} />
          <VoiceStep
            equipId={equipId}
            onSubmit={(text) => go({ s: 'open-details', equipId, problem: 'Outro', description: text })}
          />
        </>
      );
      break;
    }

    case 'open-details': {
      const e = eqOf(view.equipId);
      if (!e) {
        body = <EmptyState icon={TriangleAlert} title="Equipamento não encontrado" />;
        break;
      }
      const { problem, description } = view;
      body = (
        <>
          <BackBar onBack={() => go({ s: 'open-problem', equipId: e.id })} step={4} total={4} />
          <OpenDetailsStep
            equip={e}
            problem={problem}
            initialDescription={description}
            photoSide={photoSide}
            busy={busy === 'open'}
            onSubmit={(data) =>
              run('open', async () => {
                const id = await store.openOrder({ equipId: e.id, problem, ...data, user });
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
            No painel, o <strong>{o.equipId}</strong> já aparece como <strong>baixado</strong>, com a localização{' '}
            <strong>{LOCATION[o.location].label.toLowerCase()}</strong>. Ninguém precisou digitar nada.
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

    case 'close-form': {
      const o = orderOf(view.osId);
      if (!o) {
        body = null;
        break;
      }
      body = (
        <>
          <BackBar onBack={() => go({ s: 'close-scan' })} step={2} total={2} />
          <CloseStep
            order={o}
            equip={eqOf(o.equipId)}
            snap={snap}
            now={now}
            photoSide={photoSide}
            busy={busy === 'close'}
            onCancel={home}
            onSubmit={(data) =>
              run('close', async () => {
                await store.closeOrder({ osId: o.id, ...data, user });
                go({ s: 'close-done', osId: o.id });
              })
            }
          />
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
            No painel, o <strong>{o.equipId}</strong> voltou a aparecer como <strong>disponível</strong>, na operação.
          </Notice>
          <Button variant="outline" size="lg" block icon={House} onClick={home}>
            Voltar ao início
          </Button>
          {panelLink}
        </>
      );
      break;
    }

    default: {
      const waiting = mine.filter((o) => o.status === 'wait');
      const list = mineFilter === 'abertas' ? mine : mineFilter === 'aguardando' ? waiting : myClosed;
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
            <h3>Minhas OS</h3>
          </div>
          <Chips
            value={mineFilter}
            onChange={setMineFilter}
            options={[
              { id: 'abertas', label: `Em aberto (${mine.length})` },
              { id: 'aguardando', label: `Aguardando peça (${waiting.length})` },
              { id: 'finalizadas', label: `Finalizadas (${myClosed.length})` },
            ]}
          />
          {list.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={mineFilter === 'finalizadas' ? 'Nenhuma OS finalizada por você ainda' : 'Nenhuma OS aqui'}
              text={
                mineFilter === 'abertas' ? 'Toque em Abrir OS quando um equipamento chegar com problema.' : undefined
              }
            />
          ) : (
            <div className="olist">
              {list.map((o) => (
                <OrderCard
                  key={o.id}
                  o={o}
                  snap={snap}
                  now={now}
                  expandable
                  actions={
                    o.status === 'closed' ? undefined : (
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
                    )
                  }
                />
              ))}
            </div>
          )}
        </>
      );
    }
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

/* ---------- dados da abertura: horímetro, localização, descrição e fotos ---------- */
function OpenDetailsStep({
  equip,
  problem,
  initialDescription,
  photoSide,
  busy,
  onSubmit,
}: {
  equip: Equipment;
  problem: string;
  initialDescription: string;
  photoSide: number;
  busy: boolean;
  onSubmit: (data: {
    hourMeter: number | null;
    location: EquipLocation;
    description: string;
    photos: string[];
  }) => void;
}) {
  const kind = KIND[equip.kind];
  const [hour, setHour] = useState('');
  const [location, setLocation] = useState<EquipLocation>(equip.location);
  const [description, setDescription] = useState(initialDescription);
  const [photos, setPhotos] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const parsed = hour.trim() ? parseHours(hour) : null;
  const lower = parsed !== null && equip.hourMeter !== null && parsed < equip.hourMeter;

  const submit = () => {
    if (hour.trim() && parsed === null) return setErr('Digite só números no horímetro, como 1234,5.');
    if (kind.hasHourMeter && parsed === null) return setErr('Informe o horímetro do equipamento.');
    setErr('');
    onSubmit({ hourMeter: parsed, location, description: description.trim(), photos });
  };

  return (
    <>
      <h2 className="screen-t">Dados da OS</h2>
      <p className="screen-s">
        {equip.id} · {problem}
      </p>
      <HourInput
        value={hour}
        onChange={setHour}
        lastKnown={equip.hourMeter}
        required={kind.hasHourMeter}
        warning={
          lower && equip.hourMeter !== null
            ? `Está menor que o último registrado (${formatHours(equip.hourMeter)}). Confira o número.`
            : undefined
        }
      />
      <FieldBlock label="Onde está o equipamento?">
        <LocationToggle value={location} onChange={setLocation} />
      </FieldBlock>
      <FieldBlock label="Descrição do problema (opcional)">
        <textarea
          className="text-field"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex.: pedal de freio baixo"
          aria-label="Descrição do problema"
        />
      </FieldBlock>
      <FieldBlock label="Fotos (opcional)">
        <PhotoPicker photos={photos} onChange={setPhotos} maxSide={photoSide} />
      </FieldBlock>
      {err && (
        <Notice tone="red" icon={TriangleAlert}>
          {err}
        </Notice>
      )}
      <Button variant="primary" size="xl" block icon={ClipboardPlus} busy={busy} onClick={submit}>
        Abrir OS
      </Button>
    </>
  );
}

/* ---------- fechamento: serviço, horímetro final, peças conferidas e fotos ---------- */
function CloseStep({
  order,
  equip,
  snap,
  now,
  photoSide,
  busy,
  onCancel,
  onSubmit,
}: {
  order: WorkOrder;
  equip: Equipment | undefined;
  snap: Snapshot;
  now: number;
  photoSide: number;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (data: { serviceDone: string; hourMeter: number | null; photos: string[] }) => void;
}) {
  const kind = equip ? KIND[equip.kind] : null;
  const [service, setService] = useState('');
  const [hour, setHour] = useState('');
  const [checked, setChecked] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const used = partsText(order, snap);

  const addChip = (chip: string) => setService((s) => (s.trim() ? `${s.trim()}; ${chip.toLowerCase()}` : chip));

  const submit = () => {
    if (!service.trim()) return setErr('Descreva o serviço executado. Os botões acima ajudam.');
    const parsed = hour.trim() ? parseHours(hour) : null;
    if (hour.trim() && parsed === null) return setErr('Digite só números no horímetro, como 1234,5.');
    if (kind?.hasHourMeter && parsed === null) return setErr('Informe o horímetro final.');
    if (parsed !== null && order.hourMeterStart !== null && parsed < order.hourMeterStart)
      return setErr(`O horímetro final não pode ser menor que o da abertura (${formatHours(order.hourMeterStart)}).`);
    if (!checked) return setErr('Confira as peças usadas e marque a caixa.');
    setErr('');
    onSubmit({ serviceDone: service.trim(), hourMeter: parsed, photos });
  };

  return (
    <>
      <h2 className="screen-t">Fechar a OS {order.id}</h2>
      <dl className="details">
        <div>
          <dt>Equipamento</dt>
          <dd>
            {order.equipId}
            {kind ? `, ${kind.label}` : ''}
          </dd>
        </div>
        <div>
          <dt>Problema</dt>
          <dd>{order.problem}</dd>
        </div>
        <div>
          <dt>Aberta</dt>
          <dd>
            {dateTime(order.openedAt)} ({ago(order.openedAt, now)}) por {order.tech}
          </dd>
        </div>
        <div>
          <dt>Horímetro na abertura</dt>
          <dd>{order.hourMeterStart !== null ? formatHours(order.hourMeterStart) : 'Não registrado'}</dd>
        </div>
      </dl>
      <FieldBlock label="Serviço executado">
        <div className="chips">
          {SERVICE_CHIPS.map((c) => (
            <button key={c} type="button" className="chip" onClick={() => addChip(c)}>
              {c}
            </button>
          ))}
        </div>
        <textarea
          className="text-field"
          rows={3}
          value={service}
          onChange={(e) => setService(e.target.value)}
          placeholder="Toque nos botões acima ou escreva aqui"
          aria-label="Serviço executado"
        />
      </FieldBlock>
      <HourInput
        label="Horímetro final"
        value={hour}
        onChange={setHour}
        lastKnown={order.hourMeterStart}
        required={!!kind?.hasHourMeter}
      />
      <FieldBlock label="Peças usadas">
        {used ? (
          <ul className="parts-list">
            {order.parts.map((x) => (
              <li key={x.partId}>
                {x.qty} × {snap.parts.find((p) => p.id === x.partId)?.name ?? x.partId}
              </li>
            ))}
          </ul>
        ) : (
          <p className="fld-h">Nenhuma peça retirada nesta OS.</p>
        )}
        <label className="check">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>{used ? 'Conferi as peças usadas' : 'Confirmo que não usei peças do estoque'}</span>
        </label>
      </FieldBlock>
      <FieldBlock label="Fotos do serviço (opcional)">
        <PhotoPicker photos={photos} onChange={setPhotos} maxSide={photoSide} />
      </FieldBlock>
      {err && (
        <Notice tone="red" icon={TriangleAlert}>
          {err}
        </Notice>
      )}
      <Button size="xl" tone="green" block icon={CircleCheck} busy={busy} onClick={submit}>
        Fechar OS e liberar equipamento
      </Button>
      <Button variant="outline" size="lg" block onClick={onCancel}>
        Ainda não
      </Button>
    </>
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
function VoiceStep({ equipId, onSubmit }: { equipId: string; onSubmit: (text: string) => void }) {
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
          <Button variant="primary" size="xl" block disabled={!text.trim()} onClick={() => onSubmit(text.trim())}>
            Continuar
          </Button>
        </>
      )}
      <p className="hint">No app de verdade, o celular escreve o que a pessoa fala.</p>
    </>
  );
}
