import { useEffect, useState, type ReactNode } from 'react';
import type { ConnStatus, DataStore, Snapshot } from '../types';
import { StoreCtx } from './storeContext';

export function StoreProvider({ store, children }: { store: DataStore; children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => store.subscribe(setSnap, setStatus), [store]);

  // Relógio do cabeçalho e os "há 5 min" se atualizam sozinhos
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => setNow(Date.now()), [snap]);

  return <StoreCtx.Provider value={{ store, snap, status, now }}>{children}</StoreCtx.Provider>;
}
