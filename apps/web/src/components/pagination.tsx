import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { formatInt } from '@/lib/format';

export function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const navigate = useNavigate();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="text-muted-foreground mt-3 text-xs">{formatInt(total)} resultados</p>;
  const go = (p: number) => void navigate({ to: '.', search: (prev: Record<string, unknown>) => ({ ...prev, pagina: p > 1 ? p : undefined }) });
  return (
    <nav className="mt-4 flex items-center justify-between gap-2 text-sm" aria-label="Paginación">
      <span className="text-muted-foreground text-xs">
        {formatInt(total)} resultados · página {page} de {pages}
      </span>
      <span className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)}>
          Anterior
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => go(page + 1)}>
          Siguiente
        </Button>
      </span>
    </nav>
  );
}
