import { Link } from '@tanstack/react-router';
import { AlertTriangle, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { es } from '@/lib/i18n/es';

export function PageSkeleton() {
  return (
    <div className="space-y-6 py-2" aria-busy="true" aria-label={es.states.loading}>
      <Skeleton className="h-9 w-2/3 max-w-md" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function EmptyState({ message = es.states.noData }: { message?: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center text-sm">
      <SearchX className="size-5" aria-hidden />
      <p>{message}</p>
    </div>
  );
}

export function NotFoundState({ message }: { message?: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-muted-foreground text-sm font-medium">404</p>
      <h1 className="mt-2 text-2xl font-semibold">{message ?? 'Página no encontrada'}</h1>
      <p className="text-muted-foreground mt-2 text-sm">Revisá la dirección o usá el buscador.</p>
      <Button asChild className="mt-6">
        <Link to="/">Volver al inicio</Link>
      </Button>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError && error.status === 404) return <NotFoundState message={error.message} />;
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <AlertTriangle className="text-destructive size-6" aria-hidden />
      <p className="font-medium">{es.states.error}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {es.states.retry}
        </Button>
      )}
    </div>
  );
}
