import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type WriteBatch,
} from 'firebase/firestore';

import type { DataStore, Equipment, LogEntry, Part, Technician, WorkOrder } from '../types';
import { whoOf } from '../lib/format';
import { makeSeed } from './seed';
import { AppError, addPart, assertOpen, assertStock, logText } from './rules';

type ColName = 'equipamentos' | 'pecas' | 'ordens' | 'movimentacoes' | 'tecnicos' | 'config';

const toEquipment = (id: string, d: DocumentData): Equipment => ({
  id,
  kind: d.kind,
  status: d.status,
  osId: d.osId ?? null,
});
const toPart = (id: string, d: DocumentData): Part => ({
  id,
  name: d.name,
  fits: d.fits,
  pn: d.pn,
  loc: d.loc,
  qty: d.qty,
  min: d.min,
});
const toOrder = (d: DocumentData): WorkOrder => ({
  id: d.id,
  equipId: d.equipId,
  problem: d.problem,
  tech: d.tech,
  techBp: d.techBp,
  status: d.status,
  openedAt: d.openedAt,
  closedAt: d.closedAt ?? null,
  closedBy: d.closedBy ?? null,
  parts: d.parts ?? [],
  waitPartId: d.waitPartId ?? null,
});
const toLog = (id: string, d: DocumentData): LogEntry => ({ id, at: d.at, kind: d.kind, text: d.text });
const toTech = (id: string, d: DocumentData): Technician => ({ bp: id, name: d.name });

/**
 * Dados no Cloud Firestore, com atualização em tempo real (onSnapshot).
 * Coleções usadas (com o prefixo, por padrão "oficina_"):
 *   equipamentos, pecas, ordens, movimentacoes, tecnicos, config/contador
 */
