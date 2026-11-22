import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export type RouterContext = {
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-heading text-2xl font-semibold">Page not found</h1>
      <Button asChild variant="outline">
        <Link to="/">Back to library</Link>
      </Button>
    </div>
  );
}
