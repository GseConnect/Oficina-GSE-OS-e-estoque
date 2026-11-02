import { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { compressPhoto } from '../lib/photo';
import { Button } from './ui';

/** Tira ou escolhe fotos (no celular abre a câmera) e guarda versões reduzidas. */
export function PhotoPicker({
  photos,
  onChange,
  max = 3,
  maxSide,
}: {
  photos: string[];
  onChange: (next: string[]) => void;
  max?: number;
  maxSide: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setErr('');
    try {
      const room = Math.max(0, max - photos.length);
      const out: string[] = [];
      for (const f of Array.from(files).slice(0, room)) out.push(await compressPhoto(f, maxSide));
      onChange([...photos, ...out]);
    } catch {
      setErr('Não foi possível usar essa foto. Tente outra.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="photos">
      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((src, i) => (
            <div key={`${i}-${src.length}`} className="photo-thumb">
              <img src={src} alt={`Foto ${i + 1}`} />
              <button
                type="button"
                className="photo-del"
                aria-label={`Remover foto ${i + 1}`}
                onClick={() => onChange(photos.filter((_, j) => j !== i))}
              >
                <X size={18} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
      {photos.length < max && (
        <Button variant="outline" size="lg" block icon={Camera} busy={busy} onClick={() => inputRef.current?.click()}>
          {photos.length ? 'Tirar outra foto' : 'Tirar foto'}
        </Button>
      )}
      <input
        ref={inputRef}
        className="photo-input"
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        aria-label="Escolher foto"
        onChange={(e) => void pick(e.target.files)}
      />
      {err && <p className="field-err">{err}</p>}
    </div>
  );
}
