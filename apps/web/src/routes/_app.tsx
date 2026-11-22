import { createFileRoute, Outlet, redirect, retainSearchParams } from "@tanstack/react-router";
import { useDefaultLayout } from "react-resizable-panels";
import { z } from "zod";
import { AppSidebar } from "@/components/app-sidebar";
import { PreviewPanel } from "@/components/preview-panel";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { sessionQuery } from "@/lib/auth-client";

/** Layout for all signed-in pages. Redirects to /login without a session. */
export const Route = createFileRoute("/_app")({
  // `preview` = paper shown in the right-hand preview panel; kept while navigating.
  validateSearch: z.object({ preview: z.uuid().optional() }),
  search: { middlewares: [retainSearchParams(["preview"])] },
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { session };
  },
  component: AppLayout,
});

function AppLayout() {
  const { preview } = Route.useSearch();
  const layout = useDefaultLayout({
    id: "shuki-preview-layout",
    panelIds: preview ? ["main", "preview"] : ["main"],
    storage: localStorage,
  });

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        <ResizablePanelGroup
          orientation="horizontal"
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <ResizablePanel id="main" minSize={360} className="flex flex-col">
            <div className="@container/main flex min-h-0 flex-1 flex-col overflow-auto">
              <Outlet />
            </div>
          </ResizablePanel>
          {preview && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel id="preview" defaultSize="45%" minSize={320} maxSize="75%">
                <PreviewPanel paperId={preview} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </SidebarInset>
    </SidebarProvider>
  );
}
