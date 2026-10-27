export type EquipKind = 'tmx' | 'nbl';
export type EquipStatus = 'ok' | 'down' | 'wait';
export type OrderStatus = 'open' | 'wait' | 'closed';
export type LogKind = 'open' | 'pick' | 'undo' | 'wait' | 'close';

export interface Equipment {
  id: string;
  kind: EquipKind;
  status: EquipStatus;
  osId: number | null;
}

export interface Part {
  id: string;
  name: string;
  fits: string;
  pn: string;
  loc: string;
  qty: number;
  min: number;
}

export interface OrderPart {
  partId: string;
  qty: number;
}

export interface WorkOrder {
  id: number;
  equipId: string;
  problem: string;
  tech: string;
  techBp: string;
  status: OrderStatus;
  openedAt: number;
  closedAt: number | null;
  closedBy: string | null;
  parts: OrderPart[];
  waitPartId: string | null;
}

export interface LogEntry {
  id: string;
  at: number;
  kind: LogKind;
  text: string;
}

export interface Technician {
  bp: string;
  name: string;
}

export interface User {
  bp: string;
  name: string | null;
}

/** Tudo o que as telas precisam para desenhar o estado atual. */
export interface Snapshot {
  equipment: Equipment[];
  parts: Part[];
  orders: WorkOrder[];
  log: LogEntry[];
  technicians: Technician[];
}

export type ConnStatus = 'connecting' | 'online' | 'offline' | 'demo' | 'error';

export interface OpenInput {
  equipId: string;
  problem: string;
  user: User;
}
export interface PickInput {
  osId: number;
  partId: string;
  qty: number;
  user: User;
}
export interface WaitInput {
  osId: number;
  partId: string;
  user: User;
}
export interface CloseInput {
  osId: number;
  user: User;
}

/** Camada de dados: a mesma interface para o Firebase e para o modo demonstração. */
export interface DataStore {
  readonly mode: 'firebase' | 'demo';
  subscribe(onData: (s: Snapshot) => void, onStatus: (s: ConnStatus) => void): () => void;
  /** Abre a OS e devolve o número dela. */
  openOrder(input: OpenInput): Promise<number>;
  /** Retira a peça do estoque e devolve quanto sobrou. */
  pickPart(input: PickInput): Promise<number>;
  undoPick(input: PickInput): Promise<void>;
  markWaiting(input: WaitInput): Promise<void>;
  closeOrder(input: CloseInput): Promise<void>;
  /** Volta tudo para os dados de exemplo. */
  reset(): Promise<void>;
}
