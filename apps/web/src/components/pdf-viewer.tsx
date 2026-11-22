import "pdfjs-dist/web/pdf_viewer.css";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  DownloadIcon,
  Loader2Icon,
  MoveHorizontalIcon,
  SearchIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  EventBus,
  FindState,
  LinkTarget,
  PDFFindController,
  PDFLinkService,
  PDFViewer as PdfJsViewer,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

GlobalWorkerOptions.workerSrc = workerSrc;

type FindStatus = { current: number; total: number; notFound: boolean };

/**
 * PDF viewer built on pdf.js: continuous scrolling with lazy page rendering,
 * selectable text, clickable links, zoom, page navigation and full-text search.
 */
export default function PdfViewer({ url, fileName }: { url: string; fileName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pdfViewer = useRef<PdfJsViewer | null>(null);
  const eventBus = useRef<EventBus | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(1);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [findStatus, setFindStatus] = useState<FindStatus | null>(null);
  const findInputRef = useRef<HTMLInputElement>(null);

  // Set up pdf.js and load the document.
  useEffect(() => {
    const container = containerRef.current;
    const viewerElement = viewerRef.current;
    if (!container || !viewerElement) return;

    let disposed = false;
    setLoading(true);
    setError(null);
    setPageCount(0);
    const bus = new EventBus();
    const linkService = new PDFLinkService({ eventBus: bus, externalLinkTarget: LinkTarget.BLANK });
    const findController = new PDFFindController({ eventBus: bus, linkService });
    const viewer = new PdfJsViewer({
      container,
      viewer: viewerElement,
      eventBus: bus,
      linkService,
      findController,
    });
    linkService.setViewer(viewer);
    pdfViewer.current = viewer;
    eventBus.current = bus;

    bus.on("pagesinit", () => {
      viewer.currentScaleValue = "page-width";
    });
    bus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
      setPage(pageNumber);
      setPageInput(String(pageNumber));
    });
    bus.on("scalechanging", ({ scale }: { scale: number }) => setScale(scale));
    const onMatches = ({ matchesCount }: { matchesCount: { current: number; total: number } }) =>
      setFindStatus((prev) => ({ ...matchesCount, notFound: prev?.notFound ?? false }));
    bus.on("updatefindmatchescount", onMatches);
    bus.on(
      "updatefindcontrolstate",
      ({
        state,
        matchesCount,
      }: {
        state: number;
        matchesCount: { current: number; total: number };
      }) => {
        if (state === FindState.PENDING) return;
        setFindStatus({ ...matchesCount, notFound: state === FindState.NOT_FOUND });
      },
    );

    const task = getDocument({ url, withCredentials: true });
    task.promise.then(
      (loaded) => {
        if (disposed) return;
        viewer.setDocument(loaded);
        linkService.setDocument(loaded, null);
        setPageCount(loaded.numPages);
        setLoading(false);
      },
      (reason: unknown) => {
        if (disposed) return;
        setError(reason instanceof Error ? reason.message : "The PDF could not be loaded.");
        setLoading(false);
      },
    );

    // Keep "fit width" when the panel is resized.
    const resize = new ResizeObserver(() => {
      const value = viewer.currentScaleValue;
      if (value === "page-width" || value === "page-fit" || value === "auto") {
        viewer.currentScaleValue = value;
      }
    });
    resize.observe(container);

    return () => {
      disposed = true;
      resize.disconnect();
      viewer.setDocument(null as unknown as PDFDocumentProxy);
      // Destroying the loading task also destroys the loaded document.
      void task.destroy();
      pdfViewer.current = null;
      eventBus.current = null;
    };
  }, [url]);

  const goToPage = (target: number) => {
    const viewer = pdfViewer.current;
    if (!viewer || !pageCount) return;
    viewer.currentPageNumber = Math.min(Math.max(1, target), pageCount);
  };

  const find = useCallback((text: string, type: "" | "again", findPrevious = false) => {
    eventBus.current?.dispatch("find", {
      source: null,
      type,
      query: text,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious,
      matchDiacritics: false,
    });
  }, []);

  const closeFind = () => {
    setFindOpen(false);
    setQuery("");
    setFindStatus(null);
    find("", "");
  };

  const openFind = () => {
    setFindOpen(true);
    findInputRef.current?.select();
  };

  // Ctrl/Cmd+F inside the viewer opens the search bar instead of the browser's.
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      openFind();
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: captures Ctrl+F for the viewer
    <div className="@container/pdf flex h-full min-w-0 flex-col" onKeyDown={onKeyDown}>
      <div className="flex shrink-0 items-center gap-0.5 overflow-hidden border-b px-1.5 py-1.5">
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={page <= 1}
          onClick={() => goToPage(page - 1)}
          title="Previous page"
        >
          <ChevronLeftIcon />
        </Button>
        <form
          className="flex items-center gap-1 text-xs text-muted-foreground"
          onSubmit={(event) => {
            event.preventDefault();
            goToPage(Number(pageInput) || page);
          }}
        >
          <Input
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value)}
            onBlur={() => setPageInput(String(page))}
            className="h-7 w-10 px-1 text-center text-xs"
            inputMode="numeric"
            aria-label="Page number"
          />
          <span className="whitespace-nowrap">/ {pageCount || "–"}</span>
        </form>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={page >= pageCount}
          onClick={() => goToPage(page + 1)}
          title="Next page"
        >
          <ChevronRightIcon />
        </Button>
        <Separator
          orientation="vertical"
          className="mx-1 data-vertical:h-4 data-vertical:self-auto"
        />
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => pdfViewer.current?.decreaseScale()}
          title="Zoom out"
        >
          <ZoomOutIcon />
        </Button>
        <span className="hidden w-10 text-center text-xs tabular-nums text-muted-foreground @xs/pdf:inline">
          {Math.round(scale * 100)}%
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => pdfViewer.current?.increaseScale()}
          title="Zoom in"
        >
          <ZoomInIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => {
            if (pdfViewer.current) pdfViewer.current.currentScaleValue = "page-width";
          }}
          title="Fit to width"
          className="hidden @xs/pdf:inline-flex"
        >
          <MoveHorizontalIcon />
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon-sm"
            variant={findOpen ? "secondary" : "ghost"}
            onClick={() => (findOpen ? closeFind() : openFind())}
            title="Search (Ctrl+F)"
          >
            <SearchIcon />
          </Button>
          <Button size="icon-sm" variant="ghost" asChild>
            <a href={`${url}?download=1`} download={fileName} title="Download">
              <DownloadIcon />
            </a>
          </Button>
        </div>
      </div>

      {findOpen && (
        <form
          className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            find(query, "again");
          }}
        >
          <Input
            ref={findInputRef}
            autoFocus
            value={query}
            placeholder="Search in document…"
            className="h-7 text-xs"
            onChange={(event) => {
              setQuery(event.target.value);
              find(event.target.value, "");
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeFind();
              if (event.key === "Enter" && event.shiftKey) {
                event.preventDefault();
                find(query, "again", true);
              }
            }}
          />
          <span
            className={cn(
              "min-w-16 text-center text-xs whitespace-nowrap tabular-nums text-muted-foreground",
              findStatus?.notFound && query && "text-destructive",
            )}
          >
            {query && findStatus
              ? findStatus.notFound
                ? "No results"
                : `${findStatus.current} of ${findStatus.total}`
              : ""}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={!query}
            onClick={() => find(query, "again", true)}
            title="Previous match (Shift+Enter)"
          >
            <ChevronUpIcon />
          </Button>
          <Button
            type="submit"
            size="icon-sm"
            variant="ghost"
            disabled={!query}
            title="Next match (Enter)"
          >
            <ChevronDownIcon />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" onClick={closeFind} title="Close">
            <XIcon />
          </Button>
        </form>
      )}

      <div className="relative min-h-0 flex-1 bg-muted">
        {/* pdf.js requires an absolutely positioned scroll container. */}
        <div ref={containerRef} className="pdf-container absolute inset-0 overflow-auto">
          <div ref={viewerRef} className="pdfViewer" />
        </div>
        {(loading || error) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
            {loading ? <Loader2Icon className="size-6 animate-spin" /> : null}
            {error ?? "Loading PDF…"}
          </div>
        )}
      </div>
    </div>
  );
}
