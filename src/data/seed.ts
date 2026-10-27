import type { Equipment, LogEntry, Part, Technician, WorkOrder } from '../types';
import { HOUR, MIN } from '../lib/format';

export interface SeedData {
  equipment: Equipment[];
  parts: Part[];
  orders: WorkOrder[];
  log: LogEntry[];
  technicians: Technician[];
  nextOs: number;
}

/** Dados de exemplo: frota de Congonhas (8 rebocadores TMX 150 e 12 esteiras TLD NBL). */
export function makeSeed(now: number): SeedData {
  const equipment: Equipment[] = [
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `TMX-${String(i + 1).padStart(2, '0')}`,
      kind: 'tmx' as const,
      status: 'ok' as const,
      osId: null,
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `NBL-${String(i + 1).padStart(2, '0')}`,
      kind: 'nbl' as const,
      status: 'ok' as const,
      osId: null,
    })),
  ];
  const mark = (id: string, status: Equipment['status'], osId: number) => {
    const e = equipment.find((x) => x.id === id);
    if (e) Object.assign(e, { status, osId });
  };
  mark('TMX-02', 'down', 1040);
  mark('TMX-05', 'down', 1039);
  mark('NBL-03', 'wait', 1038);

  const parts: Part[] = [
    { id: 'P1', name: 'Filtro de óleo do motor', fits: 'TMX 150', pn: 'PN-10021', loc: 'A1', qty: 6, min: 4 },
    { id: 'P2', name: 'Filtro de combustível', fits: 'TMX 150', pn: 'PN-10034', loc: 'A2', qty: 3, min: 3 },
    { id: 'P3', name: 'Pastilha de freio (jogo)', fits: 'TMX 150', pn: 'PN-10112', loc: 'B1', qty: 2, min: 4 },
    { id: 'P4', name: 'Correia transportadora', fits: 'TLD NBL', pn: 'PN-20045', loc: 'C1', qty: 0, min: 2 },
    { id: 'P5', name: 'Rolete da esteira', fits: 'TLD NBL', pn: 'PN-20078', loc: 'C2', qty: 12, min: 6 },
    { id: 'P6', name: 'Fusível 30 A', fits: 'Geral', pn: 'PN-30010', loc: 'D1', qty: 20, min: 10 },
    { id: 'P7', name: 'Óleo hidráulico 20 L', fits: 'Geral', pn: 'PN-30055', loc: 'E1', qty: 5, min: 2 },
  ];

  const technicians: Technician[] = [
    { bp: '4617387', name: 'Higor Cavalcante' },
    { bp: '4521093', name: 'Sérgio Almeida' },
    { bp: '4388120', name: 'Roberto Nunes' },
    { bp: '4410256', name: 'Carlos Pereira' },
  ];

  const order = (o: Omit<WorkOrder, 'closedAt' | 'closedBy' | 'waitPartId'> & Partial<WorkOrder>): WorkOrder => ({
    closedAt: null,
    closedBy: null,
    waitPartId: null,
    ...o,
  });
  const orders: WorkOrder[] = [
    order({
      id: 1040,
      equipId: 'TMX-02',
      problem: 'Freio',
      tech: 'Sérgio Almeida',
      techBp: '4521093',
      status: 'open',
      openedAt: now - 190 * MIN,
      parts: [{ partId: 'P3', qty: 2 }],
    }),
    order({
      id: 1039,
      equipId: 'TMX-05',
      problem: 'Pneu',
      tech: 'Higor Cavalcante',
      techBp: '4617387',
      status: 'open',
      openedAt: now - 85 * MIN,
      parts: [],
    }),
    order({
      id: 1038,
      equipId: 'NBL-03',
      problem: 'Correia rasgada',
      tech: 'Roberto Nunes',
      techBp: '4388120',
      status: 'wait',
      openedAt: now - 26 * HOUR,
      parts: [],
      waitPartId: 'P4',
    }),
    order({
      id: 1037,
      equipId: 'TMX-07',
      problem: 'Não liga',
      tech: 'Carlos Pereira',
      techBp: '4410256',
      status: 'closed',
      openedAt: now - 7 * HOUR,
      closedAt: now - 5 * HOUR,
      closedBy: 'Carlos Pereira',
      parts: [{ partId: 'P6', qty: 1 }],
    }),
    order({
      id: 1036,
      equipId: 'NBL-09',
      problem: 'Vazamento',
      tech: 'Roberto Nunes',
      techBp: '4388120',
      status: 'closed',
      openedAt: now - 30 * HOUR,
      closedAt: now - 22 * HOUR,
      closedBy: 'Roberto Nunes',
      parts: [{ partId: 'P7', qty: 1 }],
    }),
  ];

  const log: LogEntry[] = [
    { id: 'seed-1', at: now - 85 * MIN, kind: 'open', text: 'Higor Cavalcante abriu a OS 1039 para o TMX-05 (Pneu)' },
    {
      id: 'seed-2',
      at: now - 160 * MIN,
      kind: 'pick',
      text: 'Sérgio Almeida retirou 2 × Pastilha de freio (jogo) para a OS 1040',
    },
    { id: 'seed-3', at: now - 190 * MIN, kind: 'open', text: 'Sérgio Almeida abriu a OS 1040 para o TMX-02 (Freio)' },
    { id: 'seed-4', at: now - 5 * HOUR, kind: 'close', text: 'Carlos Pereira fechou a OS 1037 e liberou o TMX-07' },
    {
      id: 'seed-5',
      at: now - 25 * HOUR,
      kind: 'wait',
      text: 'A OS 1038 do NBL-03 está aguardando Correia transportadora',
    },
  ];

  return { equipment, parts, orders, log, technicians, nextOs: 1041 };
}
