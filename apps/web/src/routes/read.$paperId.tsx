import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useCanGoBack, useRouter } from "@tanstack/react-router";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  FileTextIcon,
  GlobeIcon,
  InfoIcon,
  Loader2Icon,
  MaximizeIcon,
  MinimizeIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { NotesPanel } from "@/components/notes-panel";
import type { PdfHighlight, PdfViewerHandle } from "@/components/pdf-viewer";
import { ReaderView, type ReaderViewHandle, type TextHighlight } from "@/components/reader-view";
import { isBusy } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { sessionQuery } from "@/lib/auth-client";
import { type Note, usePaperNotes } from "@/lib/notes";
import { trpc } from "@/lib/trpc";
import { useLocalStorage } from "@/lib/use-local-storage";

const PdfViewer = lazy(() => import("@/components/pdf-viewer"));

export const Route = createFileRoute("/read/$paperId")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } });
  },
  component: ReadingMode,
});

function useFullscreen() {
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = () =>
    document.fullscreenElement
      ? void document.exitFullscreen()
      : void document.documentElement.requestFullscreen().catch(() => {});
  return { fullscreen, toggle, supported: document.fullscreenEnabled };
}

function ReadingMode() {
  const { paperId } = Route.useParams();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const preview = useQuery({
    ...trpc.paper.preview.queryOptions({ id: paperId }),
    refetchInterval: (query) =>
      query.state.data && isBusy(query.state.data.status) ? 2000 : false,
  });
  const notesApi = usePaperNotes(paperId);
  const [showNotes, setShowNotes] = useLocalStorage("shuki.reader.notes", "open", [
    "open",
    "closed",
  ] as const);
  const notesOpen = showNotes === "open";
  const layout = useDefaultLayout({
    id: "shuki-reader-layout",
    panelIds: notesOpen ? ["document", "notes"] : ["document"],
    storage: localStorage,
  });
  const fullscreen = useFullscreen();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const pdfRef = useRef<PdfViewerHandle>(null);
  const readerRef = useRef<ReaderViewHandle>(null);

  const data = preview.data;
  const notes = notesApi.notes.data;
  const pdf = data?.pdf ?? null;

  const pdfHighlights = useMemo<PdfHighlight[]>(
    () =>
      (notes ?? []).flatMap((note) =>
        note.anchor?.type === "pdf" && note.anchor.fileId === pdf?.id
          ? [{ id: note.id, page: note.anchor.page, rects: note.anchor.rects }]
          : [],
      ),
    [notes, pdf?.id],
  );
  const textHighlights = useMemo<TextHighlight[]>(
    () =>
      (notes ?? []).flatMap((note) =>
        note.anchor?.type === "text"
          ? [
              {
                id: note.id,
                start: note.anchor.start,
                end: note.anchor.end,
                quote: note.anchor.quote,
              },
            ]
          : [],
      ),
    [notes],
  );

  const activate = (id: string, focus = false) => {
    setActiveId(id);
    if (focus) {
      if (!notesOpen) setShowNotes("open");
      setFocusRequest({ id, nonce: Date.now() });
    }
  };

  const jumpTo = (note: Note) => {
    const anchor = note.anchor;
    if (anchor?.type === "pdf") {
      pdfRef.current?.scrollTo(anchor.page, Math.min(...anchor.rects.map((rect) => rect.y)));
    } else if (anchor?.type === "text") {
      readerRef.current?.scrollTo({ id: note.id, ...anchor });
    }
  };

  const close = () =>
    canGoBack
      ? router.history.back()
      : router.navigate({ to: "/papers/$paperId", params: { paperId } });

  const Icon = data?.sourceType === "url" ? GlobeIcon : FileTextIcon;

  let content: ReactNode;
  if (preview.isPending) {
    content = <Message icon={<Loader2Icon className="animate-spin" />}>Loading…</Message>;
  } else if (preview.isError) {
    content = <Message icon={<AlertCircleIcon />}>{preview.error.message}</Message>;
  } else if (pdf) {
    content = (
      <Suspense
        fallback={<Message icon={<Loader2Icon className="animate-spin" />}>Loading…</Message>}
      >
        <PdfViewer
          key={pdf.id}
          ref={pdfRef}
          url={`/api/files/${pdf.id}`}
          fileName={pdf.fileName}
          highlights={pdfHighlights}
          activeHighlightId={activeId}
          onHighlightClick={(id) => activate(id, true)}
          onAnnotate={(selection) =>
            notesApi.create.mutate(
              { paperId, anchor: { type: "pdf", fileId: pdf.id, ...selection } },
              { onSuccess: (created) => activate(created.id, true) },
            )
          }
        />
      </Suspense>
    );
  } else if (data?.website?.html) {
    content = (
      <ReaderView
        ref={readerRef}
        html={data.website.html}
        imageUrl={data.website.imageUrl}
        className="max-w-3xl px-8 py-10 text-base leading-8"
        highlights={textHighlights}
        activeHighlightId={activeId}
        onHighlightClick={(id) => activate(id, true)}
        onAnnotate={(selection) =>
          notesApi.create.mutate(
            { paperId, anchor: { type: "text", ...selection } },
            { onSuccess: (created) => activate(created.id, true) },
          )
        }
      />
    );
  } else if (data && isBusy(data.status)) {
    content = <Message icon={<Loader2Icon className="animate-spin" />}>Processing…</Message>;
  } else {
    content = (
      <Message icon={<InfoIcon />}>
        <span>There is nothing to read yet – upload a PDF on the paper's page.</span>
        <Button size="sm" variant="outline" asChild>
          <Link to="/papers/$paperId" params={{ paperId }}>
            Open paper
          </Link>
        </Button>
      </Message>
    );
  }

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <Button size="icon-sm" variant="ghost" onClick={close} title="Leave reading mode">
          <ArrowLeftIcon />
        </Button>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium" title={data?.title}>
          {data?.title ?? ""}
        </h1>
        {fullscreen.supported && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={fullscreen.toggle}
            title={fullscreen.fullscreen ? "Exit full screen" : "Full screen"}
          >
            {fullscreen.fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
          </Button>
        )}
        <Button
          size="sm"
          variant={notesOpen ? "secondary" : "ghost"}
          onClick={() => setShowNotes(notesOpen ? "closed" : "open")}
          title={notesOpen ? "Hide notes" : "Show notes"}
        >
          {notesOpen ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
          <span className="hidden sm:inline">Notes</span>
          {notes && notes.length > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">{notes.length}</span>
          )}
        </Button>
      </header>
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <ResizablePanel id="document" minSize={360} className="min-w-0">
          {content}
        </ResizablePanel>
        {notesOpen && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel id="notes" defaultSize="30%" minSize={280} maxSize="50%">
              <NotesPanel
                paperId={paperId}
                api={notesApi}
                activeId={activeId}
                focusRequest={focusRequest}
                onActivate={activate}
                onJump={jumpTo}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}

function Message({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground [&>svg]:size-6">
      {icon}
      {children}
    </div>
  );
}
