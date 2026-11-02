export type EquipKind = 'tmx' | 'nbl' | 'gpu' | 'escada' | 'outro';
export type EquipStatus = 'ok' | 'down' | 'wait';
export type EquipLocation = 'oficina' | 'operacao';
export type OrderStatus = 'open' | 'wait' | 'closed';
export type LogKind = 'open' | 'pick' | 'undo' | 'wait' | 'close' | 'register';

export interface Equipment {
  id: string;
  kind: EquipKind;
  status: EquipStatus;
  osId: number | null;
  location: EquipLocation;
  /** Último horímetro registrado (na abertura ou no fechamento de uma OS). */
  hourMeter: number | null;
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
  /** Descrição detalhada feita na abertura (pode ficar vazia). */
  description: string;
  /** Onde o equipamento estava quando a OS foi aberta. */
  location: EquipLocation;
  tech: string;
  techBp: string;
  status: OrderStatus;
  openedAt: number;
  hourMeterStart: number | null;
  closedAt: number | null;
  closedBy: string | null;
  closedByBp: string | null;
  hourMeterEnd: number | null;
  serviceDone: string | null;
  photoCount: number;
  parts: OrderPart[];
  waitPartId: string | null;
}

export interface Photo {
  id: string;
  osId: number;
  stage: 'abertura' | 'fechamento';
  /** Imagem JPEG reduzida, em data URL. */
  data: string;
  at: number;
  by: string;
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
  description: string;
  location: EquipLocation;
  hourMeter: number | null;
  photos: string[];
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
  serviceDone: string;
  hourMeter: number | null;
  photos: string[];
  user: User;
}
export interface NewEquipmentInput {
  id: string;
  kind: EquipKind;
  location: EquipLocation;
  hourMeter: number | null;
}
export interface NewTechnicianInput {
  bp: string;
  name: string;
}

/** Camada de dados: a mesma interface para o Firebase e para o modo demonstração. */
export interface DataStore {
  readonly mode: 'supabase' | 'firebase' | 'demo';
  subscribe(onData: (s: Snapshot) => void, onStatus: (s: ConnStatus) => void): () => void;
  /** Abre a OS e devolve o número dela. */
  openOrder(input: OpenInput): Promise<number>;
  /** Retira a peça do estoque e devolve quanto sobrou. */
  pickPart(input: PickInput): Promise<number>;
  undoPick(input: PickInput): Promise<void>;
  markWaiting(input: WaitInput): Promise<void>;
  closeOrder(input: CloseInput): Promise<void>;
  addEquipment(input: NewEquipmentInput): Promise<void>;
  addTechnician(input: NewTechnicianInput): Promise<void>;
  /** Fotos de uma OS (abertura e fechamento), da mais antiga para a mais nova. */
  getPhotos(osId: number): Promise<Photo[]>;
  /** Volta tudo para os dados de exemplo. */
  reset(): Promise<void>;
}
