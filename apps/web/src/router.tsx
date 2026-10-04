import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { ErrorState, NotFoundState, PageSkeleton } from '@/components/states';
import { ApiError } from '@/lib/api';
import { routeTree } from './routeTree.gen';

export function createAppRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      },
    },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    // Freshness is managed by TanStack Query (staleTime above).
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultPendingMs: 150,
    defaultPendingComponent: PageSkeleton,
    defaultErrorComponent: ({ error, reset }) => <ErrorState error={error} onRetry={reset} />,
    defaultNotFoundComponent: () => <NotFoundState />,
  });
  return { router, queryClient };
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>['router'];
  }
}
