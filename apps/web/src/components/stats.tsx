import type { Coverage } from '@ligapedia/contracts';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { formatShare } from '@/lib/format';
import { es } from '@/lib/i18n/es';
import { cn } from '@/lib/utils';

export function PageHeader({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <Card className={cn('gap-1 py-4', className)}>
      <CardContent className="px-4">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{children}</div>;
}

export function Section({ title, children, actions, className }: { title: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cn('mt-8 min-w-0', className)} aria-label={title}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Data-coverage notice (specs/records, specs/player-stats). */
export function CoverageNotice({ coverage, kind }: { coverage: Coverage; kind: 'goals' | 'yellow' }) {
  let text: string | null = null;
  if (kind === 'goals' && coverage.attributedShare !== null && coverage.attributedShare < 1) {
    text = es.coverage.goals(formatShare(coverage.attributedShare));
  }
  if (kind === 'yellow') {
    text = coverage.yellowSeasons.length ? es.coverage.yellowSome(coverage.yellowSeasons.join(', ')) : es.coverage.yellowNone;
  }
  if (!text) return null;
  return (
    <p className="bg-muted text-foreground mb-4 flex items-start gap-2 rounded-md px-3 py-2 text-xs" role="note">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </p>
  );
}

export function IgnoredFilters({ ignored }: { ignored: string[] }) {
  if (!ignored.length) return null;
  return (
    <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs" role="status">
      {es.filters.ignored}: {ignored.join(', ')}
    </p>
  );
}
