import type { SearchResult } from '@ligapedia/contracts';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/states';
import { PageHeader, Section } from '@/components/stats';
import { es } from '@/lib/i18n/es';
import { queries } from '@/lib/queries';
import { parseSearch } from '@/lib/search-params';
import { useTitle } from '@/lib/use-title';

export const Route = createFileRoute('/buscar')({
  validateSearch: parseSearch,
  component: SearchPage,
});

function ResultList({ items }: { items: SearchResult[] }) {
  if (!items.length) return <p className="text-muted-foreground text-sm">{es.search.empty}</p>;
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {items.map((r) => {
        const param = `${r.id}-${r.slug}`;
        const link =
          r.type === 'player' ? (
            <Link to="/jugadores/$jugador" params={{ jugador: param }} className="font-medium underline-offset-4 hover:underline">
              {r.label}
            </Link>
          ) : r.type === 'team' ? (
            <Link to="/equipos/$equipo" params={{ equipo: param }} className="font-medium underline-offset-4 hover:underline">
              {r.label}
            </Link>
          ) : (
            <Link to="/torneos/$torneo" params={{ torneo: param }} className="font-medium underline-offset-4 hover:underline">
              {r.label}
            </Link>
          );
        return (
          <li key={`${r.type}-${r.id}`} className="px-3 py-2">
            {link}
            <p className="text-muted-foreground text-xs">
              {r.matchedName !== r.label && r.type === 'player' ? `antes: ${r.matchedName} · ` : ''}
              {r.context}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function SearchPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [text, setText] = useState(search.q ?? '');
  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q ?? '') !== text.trim()) void navigate({ to: '.', search: { q: text.trim() || undefined }, replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [text, search.q, navigate]);
  const term = (search.q ?? '').trim();
  const { data } = useQuery({ ...queries.search(term), enabled: term.length >= 2 });
  useTitle(term ? `Buscar: ${term}` : 'Buscar');
  const r = data?.data;
  return (
    <div>
      <PageHeader title="Buscar" subtitle="Jugadores, equipos y torneos; sin importar tildes ni el orden de las palabras" />
      <Input autoFocus type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={es.search.placeholder} aria-label={es.search.placeholder} className="mb-6 max-w-xl" />
      {term.length < 2 ? (
        <EmptyState message={es.search.minChars} />
      ) : r ? (
        <div className="grid gap-6 md:grid-cols-3">
          <Section title={es.search.players} className="mt-0">
            <ResultList items={r.players} />
          </Section>
          <Section title={es.search.teams} className="mt-0">
            <ResultList items={r.teams} />
          </Section>
          <Section title={es.search.tournaments} className="mt-0">
            <ResultList items={r.tournaments} />
          </Section>
        </div>
      ) : null}
    </div>
  );
}
