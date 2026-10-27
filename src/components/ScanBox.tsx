import { TriangleAlert } from 'lucide-react';
import { Camera } from './Camera';
import { RowList, type RowItem } from './ui';

export interface DemoCode extends Omit<RowItem, 'onClick'> {
  code: string;
}

/** Câmera + lista de "QR de teste" para quando não houver etiqueta impressa por perto. */
export function ScanBox({
  hint,
  items,
  onCode,
  error,
}: {
  hint: string;
  items: DemoCode[];
  onCode: (raw: string) => void;
  error?: string | null;
}) {
  return (
    <div className="scan">
      <Camera hint={hint} onCode={onCode} />
      {error && (
        <div className="scan-error" role="alert">
          <TriangleAlert size={20} aria-hidden />
          <span>{error}</span>
        </div>
      )}
      {items.length > 0 && (
        <div>
          <p className="demo-h">Sem etiqueta por perto? Toque em um QR de teste:</p>
          <RowList items={items.map(({ code, ...it }) => ({ ...it, onClick: () => onCode(code) }))} />
        </div>
      )}
    </div>
  );
}
