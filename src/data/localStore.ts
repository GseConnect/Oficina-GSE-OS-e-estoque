import type { DataStore, Photo, Snapshot, User } from '../types';
import { whoOf } from '../lib/format';
import { makeSeed, type SeedData } from './seed';
import {
  AppError,
  addPart,
  assertClose,
  assertEquipmentInput,
  assertOpen,
  assertStock,
  assertTechnicianInput,
  logText,
  newLog,
} from './rules';

const KEY = 'oficina-gse-demo-v2';
const PHOTO_KEY = 'oficina-gse-demo-fotos-v2';
const MAX_LOG = 60;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* navegador sem espaço ou sem armazenamento: segue só na memória */
  }
}

const toSnapshot = (s: SeedData): Snapshot => ({
  equipment: s.equipment,
  parts: s.parts,
  orders: [...s.orders].sort((a, b) => b.openedAt - a.openedAt),
  log: s.log,
  technicians: s.technicians,
});

const photoId = () => `foto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Modo demonstração: guarda os dados neste navegador.
 * Abas abertas no mesmo computador se atualizam juntas (técnico numa aba, painel na outra).
 */
export function createLocalStore(): DataStore {
  let state: SeedData = read<SeedData>(KEY) ?? makeSeed(Date.now());
  let photos: Photo[] = read<Photo[]>(PHOTO_KEY) ?? [];
  const listeners = new Set<(s: Snapshot) => void>();
  const notify = () => listeners.forEach((l) => l(toSnapshot(state)));
  const commit = (next: SeedData) => {
    state = { ...next, log: next.log.slice(0, MAX_LOG) };
    write(KEY, state);
    notify();
  };
  const addPhotos = (osId: number, stage: Photo['stage'], list: string[], who: string, at: number) => {
    if (!list.length) return;
    photos = [...photos, ...list.map((data) => ({ id: photoId(), osId, stage, data, at, by: who }))];
    write(PHOTO_KEY, photos);
  };

  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) {
      state = read<SeedData>(KEY) ?? state;
      notify();
    } else if (e.key === PHOTO_KEY) {
      photos = read<Photo[]>(PHOTO_KEY) ?? [];
    }
  });

  const findOrder = (osId: number) => state.orders.find((o) => o.id === osId);
  const findPart = (partId: string) => state.parts.find((p) => p.id === partId);
  const who = (u: User) => whoOf(u);

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

    async openOrder({ equipId, problem, description, location, hourMeter, photos: pics, user }) {
      const eq = state.equipment.find((e) => e.id === equipId);
      if (!eq) throw new AppError('Equipamento não encontrado.');
      if (eq.osId) throw new AppError(`O ${equipId} já tem a OS ${eq.osId} aberta.`);
      const now = Date.now();
      const id = state.nextOs;
      const name = who(user);
      addPhotos(id, 'abertura', pics, name, now);
      commit({
        ...state,
        nextOs: id + 1,
        orders: [
          {
            id,
            equipId,
            problem,
            description,
            location,
            tech: name,
            techBp: user.bp,
            status: 'open',
            openedAt: now,
            hourMeterStart: hourMeter,
            closedAt: null,
            closedBy: null,
            closedByBp: null,
            hourMeterEnd: null,
            serviceDone: null,
            photoCount: pics.length,
            parts: [],
            waitPartId: null,
          },
          ...state.orders,
        ],
        equipment: state.equipment.map((e) =>
          e.id === equipId ? { ...e, status: 'down', osId: id, location, hourMeter: hourMeter ?? e.hourMeter } : e,
        ),
        log: [newLog('open', logText.open(name, id, equipId, problem), now), ...state.log],
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
        log: [newLog('pick', logText.pick(who(user), qty, p.name, osId), now), ...state.log],
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
        log: [newLog('undo', logText.undo(who(user), qty, p.name, osId), now), ...state.log],
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

    async closeOrder(input) {
      const { osId, serviceDone, hourMeter, photos: pics, user } = input;
      const o = assertOpen(findOrder(osId), osId);
      assertClose(o, input);
      const now = Date.now();
      const name = who(user);
      addPhotos(o.id, 'fechamento', pics, name, now);
      commit({
        ...state,
        orders: state.orders.map((x) =>
          x.id === o.id
            ? {
                ...x,
                status: 'closed',
                closedAt: now,
                closedBy: name,
                closedByBp: user.bp,
                hourMeterEnd: hourMeter,
                serviceDone: serviceDone.trim(),
                photoCount: x.photoCount + pics.length,
              }
            : x,
        ),
        equipment: state.equipment.map((e) =>
          e.id === o.equipId
            ? { ...e, status: 'ok', osId: null, location: 'operacao', hourMeter: hourMeter ?? e.hourMeter }
            : e,
        ),
        log: [newLog('close', logText.close(name, o.id, o.equipId), now), ...state.log],
      });
    },

    async addEquipment(input) {
      assertEquipmentInput(input);
      if (state.equipment.some((e) => e.id === input.id)) throw new AppError(`O ${input.id} já está cadastrado.`);
      commit({
        ...state,
        equipment: [...state.equipment, { ...input, status: 'ok' as const, osId: null }].sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
        log: [newLog('register', logText.equipment(input), Date.now()), ...state.log],
      });
    },

    async addTechnician(input) {
      assertTechnicianInput(input);
      if (state.technicians.some((t) => t.bp === input.bp)) throw new AppError(`O BP ${input.bp} já está cadastrado.`);
      const tech = { bp: input.bp, name: input.name.trim() };
      commit({
        ...state,
        technicians: [...state.technicians, tech],
        log: [newLog('register', logText.technician(tech), Date.now()), ...state.log],
      });
    },

    async getPhotos(osId) {
      return photos.filter((p) => p.osId === osId).sort((a, b) => a.at - b.at);
    },

    async reset() {
      photos = [];
      write(PHOTO_KEY, photos);
      commit(makeSeed(Date.now()));
    },
  };
}
