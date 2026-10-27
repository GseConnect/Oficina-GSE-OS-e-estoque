import { useEffect, useState } from 'react';
import { ArrowLeft, Printer, QrCode } from 'lucide-react';
import { useStore } from '../data/storeContext';
import { equipPayload, partPayload } from '../lib/qr';
import { KIND } from '../components/status';
import { Button, Loading } from '../components/ui';

type QrModule = typeof import('qrcode');

/** Etiquetas para imprimir e colar nos equipamentos e nas prateleiras da demonstração. */
export function Labels() {
  const { snap } = useStore();
  const [images, setImages] = useState<Record<string, string>>({});

  // Uma linha por etiqueta; só muda quando entram ou saem equipamentos e peças
  const textsKey = snap
    ? [...snap.equipment.map((e) => equipPayload(e.id)), ...snap.parts.map((p) => partPayload(p.pn))].join('\n')
    : '';

  useEffect(() => {
    if (!textsKey) return undefined;
    let cancelled = false;
    const texts = textsKey.split('\n');
    import('qrcode').then(async (mod) => {
      const QR = ((mod as unknown as { default?: QrModule }).default ?? mod) as QrModule;
      const pairs = await Promise.all(
        texts.map(
          async (t) => [t, await QR.toDataURL(t, { margin: 1, width: 360, errorCorrectionLevel: 'M' })] as const,
        ),
      );
      if (!cancelled) setImages(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [textsKey]);

  if (!snap) return <Loading />;

  return (
    <div className="page labels-page">
      <div className="labels-top no-print">
        <a className="btn btn-outline btn-lg" href="#/painel">
          <ArrowLeft size={20} aria-hidden />
          <span>Voltar ao painel</span>
        </a>
        <Button variant="primary" size="lg" icon={Printer} onClick={() => window.print()}>
          Imprimir etiquetas
        </Button>
      </div>
      <div className="labels-intro no-print">
        <h1>
          <QrCode size={26} aria-hidden />
          Etiquetas QR para a demonstração
        </h1>
        <p>
          Imprima, recorte e cole no equipamento ou na prateleira. A câmera do app lê estes códigos para abrir a OS,
          retirar a peça e fechar a OS.
        </p>
      </div>

      <h2 className="labels-h">Equipamentos</h2>
      <div className="labels-grid">
        {snap.equipment.map((e) => (
          <div key={e.id} className="label">
            {images[equipPayload(e.id)] ? (
              <img src={images[equipPayload(e.id)]} alt={`QR do ${e.id}`} />
            ) : (
              <div className="label-ph" />
            )}
            <strong>{e.id}</strong>
            <span>{KIND[e.kind].label}</span>
          </div>
        ))}
      </div>

      <h2 className="labels-h">Prateleiras do estoque</h2>
      <div className="labels-grid">
        {snap.parts.map((p) => (
          <div key={p.id} className="label">
            {images[partPayload(p.pn)] ? (
              <img src={images[partPayload(p.pn)]} alt={`QR da peça ${p.name}`} />
            ) : (
              <div className="label-ph" />
            )}
            <strong>{p.name}</strong>
            <span>
              {p.pn} · prateleira {p.loc}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
