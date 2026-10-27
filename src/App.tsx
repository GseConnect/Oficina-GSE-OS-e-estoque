import { useState } from 'react';
import type { User } from './types';
import { useRoute } from './lib/route';
import { Labels } from './labels/Labels';
import { Panel } from './panel/Panel';
import { Present } from './present/Present';
import { Login } from './tech/Login';
import { TechApp } from './tech/TechApp';

const USER_KEY = 'oficina-gse-usuario';

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function saveUser(u: User | null): void {
  try {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* sem armazenamento */
  }
}

/**
 * Rotas:
 *   #/              app do técnico (celular)
 *   #/painel        painel do planejamento (computador)
 *   #/apresentacao  celular e painel lado a lado, para a reunião
 *   #/etiquetas     etiquetas QR para imprimir
 */
export function App() {
  const route = useRoute();
  const [user, setUser] = useState<User | null>(loadUser);
  const login = (u: User) => {
    saveUser(u);
    setUser(u);
  };
  const logout = () => {
    saveUser(null);
    setUser(null);
  };

  if (route === 'panel') return <Panel />;
  if (route === 'present') return <Present user={user} onLogin={login} onLogout={logout} />;
  if (route === 'labels') return <Labels />;
  return user ? <TechApp user={user} onLogout={logout} /> : <Login onLogin={login} />;
}
