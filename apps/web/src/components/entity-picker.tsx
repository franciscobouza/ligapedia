import { useQuery } from '@tanstack/react-query';
import { ChevronsUpDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { es } from '@/lib/i18n/es';
import { queries } from '@/lib/queries';

/** Search-based picker for a team or a player (comparisons). */
export function EntityPicker({
  type,
  label,
  valueLabel,
  onSelect,
}: {
  type: 'team' | 'player';
  label: string;
  valueLabel?: string;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerm(text.trim()), 150);
    return () => clearTimeout(t);
  }, [text]);
  const { data } = useQuery({ ...queries.search(term), enabled: open && term.length >= 2 });
  const items = (type === 'team' ? data?.data.teams : data?.data.players) ?? [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} aria-label={label} className="w-full justify-between sm:w-72">
          <span className="truncate">{valueLabel ?? label}</span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={type === 'team' ? 'Buscar equipo…' : 'Buscar jugador…'} value={text} onValueChange={setText} />
          <CommandList>
            {term.length < 2 ? (
              <p className="text-muted-foreground px-3 py-4 text-center text-xs">{es.search.minChars}</p>
            ) : (
              <>
                <CommandEmpty>{es.search.empty}</CommandEmpty>
                <CommandGroup>
                  {items.map((r) => (
                    <CommandItem
                      key={r.id}
                      value={String(r.id)}
                      onSelect={() => {
                        onSelect(r.id);
                        setOpen(false);
                        setText('');
                      }}
                    >
                      <div className="min-w-0">
                        <p className="truncate">{r.label}</p>
                        <p className="text-muted-foreground truncate text-xs">{r.context}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
