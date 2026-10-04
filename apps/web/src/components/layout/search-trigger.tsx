import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { es } from '@/lib/i18n/es';

export function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <Button variant="outline" className="text-muted-foreground h-9 w-full justify-start gap-2 sm:w-64" onClick={onOpen} aria-label={es.search.button}>
      <Search className="size-4" />
      <span className="truncate">{es.search.button}…</span>
      <kbd className="bg-muted ml-auto hidden rounded px-1.5 text-[10px] font-medium sm:inline">/</kbd>
    </Button>
  );
}

