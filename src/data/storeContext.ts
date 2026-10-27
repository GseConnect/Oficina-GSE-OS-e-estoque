import { createContext, useContext } from 'react';
import type { ConnStatus, DataStore, Snapshot } from '../types';

export interface StoreValue {
  store: DataStore;
  snap: Snapshot | null;
  status: ConnStatus;
  now: number;
}

export const StoreCtx = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const v = useContext(StoreCtx);
  if (!v) throw new Error('useStore precisa do StoreProvider');
  return v;
}
