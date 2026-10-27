import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { createStore } from './data/createStore';
import { StoreProvider } from './data/StoreProvider';
import { unlockAudio } from './lib/sound';

// O navegador só libera o som do alerta depois do primeiro toque na página.
document.addEventListener('pointerdown', unlockAudio);

const root = createRoot(document.getElementById('root')!);
root.render(<div className="boot">Carregando…</div>);

createStore()
  .then((store) =>
    root.render(
      <StrictMode>
        <StoreProvider store={store}>
          <App />
        </StoreProvider>
      </StrictMode>,
    ),
  )
  .catch((err) => {
    console.error(err);
    root.render(
      <div className="boot">Não foi possível iniciar o app. Confira a configuração do Firebase no .env.local.</div>,
    );
  });
