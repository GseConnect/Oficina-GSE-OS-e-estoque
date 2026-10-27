import { Presentation, X } from 'lucide-react';
import type { User } from '../types';
import { AppHeader } from '../components/AppHeader';
import { Panel } from '../panel/Panel';
import { Login } from '../tech/Login';
import { TechApp } from '../tech/TechApp';

/** Uma tela só para a reunião: o celular do técnico de um lado e o painel ao vivo do outro. */
export function Present({
  user,
  onLogin,
  onLogout,
}: {
  user: User | null;
  onLogin: (u: User) => void;
  onLogout: () => void;
}) {
  return (
    <div className="page present">
      <AppHeader
        title="Oficina GSE"
        subtitle="Modo apresentação · celular do técnico e painel ao vivo"
        icon={Presentation}
        right={
          <a className="user-btn" href="#/painel">
            <span>Sair da apresentação</span>
            <X size={18} aria-hidden />
          </a>
        }
      />
      <div className="present-grid">
        <div className="phone" aria-label="Celular do técnico">
          <div className="phone-screen">
            {user ? <TechApp user={user} onLogout={onLogout} embedded /> : <Login onLogin={onLogin} embedded />}
          </div>
        </div>
        <Panel embedded />
      </div>
    </div>
  );
}
