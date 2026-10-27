import { useState, type FormEvent } from 'react';
import { ChartColumn, LogIn, UserRound } from 'lucide-react';
import logo from '../assets/logo-oficina.webp';
import { useStore } from '../data/storeContext';
import { cx } from '../lib/cx';
import type { User } from '../types';
import { Button } from '../components/ui';

const BP_LEN = 7;

/** Entrada só com o BP (número do crachá), no mesmo modelo do GSE Connect. */
export function Login({ onLogin, embedded }: { onLogin: (u: User) => void; embedded?: boolean }) {
  const { snap } = useStore();
  const [bp, setBp] = useState('');
  const [err, setErr] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (bp.length !== BP_LEN) {
      setErr(`O BP tem ${BP_LEN} números.`);
      return;
    }
    const tech = snap?.technicians.find((t) => t.bp === bp);
    onLogin({ bp, name: tech?.name ?? null });
  };

  return (
    <div className={cx('login-page', embedded && 'is-embedded')}>
      <form className="login-card" onSubmit={submit} noValidate>
        <img className="login-logo" src={logo} alt="Logo da oficina GSE" width={80} height={80} />
        <h1 className="login-t">Oficina GSE</h1>
        <p className="login-s">Ordens de serviço e estoque</p>
        <label className={cx('field', err && 'has-error')}>
          <UserRound size={20} aria-hidden />
          <input
            value={bp}
            onChange={(e) => {
              setBp(e.target.value.replace(/\D/g, '').slice(0, BP_LEN));
              setErr('');
            }}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Seu BP (número do crachá)"
            aria-label="BP, o número do crachá"
            aria-invalid={!!err}
          />
        </label>
        {err && (
          <p className="field-err" role="alert">
            {err}
          </p>
        )}
        <Button type="submit" variant="primary" size="xl" block icon={LogIn} disabled={!snap}>
          Entrar
        </Button>
        <p className="login-hint">Para testar: 4617387 ou qualquer BP de 7 números.</p>
      </form>
      {!embedded && (
        <a className="login-link" href="#/painel">
          <ChartColumn size={18} aria-hidden />
          Abrir o painel do planejamento
        </a>
      )}
    </div>
  );
}
