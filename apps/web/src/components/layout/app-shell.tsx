import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { formatDateTime } from '@/lib/format';
import { es } from '@/lib/i18n/es';
import { queries } from '@/lib/queries';
import { SearchTrigger } from './search-trigger';

// Kept out of the first-route bundle, then prefetched when the browser is idle so "/" opens instantly.
const loadPalette = () => import('./search-palette');
const SearchPalette = lazy(loadPalette);
import { ThemeToggle } from './theme-toggle';

const NAV = [
  { to: '/', label: es.nav.home },
  { to: '/temporadas', label: es.nav.seasons },
  { to: '/torneos', label: es.nav.tournaments },
  { to: '/equipos', label: es.nav.teams },
  { to: '/jugadores', label: es.nav.players },
  { to: '/records', label: es.nav.records },
  { to: '/comparar/equipos', label: es.nav.compare },
  { to: '/campeones', label: es.nav.champions },
] as const;

function NavLinks({ onNavigate, vertical = false }: { onNavigate?: () => void; vertical?: boolean }) {
  return (
    <nav aria-label="Principal" className={vertical ? 'flex flex-col gap-1' : 'hidden items-center gap-0.5 xl:flex'}>
      {NAV.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          activeOptions={{ exact: item.to === '/' }}
          className="text-muted-foreground hover:text-foreground hover:bg-accent data-[status=active]:text-foreground data-[status=active]:bg-accent rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2 font-bold tracking-tight" aria-label="Ligapedia, inicio">
      <img src="/favicon.svg" alt="" className="size-7" width={28} height={28} />
      <span className="text-lg">Ligapedia</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMounted, setSearchMounted] = useState(false);
  const openSearch = () => {
    setSearchMounted(true);
    setSearchOpen(true);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearchMounted(true);
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    idle(() => {
      void loadPalette();
      setSearchMounted(true);
    });
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const { data: meta } = useQuery(queries.meta());
  const publishedAt = meta?.data.publishedAt;
  return (
    <div className="flex min-h-svh flex-col">
      <a href="#contenido" className="bg-primary text-primary-foreground sr-only z-50 rounded px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Saltar al contenido
      </a>
      <header className="bg-background/90 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="xl:hidden" aria-label={es.nav.menu}>
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <SheetHeader>
                <SheetTitle>
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <div className="px-4">
                <NavLinks vertical onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <Logo />
          <NavLinks />
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <div className="hidden sm:block">
              <SearchTrigger onOpen={openSearch} />
            </div>
            <ThemeToggle />
          </div>
        </div>
        <div className="px-4 pb-2 sm:hidden">
          <SearchTrigger onOpen={openSearch} />
        </div>
      </header>
      {searchMounted && (
        <Suspense fallback={null}>
          <SearchPalette open={searchOpen} setOpen={setSearchOpen} />
        </Suspense>
      )}
      <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
      <footer className="text-muted-foreground border-t text-xs">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {es.site.updated}: {publishedAt ? formatDateTime(publishedAt) : '—'}
          </p>
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            <a href="https://ligauniversitaria.org.uy/" target="_blank" rel="noreferrer" className="hover:text-foreground underline-offset-4 hover:underline">
              {es.site.source}
            </a>
            <span>·</span>
            <span>{es.site.unofficial}</span>
            <span>·</span>
            <Link to="/sobre-los-datos" className="hover:text-foreground underline-offset-4 hover:underline">
              {es.site.about}
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