export function createFirebaseStore(options: FirebaseOptions, prefix: string): DataStore {
  const db = getFirestore(initializeApp(options));
  const col = (name: ColName) => collection(db, `${prefix}${name}`);
  const counterRef = () => doc(col('config'), 'contador');

  const friendly = (err: unknown): Error => {
    if (err instanceof AppError) return err;
    const code = (err as { code?: string } | null)?.code ?? '';
    console.error(err);
    if (code === 'unavailable' || code === 'deadline-exceeded')
      return new AppError('Sem conexão com o servidor. Confira a internet e tente de novo.');
    if (code === 'permission-denied')
      return new AppError('O Firestore recusou a gravação. Confira as regras do banco.');
    if (code === 'aborted' || code === 'failed-precondition')
      return new AppError('Outra pessoa alterou isso agora. Tente de novo.');
    return new AppError('Não foi possível salvar. Tente de novo.');
  };
  const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      throw friendly(e);
    }
  };

  async function writeSeed(): Promise<void> {
    const seed = makeSeed(Date.now());
    const keepOrders = new Set(seed.orders.map((o) => String(o.id)));
    const keepLogs = new Set(seed.log.map((l) => l.id));
    const [ordersQs, logQs] = await Promise.all([getDocs(col('ordens')), getDocs(col('movimentacoes'))]);
    const ops: Array<(b: WriteBatch) => void> = [];
    ordersQs.forEach((d) => {
      if (!keepOrders.has(d.id)) ops.push((b) => b.delete(d.ref));
    });
    logQs.forEach((d) => {
      if (!keepLogs.has(d.id)) ops.push((b) => b.delete(d.ref));
    });
    seed.equipment.forEach((e) =>
      ops.push((b) => b.set(doc(col('equipamentos'), e.id), { kind: e.kind, status: e.status, osId: e.osId })),
    );
    seed.parts.forEach(({ id, ...rest }) => ops.push((b) => b.set(doc(col('pecas'), id), rest)));
    seed.technicians.forEach((t) => ops.push((b) => b.set(doc(col('tecnicos'), t.bp), { name: t.name })));
    seed.orders.forEach((o) => ops.push((b) => b.set(doc(col('ordens'), String(o.id)), o)));
    seed.log.forEach(({ id, ...rest }) => ops.push((b) => b.set(doc(col('movimentacoes'), id), rest)));
    ops.push((b) => b.set(counterRef(), { nextOs: seed.nextOs, seededAt: Date.now() }));
    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(db);
      ops.slice(i, i + 400).forEach((op) => op(batch));
      await batch.commit();
    }
  }

  return {
    mode: 'firebase',

    subscribe(onData, onStatus) {
      onStatus(navigator.onLine ? 'connecting' : 'offline');
      const cur: {
        equipment?: Equipment[];
        parts?: Part[];
        orders?: WorkOrder[];
        log?: LogEntry[];
        technicians?: Technician[];
      } = {};
      let loaded = false;
      const emit = () => {
        const { equipment, parts, orders, log, technicians } = cur;
        if (!equipment || !parts || !orders || !log || !technicians) return;
        if (!loaded) {
          loaded = true;
          onStatus(navigator.onLine ? 'online' : 'offline');
        }
        onData({ equipment, parts, orders, log, technicians });
      };
      const onErr = (e: FirestoreError | Error) => {
        console.error(e);
        onStatus('error');
      };
      const unsubs = [
        onSnapshot(
          col('equipamentos'),
          (qs) => {
            cur.equipment = qs.docs.map((d) => toEquipment(d.id, d.data())).sort((a, b) => a.id.localeCompare(b.id));
            emit();
          },
          onErr,
        ),
        onSnapshot(
          col('pecas'),
          (qs) => {
            cur.parts = qs.docs
              .map((d) => toPart(d.id, d.data()))
              .sort((a, b) => a.id.localeCompare(b.id, 'pt-BR', { numeric: true }));
            emit();
          },
          onErr,
        ),
        onSnapshot(
          query(col('ordens'), orderBy('openedAt', 'desc'), limit(300)),
          (qs) => {
            cur.orders = qs.docs.map((d) => toOrder(d.data()));
            emit();
          },
          onErr,
        ),
        onSnapshot(
          query(col('movimentacoes'), orderBy('at', 'desc'), limit(60)),
          (qs) => {
            cur.log = qs.docs.map((d) => toLog(d.id, d.data()));
            emit();
          },
          onErr,
        ),
        onSnapshot(
          col('tecnicos'),
          (qs) => {
            cur.technicians = qs.docs.map((d) => toTech(d.id, d.data()));
            emit();
          },
          onErr,
        ),
      ];
      const goOnline = () => {
        if (loaded) onStatus('online');
      };
      const goOffline = () => onStatus('offline');
      window.addEventListener('online', goOnline);
      window.addEventListener('offline', goOffline);

      // Primeira vez neste projeto: grava os dados de exemplo.
      getDoc(counterRef())
        .then((s) => (s.exists() ? undefined : writeSeed()))
        .catch(onErr);

      return () => {
        unsubs.forEach((u) => u());
        window.removeEventListener('online', goOnline);
        window.removeEventListener('offline', goOffline);
      };
    },

    openOrder: ({ equipId, problem, user }) =>
      guard(() =>
        runTransaction(db, async (tx) => {
          const eqRef = doc(col('equipamentos'), equipId);
          const cSnap = await tx.get(counterRef());
          const eSnap = await tx.get(eqRef);
          if (!eSnap.exists()) throw new AppError('Equipamento não encontrado.');
          const osIdNow = eSnap.data().osId as number | null;
          if (osIdNow) throw new AppError(`O ${equipId} já tem a OS ${osIdNow} aberta.`);
          const id: number = cSnap.exists() ? Number(cSnap.data().nextOs) : 1041;
          const now = Date.now();
          const who = whoOf(user);
          const order: WorkOrder = {
            id,
            equipId,
            problem,
            tech: who,
            techBp: user.bp,
            status: 'open',
            openedAt: now,
            closedAt: null,
            closedBy: null,
            parts: [],
            waitPartId: null,
          };
          tx.set(counterRef(), { nextOs: id + 1 }, { merge: true });
          tx.set(doc(col('ordens'), String(id)), order);
          tx.update(eqRef, { status: 'down', osId: id });
          tx.set(doc(col('movimentacoes')), { at: now, kind: 'open', text: logText.open(who, id, equipId, problem) });
          return id;
        }),
      ),

    pickPart: ({ osId, partId, qty, user }) =>
      guard(() =>
        runTransaction(db, async (tx) => {
          const oRef = doc(col('ordens'), String(osId));
          const pRef = doc(col('pecas'), partId);
          const oSnap = await tx.get(oRef);
          const pSnap = await tx.get(pRef);
          const o = assertOpen(oSnap.exists() ? toOrder(oSnap.data()) : undefined, osId);
          const p = assertStock(pSnap.exists() ? toPart(pSnap.id, pSnap.data()) : undefined, qty);
          tx.update(pRef, { qty: p.qty - qty });
          tx.update(oRef, { parts: addPart(o.parts, partId, qty) });
          tx.set(doc(col('movimentacoes')), {
            at: Date.now(),
            kind: 'pick',
            text: logText.pick(whoOf(user), qty, p.name, osId),
          });
          return p.qty - qty;
        }),
      ),

    undoPick: ({ osId, partId, qty, user }) =>
      guard(() =>
        runTransaction(db, async (tx) => {
          const oRef = doc(col('ordens'), String(osId));
          const pRef = doc(col('pecas'), partId);
          const oSnap = await tx.get(oRef);
          const pSnap = await tx.get(pRef);
          if (!oSnap.exists() || !pSnap.exists()) throw new AppError('Não foi possível desfazer.');
          const o = toOrder(oSnap.data());
          const p = toPart(pSnap.id, pSnap.data());
          tx.update(pRef, { qty: p.qty + qty });
          tx.update(oRef, { parts: addPart(o.parts, partId, -qty) });
          tx.set(doc(col('movimentacoes')), {
            at: Date.now(),
            kind: 'undo',
            text: logText.undo(whoOf(user), qty, p.name, osId),
          });
        }),
      ),

    markWaiting: ({ osId, partId }) =>
      guard(() =>
        runTransaction(db, async (tx) => {
          const oRef = doc(col('ordens'), String(osId));
          const pRef = doc(col('pecas'), partId);
          const oSnap = await tx.get(oRef);
          const pSnap = await tx.get(pRef);
          const o = assertOpen(oSnap.exists() ? toOrder(oSnap.data()) : undefined, osId);
          if (!pSnap.exists()) throw new AppError('Peça não encontrada.');
          const partName = String(pSnap.data().name);
          tx.update(oRef, { status: 'wait', waitPartId: partId });
          tx.update(doc(col('equipamentos'), o.equipId), { status: 'wait' });
          tx.set(doc(col('movimentacoes')), {
            at: Date.now(),
            kind: 'wait',
            text: logText.wait(osId, o.equipId, partName),
          });
        }),
      ),

    closeOrder: ({ osId, user }) =>
      guard(() =>
        runTransaction(db, async (tx) => {
          const oRef = doc(col('ordens'), String(osId));
          const oSnap = await tx.get(oRef);
          const o = assertOpen(oSnap.exists() ? toOrder(oSnap.data()) : undefined, osId);
          const now = Date.now();
          const who = whoOf(user);
          tx.update(oRef, { status: 'closed', closedAt: now, closedBy: who });
          tx.update(doc(col('equipamentos'), o.equipId), { status: 'ok', osId: null });
          tx.set(doc(col('movimentacoes')), { at: now, kind: 'close', text: logText.close(who, osId, o.equipId) });
        }),
      ),

    reset: () => guard(writeSeed),
  };
}
