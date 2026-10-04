import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Shield, Trophy, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { es } from '@/lib/i18n/es';
import { queries } from '@/lib/queries';
import type { SearchResult } from '@ligapedia/contracts';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Global search (specs/search): one dialog per page; opens with "/" or Ctrl/Cmd+K, results while typing. */
export default function SearchPalette({ open, setOpen }: { open: boolean; setOpen: (o: boolean | ((p: boolean) => boolean)) => void }) {
  const [text, setText] = useState('');
  const term = useDebounced(text.trim(), 150);
  const navigate = useNavigate();
  const { data, isFetching } = useQuery({ ...queries.search(term), enabled: open && term.length >= 2, placeholderData: (p) => p });


  const go = (r: SearchResult) => {
    setOpen(false);
    setText('');
    const param = `${r.id}-${r.slug}`;
    if (r.type === 'player') void navigate({ to: '/jugadores/$jugador', params: { jugador: param } });
    else if (r.type === 'team') void navigate({ to: '/equipos/$equipo', params: { equipo: param } });
    else void navigate({ to: '/torneos/$torneo', params: { torneo: param } });
  };

  const results = term.length >= 2 ? data?.data : undefined;
  const group = (title: string, items: SearchResult[] | undefined, Icon: typeof User) =>
    items && items.length > 0 ? (
      <CommandGroup heading={title}>
        {items.map((r) => (
          <CommandItem key={`${r.type}-${r.id}`} value={`${r.type}-${r.id}-${r.label}`} onSelect={() => go(r)}>
            <Icon className="size-4 opacity-60" />
            <div className="min-w-0">
              <p className="truncate">{r.label}</p>
              <p className="text-muted-foreground truncate text-xs">
                {r.matchedName !== r.label && r.type === 'player' ? `antes: ${r.matchedName} · ` : ''}
                {r.context}
              </p>
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    ) : null;

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen} title={es.search.button} description={es.search.placeholder}>
        <Command shouldFilter={false}>
        <CommandInput placeholder={es.search.placeholder} value={text} onValueChange={setText} />
        <CommandList>
          {term.length < 2 ? (
            <p className="text-muted-foreground px-4 py-6 text-center text-sm">{es.search.minChars}</p>
          ) : (
            <>
              {!isFetching && <CommandEmpty>{es.search.empty}</CommandEmpty>}
              {group(es.search.players, results?.players, User)}
              {group(es.search.teams, results?.teams, Shield)}
              {group(es.search.tournaments, results?.tournaments, Trophy)}
            </>
          )}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
