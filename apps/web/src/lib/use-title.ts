import { useEffect } from 'react';

/** Spanish page title, e.g. "Juan Pérez — Ligapedia". */
export function useTitle(title: string | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} — Ligapedia` : 'Ligapedia — Futsal de la Liga Universitaria';
  }, [title]);
}
