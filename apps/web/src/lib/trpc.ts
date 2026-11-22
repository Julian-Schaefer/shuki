import type { AppRouter } from "@shuki/server/trpc";
import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import superjson from "superjson";

export type { RouterInputs, RouterOutputs } from "@shuki/server/trpc";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Don't retry auth or validation errors.
        if (error instanceof TRPCClientError && error.data?.httpStatus < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch: (url, options) => fetch(url, { ...options, credentials: "include" }),
    }),
  ],
});

/** Usage: `useQuery(trpc.paper.list.queryOptions())` */
export const trpc = createTRPCOptionsProxy<AppRouter>({ client: trpcClient, queryClient });
