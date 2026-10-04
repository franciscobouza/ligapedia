import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { es } from '@/lib/i18n/es';
import { queries } from '@/lib/queries';
import type { FilterSearch } from '@/lib/search-params';

export type FilterKey = 'temporada' | 'rango' | 'rama' | 'tipo' | 'top' | 'min';

const ALL = '__all';
const KIND_OPTIONS = ['apertura', 'clausura', 'liga', 'oro', 'plata', 'anual'] as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-32 flex-col gap-1 text-xs font-medium">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/**
 * The same filter controls everywhere, all bound to the URL search params (specs/search
 * "Shareable filter state"): copying the URL reproduces the view; back/forward restore it.
 */
export function FilterBar({ search, show, defaultMin }: { search: FilterSearch; show: FilterKey[]; defaultMin?: number }) {
  const navigate = useNavigate();
  const { data: meta } = useQuery(queries.meta());
  const years = meta?.data.seasons.map((s) => s.year) ?? [];
  const set = (patch: Partial<FilterSearch>) =>
    void navigate({ to: '.', search: (prev: FilterSearch) => ({ ...prev, ...patch, pagina: undefined }), replace: false });
  const has = (k: FilterKey) => show.includes(k);
  const active = Object.keys(search).some((k) => !['tab', 'a', 'b', 'q', 'orden'].includes(k));

  const yearSelect = (value: number | undefined, onChange: (v: number | undefined) => void, label: string, allLabel: string) => (
    <Field label={label}>
      <Select value={value ? String(value) : ALL} onValueChange={(v) => onChange(v === ALL ? undefined : Number(v))}>
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );

  return (
    <div className="bg-card mb-5 flex flex-wrap items-end gap-3 rounded-lg border p-3" role="search" aria-label="Filtros">
      {has('temporada') && yearSelect(search.temporada, (v) => set({ temporada: v, desde: undefined, hasta: undefined }), es.filters.season, es.filters.allSeasons)}
      {has('rango') && (
        <>
          {yearSelect(search.desde, (v) => set({ desde: v, temporada: undefined }), es.filters.from, '—')}
          {yearSelect(search.hasta, (v) => set({ hasta: v, temporada: undefined }), es.filters.to, '—')}
        </>
      )}
      {has('rama') && (
        <Field label={es.filters.category}>
          <Select value={search.rama ?? ALL} onValueChange={(v) => set({ rama: v === ALL ? undefined : (v as FilterSearch['rama']) })}>
            <SelectTrigger className="w-full" aria-label={es.filters.category}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{es.filters.allCategories}</SelectItem>
              <SelectItem value="masculino">{es.category.M}</SelectItem>
              <SelectItem value="femenino">{es.category.F}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}
      {has('tipo') && (
        <Field label={es.filters.kind}>
          <Select value={search.tipo ?? ALL} onValueChange={(v) => set({ tipo: v === ALL ? undefined : (v as FilterSearch['tipo']) })}>
            <SelectTrigger className="w-full" aria-label={es.filters.kind}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{es.filters.allKinds}</SelectItem>
              {KIND_OPTIONS.map((k) => (
                <SelectItem key={k} value={k}>
                  {es.kinds[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {has('top') && (
        <Field label={es.filters.top}>
          <Select value={String(search.top ?? 10)} onValueChange={(v) => set({ top: Number(v) === 10 ? undefined : Number(v) })}>
            <SelectTrigger className="w-full" aria-label={es.filters.top}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Top {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {has('min') && (
        <Field label={es.filters.min}>
          <Input
            type="number"
            min={1}
            max={1000}
            inputMode="numeric"
            className="w-28"
            aria-label={es.filters.min}
            defaultValue={search.min ?? defaultMin}
            key={search.min ?? defaultMin}
            onBlur={(e) => {
              const n = Number(e.target.value);
              set({ min: Number.isInteger(n) && n > 0 && n !== defaultMin ? n : undefined });
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </Field>
      )}
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void navigate({ to: '.', search: (prev: FilterSearch) => ({ tab: prev.tab, a: prev.a, b: prev.b }) })}
        >
          <X className="size-3.5" /> {es.filters.clear}
        </Button>
      )}
    </div>
  );
}
