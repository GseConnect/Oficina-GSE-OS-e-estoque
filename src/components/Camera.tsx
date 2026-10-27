import { useEffect, useRef, useState } from 'react';
import type QrScanner from 'qr-scanner';
import { Camera as CameraIcon, CameraOff, QrCode } from 'lucide-react';
import { cx } from '../lib/cx';
import { Button } from './ui';

const PREF = 'oficina-gse-camera';
const readPref = () => {
  try {
    return localStorage.getItem(PREF) === '1';
  } catch {
    return false;
  }
};
const writePref = (on: boolean) => {
  try {
    localStorage.setItem(PREF, on ? '1' : '0');
  } catch {
    /* sem armazenamento */
  }
};

function cameraError(e: unknown): string {
  const text = typeof e === 'string' ? e : e instanceof Error ? `${e.name} ${e.message}` : '';
  if (/insecure/i.test(text)) return 'A câmera só funciona em endereço com https (ou no localhost).';
  if (/NotAllowed|Permission|denied/i.test(text))
    return 'O acesso à câmera foi negado. Libere a câmera nas configurações do navegador.';
  if (/NotFound|not found|no camera/i.test(text)) return 'Nenhuma câmera encontrada neste aparelho.';
  if (/NotReadable|in use/i.test(text)) return 'A câmera está sendo usada por outro app.';
  return 'Não foi possível abrir a câmera aqui. Use os QR de teste abaixo.';
}

type Phase = 'idle' | 'starting' | 'live' | 'error';

/** Leitor de QR com a câmera traseira do celular (biblioteca qr-scanner). */
export function Camera({ hint, onCode }: { hint: string; onCode: (raw: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cbRef = useRef(onCode);
  const [wanted, setWanted] = useState(readPref);
  const [phase, setPhase] = useState<Phase>('idle');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    cbRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!wanted) {
      setPhase((p) => (p === 'error' ? p : 'idle'));
      return undefined;
    }
    let cancelled = false;
    let scanner: QrScanner | null = null;
    let last = { text: '', at: 0 };
    setPhase('starting');
    (async () => {
      try {
        if (!window.isSecureContext) throw new Error('insecure context');
        const { default: Scanner } = await import('qr-scanner');
        const video = videoRef.current;
        if (!video || cancelled) return;
        scanner = new Scanner(
          video,
          (result) => {
            const now = Date.now();
            if (result.data === last.text && now - last.at < 2500) return;
            last = { text: result.data, at: now };
            cbRef.current(result.data);
          },
          {
            preferredCamera: 'environment',
            maxScansPerSecond: 8,
            returnDetailedScanResult: true,
            // Área de leitura maior que o padrão: pega a etiqueta mesmo quando ela enche a tela (celular bem perto).
            calculateScanRegion: (v) => {
              const size = Math.round(0.9 * Math.min(v.videoWidth, v.videoHeight));
              return {
                x: Math.round((v.videoWidth - size) / 2),
                y: Math.round((v.videoHeight - size) / 2),
                width: size,
                height: size,
                downScaledWidth: 480,
                downScaledHeight: 480,
              };
            },
          },
        );
        await scanner.start();
        if (cancelled) return;
        writePref(true);
        setPhase('live');
      } catch (e) {
        if (cancelled) return;
        setMsg(cameraError(e));
        setPhase('error');
        writePref(false);
        setWanted(false);
      }
    })();
    return () => {
      cancelled = true;
      if (scanner) {
        scanner.stop();
        scanner.destroy();
      }
    };
  }, [wanted]);

  const live = phase === 'live';
  return (
    <div className={cx('cam', live && 'is-live')}>
      <video ref={videoRef} className="cam-video" muted playsInline aria-hidden />
      {live ? (
        <>
          <div className="cam-frame" aria-hidden>
            <span className="c tl" />
            <span className="c tr" />
            <span className="c bl" />
            <span className="c br" />
            <span className="cam-line" />
          </div>
          <span className="cam-hint">{hint}</span>
          <button
            type="button"
            className="cam-off"
            aria-label="Fechar a câmera"
            onClick={() => {
              writePref(false);
              setWanted(false);
            }}
          >
            <CameraOff size={22} aria-hidden />
          </button>
        </>
      ) : (
        <div className="cam-idle">
          <QrCode size={54} className="cam-ghost" aria-hidden />
          {phase === 'starting' ? (
            <p>Abrindo a câmera…</p>
          ) : (
            <>
              <Button variant="primary" size="lg" icon={CameraIcon} onClick={() => setWanted(true)}>
                Abrir câmera
              </Button>
              {phase === 'error' && (
                <p className="cam-msg" role="alert">
                  {msg}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
