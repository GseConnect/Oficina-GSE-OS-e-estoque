import { useEffect, useState } from 'react';

export type Route = 'tech' | 'panel' | 'present' | 'labels';

const fromHash = (h: string): Route => {
  if (h.startsWith('#/painel')) return 'panel';
  if (h.startsWith('#/apresentacao')) return 'present';
  if (h.startsWith('#/etiquetas')) return 'labels';
  return 'tech';
};

export const hrefOf = (r: Route) =>
  ({ tech: '#/', panel: '#/painel', present: '#/apresentacao', labels: '#/etiquetas' })[r];

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => fromHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(fromHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const go = (r: Route) => {
  window.location.hash = hrefOf(r);
};
