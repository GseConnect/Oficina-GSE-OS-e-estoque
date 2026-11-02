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
  where,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type Transaction,
  type WriteBatch,
} from 'firebase/firestore';

import type { DataStore, Equipment, LogEntry, Part, Photo, Technician, WorkOrder } from '../types';
import { whoOf } from '../lib/format';
import { makeSeed } from './seed';
import {
  AppError,
  addPart,
  assertClose,
  assertEquipmentInput,
  assertOpen,
  assertStock,
  assertTechnicianInput,
  logText,
} from './rules';

type ColName = 'equipamentos' | 'pecas' | 'ordens' | 'movimentacoes' | 'tecnicos' | 'fotos' | 'config';

const toEquipment = (id: string, d: DocumentData): Equipment => ({
  id,
  kind: d.kind,
  status: d.status,
  osId: d.osId ?? null,
  location: d.location ?? 'operacao',
  hourMeter: d.hourMeter ?? null,
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
// Campos novos da versão 0.2 ganham valor padrão, para ler também OS gravadas pela versão anterior.
const toOrder = (d: DocumentData): WorkOrder => ({
  id: d.id,
  equipId: d.equipId,
  problem: d.problem,
  description: d.description ?? '',
  location: d.location ?? 'oficina',
  tech: d.tech,
  techBp: d.techBp,
  status: d.status,
  openedAt: d.openedAt,
  hourMeterStart: d.hourMeterStart ?? null,
  closedAt: d.closedAt ?? null,
  closedBy: d.closedBy ?? null,
  closedByBp: d.closedByBp ?? null,
  hourMeterEnd: d.hourMeterEnd ?? null,
  serviceDone: d.serviceDone ?? null,
  photoCount: d.photoCount ?? 0,
  parts: d.parts ?? [],
  waitPartId: d.waitPartId ?? null,
});
const toLog = (id: string, d: DocumentData): LogEntry => ({ id, at: d.at, kind: d.kind, text: d.text });
const toTech = (id: string, d: DocumentData): Technician => ({ bp: id, name: d.name });
const toPhoto = (id: string, d: DocumentData): Photo => ({
  id,
  osId: d.osId,
  stage: d.stage,
  data: d.data,
  at: d.at,
  by: d.by,
});

/**
 * Dados no Cloud Firestore, com atualização em tempo real (onSnapshot).
 * Coleções usadas (com o prefixo, por padrão "oficina_"):
 *   equipamentos, pecas, ordens, movimentacoes, tecnicos, fotos, config/contador
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
    if (code === 'invalid-argument') return new AppError('A foto ficou grande demais. Tente de novo com menos fotos.');
    return new AppError('Não foi possível salvar. Tente de novo.');
  };
  const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      throw friendly(e);
    }
  };
  const savePhotos = (tx: Transaction, osId: number, stage: Photo['stage'], list: string[], by: string, at: number) =>
    list.forEach((data) => tx.set(doc(col('fotos')), { osId, stage, data, at, by }));

  async function writeSeed(): Promise<void> {
    const seed = makeSeed(Date.now());
    const keepOrders = new Set(seed.orders.map((o) => String(o.id)));
    const keepLogs = new Set(seed.log.map((l) => l.id));
    const keepEquip = new Set(seed.equipment.map((e) => e.id));
    const keepTechs = new Set(seed.technicians.map((t) => t.bp));
    const [ordersQs, logQs, photoQs, equipQs, techQs] = await Promise.all([
      getDocs(col('ordens')),
      getDocs(col('movimentacoes')),
      getDocs(col('fotos')),
      getDocs(col('equipamentos')),
      getDocs(col('tecnicos')),
    ]);
    const ops: Array<(b: WriteBatch) => void> = [];
    const drop = (docs: typeof ordersQs.docs, keep?: Set<string>) =>
      docs.forEach((d) => {
        if (!keep || !keep.has(d.id)) ops.push((batch) => batch.delete(d.ref));
      });
    drop(ordersQs.docs, keepOrders);
    drop(logQs.docs, keepLogs);
    drop(photoQs.docs);
    drop(equipQs.docs, keepEquip);
    drop(techQs.docs, keepTechs);
    seed.equipment.forEach(({ id, ...rest }) => ops.push((b) => b.set(doc(col('equipamentos'), id), rest)));
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

    openOrder: ({ equipId, problem, description, location, hourMeter, photos, user }) =>
      guard(() =>
        runTransaction(db, async (tx) => {
          const eqRef = doc(col('equipamentos'), equipId);
          const cSnap = await tx.get(counterRef());
          const eSnap = await tx.get(eqRef);
          if (!eSnap.exists()) throw new AppError('Equipamento não encontrado.');
          const eq = toEquipment(eSnap.id, eSnap.data());
          if (eq.osId) throw new AppError(`O ${equipId} já tem a OS ${eq.osId} aberta.`);
          const id: number = cSnap.exists() ? Number(cSnap.data().nextOs) : 1041;
          const now = Date.now();
          const who = whoOf(user);
          const order: WorkOrder = {
            id,
            equipId,
            problem,
            description,
            location,
            tech: who,
            techBp: user.bp,
            status: 'open',
            openedAt: now,
            hourMeterStart: hourMeter,
            closedAt: null,
            closedBy: null,
            closedByBp: null,
            hourMeterEnd: null,
            serviceDone: null,
            photoCount: photos.length,
            parts: [],
            waitPartId: null,
          };
          tx.set(counterRef(), { nextOs: id + 1 }, { merge: true });
          tx.set(doc(col('ordens'), String(id)), order);
          tx.update(eqRef, { status: 'down', osId: id, location, hourMeter: hourMeter ?? eq.hourMeter });
          savePhotos(tx, id, 'abertura', photos, who, now);
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

    closeOrder: (input) =>
      guard(() =>
        runTransaction(db, async (tx) => {
          const { osId, serviceDone, hourMeter, photos, user } = input;
          const oRef = doc(col('ordens'), String(osId));
          const oSnap = await tx.get(oRef);
          const o = assertOpen(oSnap.exists() ? toOrder(oSnap.data()) : undefined, osId);
          assertClose(o, input);
          const eqRef = doc(col('equipamentos'), o.equipId);
          const eSnap = await tx.get(eqRef);
          const lastHour = eSnap.exists() ? toEquipment(eSnap.id, eSnap.data()).hourMeter : null;
          const now = Date.now();
          const who = whoOf(user);
          tx.update(oRef, {
            status: 'closed',
            closedAt: now,
            closedBy: who,
            closedByBp: user.bp,
            hourMeterEnd: hourMeter,
            serviceDone: serviceDone.trim(),
            photoCount: o.photoCount + photos.length,
          });
          tx.update(eqRef, { status: 'ok', osId: null, location: 'operacao', hourMeter: hourMeter ?? lastHour });
          savePhotos(tx, osId, 'fechamento', photos, who, now);
          tx.set(doc(col('movimentacoes')), { at: now, kind: 'close', text: logText.close(who, osId, o.equipId) });
        }),
      ),

    addEquipment: (input) =>
      guard(() =>
        runTransaction(db, async (tx) => {
          assertEquipmentInput(input);
          const ref = doc(col('equipamentos'), input.id);
          if ((await tx.get(ref)).exists()) throw new AppError(`O ${input.id} já está cadastrado.`);
          tx.set(ref, {
            kind: input.kind,
            status: 'ok',
            osId: null,
            location: input.location,
            hourMeter: input.hourMeter,
          });
          tx.set(doc(col('movimentacoes')), { at: Date.now(), kind: 'register', text: logText.equipment(input) });
        }),
      ),

    addTechnician: (input) =>
      guard(() =>
        runTransaction(db, async (tx) => {
          assertTechnicianInput(input);
          const tech = { bp: input.bp, name: input.name.trim() };
          const ref = doc(col('tecnicos'), tech.bp);
          if ((await tx.get(ref)).exists()) throw new AppError(`O BP ${tech.bp} já está cadastrado.`);
          tx.set(ref, { name: tech.name });
          tx.set(doc(col('movimentacoes')), { at: Date.now(), kind: 'register', text: logText.technician(tech) });
        }),
      ),

    getPhotos: (osId) =>
      guard(async () => {
        const qs = await getDocs(query(col('fotos'), where('osId', '==', osId)));
        return qs.docs.map((d) => toPhoto(d.id, d.data())).sort((a, b) => a.at - b.at);
      }),

    reset: () => guard(writeSeed),
  };
}
