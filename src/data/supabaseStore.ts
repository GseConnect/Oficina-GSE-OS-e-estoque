import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';

import type {
  ConnStatus,
  DataStore,
  EquipKind,
  EquipLocation,
  EquipStatus,
  Equipment,
  LogEntry,
  LogKind,
  OrderStatus,
  Photo,
  Technician,
  WorkOrder,
} from '../types';
import { whoOf } from '../lib/format';
import { makeSeed } from './seed';
import { AppError } from './rules';

/* Linhas como o banco devolve (veja supabase/schema.sql). Horários são milissegundos, como no resto do app. */
interface EquipRow {
  id: string;
  kind: EquipKind;
  status: EquipStatus;
  os_id: number | null;
  location: EquipLocation;
  hour_meter: number | null;
}
interface PartRow {
  id: string;
  name: string;
  fits: string;
  pn: string;
  loc: string;
  qty: number;
  min: number;
}
interface OrderRow {
  id: number;
  equip_id: string;
  problem: string;
  description: string;
  location: EquipLocation;
  tech: string;
  tech_bp: string;
  status: OrderStatus;
  opened_at: number;
  hour_meter_start: number | null;
  closed_at: number | null;
  closed_by: string | null;
  closed_by_bp: string | null;
  hour_meter_end: number | null;
  service_done: string | null;
  photo_count: number;
  wait_part_id: string | null;
}
interface OrderPartRow {
  os_id: number;
  part_id: string;
  qty: number;
}
interface LogRow {
  id: string;
  at: number;
  kind: LogKind;
  text: string;
}
interface TechRow {
  bp: string;
  name: string;
}
interface PhotoRow {
  id: string;
  os_id: number;
  stage: Photo['stage'];
  data: string;
  at: number;
  by: string;
}
interface ConfigRow {
  seeded: boolean;
}

const toEquipment = (r: EquipRow): Equipment => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  osId: r.os_id,
  location: r.location,
  hourMeter: r.hour_meter,
});
const toOrder = (r: OrderRow, parts: OrderPartRow[]): WorkOrder => ({
  id: r.id,
  equipId: r.equip_id,
  problem: r.problem,
  description: r.description,
  location: r.location,
  tech: r.tech,
  techBp: r.tech_bp,
  status: r.status,
  openedAt: r.opened_at,
  hourMeterStart: r.hour_meter_start,
  closedAt: r.closed_at,
  closedBy: r.closed_by,
  closedByBp: r.closed_by_bp,
  hourMeterEnd: r.hour_meter_end,
  serviceDone: r.service_done,
  photoCount: r.photo_count,
  parts: parts.filter((p) => p.os_id === r.id).map((p) => ({ partId: p.part_id, qty: p.qty })),
  waitPartId: r.wait_part_id,
});

const TABLES = [
  'oficina_equipamentos',
  'oficina_pecas',
  'oficina_tecnicos',
  'oficina_ordens',
  'oficina_ordem_pecas',
  'oficina_movimentacoes',
] as const;

/** Enquanto o tempo real não conecta (ou se cair), o app confere o banco a cada tantos segundos. */
const SAFETY_POLL_MS = 20_000;

/**
 * Dados no Supabase (PostgreSQL), com atualização em tempo real.
 * As gravações passam por funções do banco (supabase/schema.sql), que validam tudo e são atômicas.
 */
