import type { DataStore, Snapshot } from '../types';
import { whoOf } from '../lib/format';
import { makeSeed, type SeedData } from './seed';
import { AppError, addPart, assertOpen, assertStock, logText, newLog } from './rules';

const KEY = 'oficina-gse-demo-v1';
const MAX_LOG = 60;

function load(): SeedData | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SeedData) : null;
  } catch {
    return null;
  }
}

function save(s: SeedData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* navegador sem armazenamento: segue só na memória */
  }
}

const toSnapshot = (s: SeedData): Snapshot => ({
  equipment: s.equipment,
  parts: s.parts,
  orders: [...s.orders].sort((a, b) => b.openedAt - a.openedAt),
  log: s.log,
  technicians: s.technicians,
});

/**
 * Modo demonstração: guarda os dados neste navegador.
 * Abas abertas no mesmo computador se atualizam juntas (técnico numa aba, painel na outra).
 */
export function createLocalStore(): DataStore {
  let state: SeedData = load() ?? makeSeed(Date.now());
  const listeners = new Set<(s: Snapshot) => void>();
  const notify = () => listeners.forEach((l) => l(toSnapshot(state)));
  const commit = (next: SeedData) => {
    state = { ...next, log: next.log.slice(0, MAX_LOG) };
    save(state);
    notify();
  };

  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      state = JSON.parse(e.newValue) as SeedData;
      notify();
    } catch {
      /* ignora */
    }
  });

  const findOrder = (osId: number) => state.orders.find((o) => o.id === osId);
  const findPart = (partId: string) => state.parts.find((p) => p.id === partId);

  return {
    mode: 'demo',

    subscribe(onData, onStatus) {
      listeners.add(onData);
      onStatus('demo');
      onData(toSnapshot(state));
      return () => {
        listeners.delete(onData);
      };
    },

    async openOrder({ equipId, problem, user }) {
      const eq = state.equipment.find((e) => e.id === equipId);
      if (!eq) throw new AppError('Equipamento não encontrado.');
      if (eq.osId) throw new AppError(`O ${equipId} já tem a OS ${eq.osId} aberta.`);
      const now = Date.now();
      const id = state.nextOs;
      const who = whoOf(user);
      commit({
        ...state,
        nextOs: id + 1,
        orders: [
          {
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
          },
          ...state.orders,
        ],
        equipment: state.equipment.map((e) => (e.id === equipId ? { ...e, status: 'down', osId: id } : e)),
        log: [newLog('open', logText.open(who, id, equipId, problem), now), ...state.log],
      });
      return id;
    },

    async pickPart({ osId, partId, qty, user }) {
      const o = assertOpen(findOrder(osId), osId);
      const p = assertStock(findPart(partId), qty);
      const now = Date.now();
      commit({
        ...state,
        parts: state.parts.map((x) => (x.id === p.id ? { ...x, qty: x.qty - qty } : x)),
        orders: state.orders.map((x) => (x.id === o.id ? { ...x, parts: addPart(x.parts, p.id, qty) } : x)),
        log: [newLog('pick', logText.pick(whoOf(user), qty, p.name, osId), now), ...state.log],
      });
      return p.qty - qty;
    },

    async undoPick({ osId, partId, qty, user }) {
      const o = findOrder(osId);
      const p = findPart(partId);
      if (!o || !p) throw new AppError('Não foi possível desfazer.');
      const now = Date.now();
      commit({
        ...state,
        parts: state.parts.map((x) => (x.id === p.id ? { ...x, qty: x.qty + qty } : x)),
        orders: state.orders.map((x) => (x.id === o.id ? { ...x, parts: addPart(x.parts, p.id, -qty) } : x)),
        log: [newLog('undo', logText.undo(whoOf(user), qty, p.name, osId), now), ...state.log],
      });
    },

    async markWaiting({ osId, partId }) {
      const o = assertOpen(findOrder(osId), osId);
      const p = findPart(partId);
      if (!p) throw new AppError('Peça não encontrada.');
      const now = Date.now();
      commit({
        ...state,
        orders: state.orders.map((x) => (x.id === o.id ? { ...x, status: 'wait', waitPartId: p.id } : x)),
        equipment: state.equipment.map((e) => (e.id === o.equipId ? { ...e, status: 'wait' } : e)),
        log: [newLog('wait', logText.wait(o.id, o.equipId, p.name), now), ...state.log],
      });
    },

    async closeOrder({ osId, user }) {
      const o = assertOpen(findOrder(osId), osId);
      const now = Date.now();
      const who = whoOf(user);
      commit({
        ...state,
        orders: state.orders.map((x) => (x.id === o.id ? { ...x, status: 'closed', closedAt: now, closedBy: who } : x)),
        equipment: state.equipment.map((e) => (e.id === o.equipId ? { ...e, status: 'ok', osId: null } : e)),
        log: [newLog('close', logText.close(who, o.id, o.equipId), now), ...state.log],
      });
    },

    async reset() {
      commit(makeSeed(Date.now()));
    },
  };
}
