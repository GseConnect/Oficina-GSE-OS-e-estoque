import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Clock, Hash, Hourglass, MapPin, Package, TriangleAlert } from 'lucide-react';
import { useStore } from '../data/storeContext';
import { cx } from '../lib/cx';
import { dateTime, duration, formatHours } from '../lib/format';
import { partsText } from '../lib/orders';
import type { Photo, Snapshot, WorkOrder } from '../types';
import { LOCATION, ORDER_STATUS } from './status';
import { Pill } from './ui';

const hourRange = (o: WorkOrder) => {
  const a = o.hourMeterStart !== null ? formatHours(o.hourMeterStart) : 'não registrado';
  if (o.status !== 'closed') return `${a} na abertura`;
  const b = o.hourMeterEnd !== null ? formatHours(o.hourMeterEnd) : 'não registrado';
  return `${a} na abertura, ${b} no fechamento`;
};

function OrderDetails({ o }: { o: WorkOrder }) {
  const { store } = useStore();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  useEffect(() => {
    if (!o.photoCount) return undefined;
    let off = false;
    store
      .getPhotos(o.id)
      .then((list) => !off && setPhotos(list))
      .catch(() => !off && setPhotos([]));
    return () => {
      off = true;
    };
  }, [store, o.id, o.photoCount]);

  return (
    <div className="ocard-details">
      <dl className="details is-compact">
        <div>
          <dt>Descrição</dt>
          <dd>{o.description || 'Sem descrição'}</dd>
        </div>
        <div>
          <dt>Horímetro</dt>
          <dd>{hourRange(o)}</dd>
        </div>
        {o.serviceDone && (
          <div>
            <dt>Serviço executado</dt>
            <dd>{o.serviceDone}</dd>
          </div>
        )}
        {o.closedAt && (
          <div>
            <dt>Fechada</dt>
            <dd>
              {dateTime(o.closedAt)} por {o.closedBy}
            </dd>
          </div>
        )}
      </dl>
      {o.photoCount > 0 &&
        (photos === null ? (
          <p className="showing">Carregando fotos…</p>
        ) : (
          <div className="photo-grid">
            {photos.map((p) => (
              <figure key={p.id} className="photo-thumb">
                <img src={p.data} alt={`Foto da ${p.stage} da OS ${o.id}`} />
                <figcaption>{p.stage === 'abertura' ? 'Abertura' : 'Fechamento'}</figcaption>
              </figure>
            ))}
          </div>
        ))}
    </div>
  );
}

/** Cartão de OS no mesmo modelo dos chamados do GSE Connect (borda lateral na cor da situação). */
export function OrderCard({
  o,
  snap,
  now,
  actions,
  flash,
  expandable,
}: {
  o: WorkOrder;
  snap: Snapshot;
  now: number;
  actions?: ReactNode;
  flash?: boolean;
  expandable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const st = ORDER_STATUS[o.status];
  const loc = LOCATION[o.location];
  const used = partsText(o, snap);
  const waiting = o.status === 'wait' && o.waitPartId ? snap.parts.find((p) => p.id === o.waitPartId)?.name : null;
  const time =
    o.status === 'closed' && o.closedAt
      ? `Duração: ${duration(o.closedAt - o.openedAt)}`
      : `Em atendimento há ${duration(now - o.openedAt)}`;
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
            <MapPin size={16} aria-hidden />
            {loc.label}
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
      <p className="ocard-parts">
        <span className="ocard-time">
          <Hourglass size={15} aria-hidden />
          {time}
        </span>
        {used && (
          <span>
            <Package size={15} aria-hidden />
            Peças: {used}
          </span>
        )}
        {waiting && <span className="ocard-wait">Aguardando: {waiting}</span>}
      </p>
      {expandable && (
        <button type="button" className="ocard-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronUp size={17} aria-hidden /> : <ChevronDown size={17} aria-hidden />}
          {open ? 'Ocultar detalhes' : 'Ver detalhes'}
        </button>
      )}
      {open && <OrderDetails o={o} />}
      {actions && <div className="ocard-actions">{actions}</div>}
    </article>
  );
}