export function createSupabaseStore(url: string, anonKey: string): DataStore {
  const db: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: false } });

  const friendly = (err: PostgrestError | { message: string; code?: string }): Error => {
    const code = 'code' in err ? err.code : undefined;
    // Erros escritos nas funções do banco (raise exception) chegam com este código e já vêm em português.
    if (code === 'P0001') return new AppError(err.message);
    console.error(err);
    if (code === 'PGRST202' || code === '42P01' || code === 'PGRST205')
      return new AppError('O banco ainda não foi preparado. Rode o arquivo supabase/schema.sql no Supabase.');
    if (code === '42501' || code === 'PGRST301')
      return new AppError('O Supabase recusou a operação. Confira as permissões do banco.');
    if (/fetch|network|failed/i.test(err.message))
      return new AppError('Sem conexão com o servidor. Confira a internet e tente de novo.');
    return new AppError('Não foi possível salvar. Tente de novo.');
  };

  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await db.rpc(name, args);
    if (error) throw friendly(error);
    return data as T;
  }

  async function load() {
    const [eq, pa, te, or, op, lg] = await Promise.all([
      db.from('oficina_equipamentos').select('*').order('id'),
      db.from('oficina_pecas').select('*'),
      db.from('oficina_tecnicos').select('*'),
      db.from('oficina_ordens').select('*').order('opened_at', { ascending: false }).limit(300),
      db.from('oficina_ordem_pecas').select('*'),
      db.from('oficina_movimentacoes').select('*').order('at', { ascending: false }).limit(60),
    ]);
    const failed = [eq, pa, te, or, op, lg].find((r) => r.error);
    if (failed?.error) throw failed.error;
    const orderParts = (op.data ?? []) as OrderPartRow[];
    return {
      equipment: ((eq.data ?? []) as EquipRow[]).map(toEquipment).sort((a, b) => a.id.localeCompare(b.id)),
      parts: ((pa.data ?? []) as PartRow[]).sort((a, b) => a.id.localeCompare(b.id, 'pt-BR', { numeric: true })),
      orders: ((or.data ?? []) as OrderRow[]).map((r) => toOrder(r, orderParts)),
      log: ((lg.data ?? []) as LogRow[]).map((r): LogEntry => ({ id: r.id, at: r.at, kind: r.kind, text: r.text })),
      technicians: ((te.data ?? []) as TechRow[]).map((r): Technician => ({ bp: r.bp, name: r.name })),
    };
  }

  /** Grava os dados de exemplo (primeira vez e "Reiniciar demonstração"). */
  const writeSeed = () => rpc<void>('oficina_reiniciar', { p: makeSeed(Date.now()) });

  // Quem fez a gravação vê o resultado na hora, sem esperar o tempo real.
  const listeners = new Set<() => void>();
  const refreshAll = () => listeners.forEach((l) => l());
  const write = async <T>(fn: () => Promise<T>): Promise<T> => {
    const out = await fn();
    refreshAll();
    return out;
  };

  return {
    mode: 'supabase',

    subscribe(onData, onStatus) {
      let stopped = false;
      let loaded = false;
      let timer: number | undefined;
      let realtimeOk = false;

      const status = (): ConnStatus => (!navigator.onLine ? 'offline' : loaded ? 'online' : 'connecting');
      onStatus(status());

      const refresh = async () => {
        try {
          const snap = await load();
          if (stopped) return;
          loaded = true;
          onData(snap);
          onStatus(status());
        } catch (e) {
          console.error(e);
          if (!stopped) onStatus(navigator.onLine ? 'error' : 'offline');
        }
      };
      // Vários eventos seguidos (uma OS mexe em 4 tabelas) viram uma leitura só.
      const schedule = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void refresh(), 150);
      };
      listeners.add(schedule);

      let channel = db.channel('oficina-gse');
      for (const table of TABLES) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule);
      }
      channel.subscribe((s) => {
        realtimeOk = s === 'SUBSCRIBED';
        if (realtimeOk) schedule();
      });
      const poll = window.setInterval(() => {
        if (!realtimeOk) void refresh();
      }, SAFETY_POLL_MS);
      const slowPoll = window.setInterval(() => void refresh(), SAFETY_POLL_MS * 3);
      const goOnline = () => void refresh();
      const goOffline = () => onStatus('offline');
      window.addEventListener('online', goOnline);
      window.addEventListener('offline', goOffline);

      // Primeira vez neste banco: grava os dados de exemplo.
      void (async () => {
        try {
          const { data, error } = await db.from('oficina_config').select('seeded').eq('id', 1).maybeSingle();
          if (error) throw error;
          if (!(data as ConfigRow | null)?.seeded) await writeSeed();
        } catch (e) {
          console.error(e);
          if (!stopped) onStatus('error');
          return;
        }
        void refresh();
      })();

      return () => {
        stopped = true;
        listeners.delete(schedule);
        window.clearTimeout(timer);
        window.clearInterval(poll);
        window.clearInterval(slowPoll);
        window.removeEventListener('online', goOnline);
        window.removeEventListener('offline', goOffline);
        void db.removeChannel(channel);
      };
    },

    openOrder: ({ equipId, problem, description, location, hourMeter, photos, user }) =>
      write(() =>
        rpc<number>('oficina_abrir_os', {
          p_equip: equipId,
          p_problem: problem,
          p_description: description,
          p_location: location,
          p_hour: hourMeter,
          p_photos: photos,
          p_bp: user.bp,
          p_who: whoOf(user),
        }),
      ),

    pickPart: ({ osId, partId, qty, user }) =>
      write(() => rpc<number>('oficina_retirar_peca', { p_os: osId, p_part: partId, p_qty: qty, p_who: whoOf(user) })),

    undoPick: ({ osId, partId, qty, user }) =>
      write(() =>
        rpc<void>('oficina_desfazer_retirada', { p_os: osId, p_part: partId, p_qty: qty, p_who: whoOf(user) }),
      ),

    markWaiting: ({ osId, partId }) => write(() => rpc<void>('oficina_aguardar_peca', { p_os: osId, p_part: partId })),

    closeOrder: ({ osId, serviceDone, hourMeter, photos, user }) =>
      write(() =>
        rpc<void>('oficina_fechar_os', {
          p_os: osId,
          p_service: serviceDone,
          p_hour: hourMeter,
          p_photos: photos,
          p_bp: user.bp,
          p_who: whoOf(user),
        }),
      ),

    addEquipment: ({ id, kind, location, hourMeter }) =>
      write(() =>
        rpc<void>('oficina_cadastrar_equipamento', { p_id: id, p_kind: kind, p_location: location, p_hour: hourMeter }),
      ),

    addTechnician: ({ bp, name }) => write(() => rpc<void>('oficina_cadastrar_tecnico', { p_bp: bp, p_name: name })),

    async getPhotos(osId) {
      const { data, error } = await db.from('oficina_fotos').select('*').eq('os_id', osId).order('at');
      if (error) throw friendly(error);
      return ((data ?? []) as PhotoRow[]).map((r): Photo => ({
        id: r.id,
        osId: r.os_id,
        stage: r.stage,
        data: r.data,
        at: r.at,
        by: r.by,
      }));
    },

    reset: () => write(writeSeed),
  };
}
