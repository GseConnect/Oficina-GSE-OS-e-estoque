import type { ReactNode } from 'react';
import { Clock, Hash, Package, TriangleAlert } from 'lucide-react';
import { cx } from '../lib/cx';
import { dateTime } from '../lib/format';
import { partsText } from '../lib/orders';
import type { Snapshot, WorkOrder } from '../types';
import { ORDER_STATUS } from './status';
import { Pill } from './ui';

/** Cartão de OS no mesmo modelo dos chamados do GSE Connect (borda lateral na cor da situação). */
export function OrderCard({
  o,
  snap,
  actions,
  flash,
}: {
  o: WorkOrder;
  snap: Snapshot;
  actions?: ReactNode;
  flash?: boolean;
}) {
  const st = ORDER_STATUS[o.status];
  const used = partsText(o, snap);
  const waiting = o.status === 'wait' && o.waitPartId ? snap.parts.find((p) => p.id === o.waitPartId)?.name : null;
  return (
    <article className={cx('ocard', `tone-${st.tone}`, flash && 'flash')}>
      <div className="ocard-top">
        <span className="ocard-ic">
          <st.icon size={22} aria-hidden />
        </span>
        <div className="ocard-id">
          <strong>{o.equipId}</strong>
          <span>
            BP {o.techBp} · {o.tech}
          </span>
        </div>
        <div className="ocard-meta">
          <span>
            <Hash size={16} aria-hidden />
            OS {o.id}
          </span>
          <span>
            <TriangleAlert size={16} aria-hidden />
            {o.problem}
          </span>
          <span>
            <Clock size={16} aria-hidden />
            {dateTime(o.openedAt)}
          </span>
        </div>
        <Pill tone={st.tone} icon={st.icon}>
          {st.label}
        </Pill>
      </div>
      {(used || waiting) && (
        <p className="ocard-parts">
          <Package size={16} aria-hidden />
          {used && <span>Peças: {used}</span>}
          {waiting && <span className="ocard-wait">Aguardando: {waiting}</span>}
        </p>
      )}
      {actions && <div className="ocard-actions">{actions}</div>}
    </article>
  );
}
