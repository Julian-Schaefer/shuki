import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertCircleIcon,
  BookOpenIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GlobeIcon,
  InfoIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import { lazy, Suspense } from "react";
import { ReaderView } from "@/components/reader-view";
import { isBusy } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePreview } from "@/lib/preview";
import { type RouterOutputs, trpc } from "@/lib/trpc";

type Preview = RouterOutputs["paper"]["preview"];

// pdf.js is large – only load it once a PDF is actually shown.
const PdfViewer = lazy(() => import("@/components/pdf-viewer"));

/** Right-hand panel with a live preview of a paper: its PDF or the saved website. */
export function PreviewPanel({ paperId }: { paperId: string }) {
  const { close } = usePreview();
  const preview = useQuery({
    ...trpc.paper.preview.queryOptions({ id: paperId }),
    refetchInterval: (query) =>
      query.state.data && isBusy(query.state.data.status) ? 2000 : false,
  });
  const data = preview.data;
  const externalUrl = data?.pdf ? `/api/files/${data.pdf.id}` : data?.url;
  const Icon = data?.sourceType === "url" ? GlobeIcon : FileTextIcon;

  return (
    <aside className="flex h-svh min-w-0 flex-col overflow-hidden border-l bg-background">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          {data ? (
            <Link
              to="/papers/$paperId"
              params={{ paperId }}
              className="block truncate font-medium text-sm hover:underline"
              title={data.title}
            >
              {data.title}
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground">Preview</span>
          )}
        </div>
        {(data?.pdf || data?.website) && (
          <Button size="icon-sm" variant="ghost" asChild>
            <Link to="/read/$paperId" params={{ paperId }} title="Reading mode">
              <BookOpenIcon />
            </Link>
          </Button>
        )}
        {externalUrl && (
          <Button size="icon-sm" variant="ghost" asChild>
            <a href={externalUrl} target="_blank" rel="noreferrer" title="Open in new tab">
              <ExternalLinkIcon />
            </a>
          </Button>
        )}
        <Button size="icon-sm" variant="ghost" onClick={close} title="Close preview">
          <XIcon />
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        {preview.isPending ? (
          <PreviewMessage icon={<Loader2Icon className="animate-spin" />}>Loading…</PreviewMessage>
        ) : preview.isError ? (
          <PreviewMessage icon={<AlertCircleIcon />}>{preview.error.message}</PreviewMessage>
        ) : data ? (
          <PreviewContent data={data} />
        ) : null}
      </div>
    </aside>
  );
}

function PreviewContent({ data }: { data: Preview }) {
  if (data.pdf) {
    return (
      <Suspense
        fallback={
          <PreviewMessage icon={<Loader2Icon className="animate-spin" />}>Loading…</PreviewMessage>
        }
      >
        <PdfViewer
          key={data.pdf.id}
          url={`/api/files/${data.pdf.id}`}
          fileName={data.pdf.fileName}
        />
      </Suspense>
    );
  }
  if (isBusy(data.status)) {
    return (
      <PreviewMessage icon={<Loader2Icon className="animate-spin" />}>
        {data.sourceType === "url" ? "Saving website…" : "Processing…"}
      </PreviewMessage>
    );
  }
  if (data.sourceType === "url" && data.url) {
    return <WebsitePreview url={data.url} website={data.website} error={data.error} />;
  }
  return (
    <PreviewMessage icon={<InfoIcon />}>
      No preview available. Upload a PDF on the paper's page.
    </PreviewMessage>
  );
}

function WebsitePreview({
  url,
  website,
  error,
}: {
  url: string;
  website: Preview["website"];
  error: string | null;
}) {
  return (
    <Tabs defaultValue={website ? "reader" : "live"} className="flex h-full flex-col gap-0">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <TabsList>
          <TabsTrigger value="reader" disabled={!website}>
            Reader
          </TabsTrigger>
          <TabsTrigger value="live">Live</TabsTrigger>
        </TabsList>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto truncate text-xs text-muted-foreground hover:underline"
          title={url}
        >
          {new URL(url).hostname}
        </a>
      </div>
      <TabsContent value="reader" className="min-h-0 flex-1">
        {website?.html ? (
          <ReaderView html={website.html} imageUrl={website.imageUrl} />
        ) : (
          <PreviewMessage icon={<AlertCircleIcon />}>
            {error ?? "The website could not be saved."}
          </PreviewMessage>
        )}
      </TabsContent>
      <TabsContent value="live" className="min-h-0 flex-1">
        {website?.embeddable === false || new URL(url).origin === window.location.origin ? (
          <PreviewMessage icon={<InfoIcon />}>
            <span>This site does not allow being embedded.</span>
            <Button size="sm" variant="outline" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLinkIcon /> Open original
              </a>
            </Button>
          </PreviewMessage>
        ) : (
          <iframe
            src={url}
            title="Live website"
            className="size-full border-0"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="no-referrer"
          />
        )}
      </TabsContent>
    </Tabs>
  );
}

function PreviewMessage({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground [&>svg]:size-6">
      {icon}
      {children}
    </div>
  );
}
