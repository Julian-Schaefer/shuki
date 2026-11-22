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
import {
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { AnnotateButton, buttonPosition } from "@/components/annotate-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { NoteRect } from "@/lib/notes";
import { cn } from "@/lib/utils";

GlobalWorkerOptions.workerSrc = workerSrc;

type FindStatus = { current: number; total: number; notFound: boolean };

/** A marked passage drawn on top of the PDF. */
export type PdfHighlight = { id: string; page: number; rects: NoteRect[] };
/** The user's current text selection, in page-relative coordinates. */
export type PdfSelection = { page: number; rects: NoteRect[]; quote: string };
export type PdfViewerHandle = { scrollTo: (page: number, y: number) => void };

/** Content box of a page – the area canvas, text layer and our highlights share. */
function pageBox(page: HTMLElement) {
  const rect = page.getBoundingClientRect();
  return {
    left: rect.left + page.clientLeft,
    top: rect.top + page.clientTop,
    width: page.clientWidth,
    height: page.clientHeight,
  };
}

/** Joins the many small rects of a selection into one rect per line. */
function mergeRects(rects: NoteRect[]): NoteRect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: NoteRect[] = [];
  for (const rect of sorted) {
    const line = merged.find(
      (other) =>
        Math.abs(other.y + other.h / 2 - (rect.y + rect.h / 2)) < Math.min(other.h, rect.h) / 2 &&
        rect.x <= other.x + other.w + 0.02 &&
        other.x <= rect.x + rect.w + 0.02,
    );
    if (!line) {
      merged.push({ ...rect });
      continue;
    }
    const right = Math.max(line.x + line.w, rect.x + rect.w);
    const bottom = Math.max(line.y + line.h, rect.y + rect.h);
    line.x = Math.min(line.x, rect.x);
    line.y = Math.min(line.y, rect.y);
    line.w = right - line.x;
    line.h = bottom - line.y;
  }
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  return merged.map((rect) => ({
    x: round(rect.x),
    y: round(rect.y),
    w: round(rect.w),
    h: round(rect.h),
  }));
}

/** Reads the current selection if it lies on a page of this viewer. */
function readSelection(viewerElement: HTMLElement): { data: PdfSelection; range: Range } | null {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const start =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  const page = start?.closest<HTMLElement>(".page[data-page-number]");
  if (!page || !viewerElement.contains(page)) return null;
  const quote = selection.toString().replace(/\s+/g, " ").trim().slice(0, 10_000);
  if (!quote) return null;

  const box = pageBox(page);
  const rects = mergeRects(
    [...range.getClientRects()]
      // Lines only: skip empty rects and whole blocks (e.g. pdf.js' end-of-content marker).
      .filter((rect) => rect.width > 1 && rect.height > 1 && rect.height < box.height * 0.1)
      .map((rect) => {
        const left = Math.max(rect.left, box.left);
        const top = Math.max(rect.top, box.top);
        const right = Math.min(rect.right, box.left + box.width);
        const bottom = Math.min(rect.bottom, box.top + box.height);
        return {
          x: (left - box.left) / box.width,
          y: (top - box.top) / box.height,
          w: (right - left) / box.width,
          h: (bottom - top) / box.height,
        };
      })
      .filter((rect) => rect.w > 0 && rect.h > 0),
  ).slice(0, 200);
  if (!rects.length) return null;
  return { data: { page: Number(page.dataset.pageNumber), rects, quote }, range };
}

/** Draws the highlights of one page into an overlay that scales with the page. */
function paintHighlights(
  page: HTMLElement,
  pageNumber: number,
  highlights: PdfHighlight[],
  activeId: string | null,
) {
  page.querySelector(":scope > .shuki-highlights")?.remove();
  const onPage = highlights.filter((highlight) => highlight.page === pageNumber);
  if (!onPage.length) return;
  const layer = document.createElement("div");
  layer.className = "shuki-highlights";
  for (const highlight of onPage) {
    for (const rect of highlight.rects) {
      const mark = document.createElement("div");
      if (highlight.id === activeId) mark.className = "active";
      mark.style.left = `${rect.x * 100}%`;
      mark.style.top = `${rect.y * 100}%`;
      mark.style.width = `${rect.w * 100}%`;
      mark.style.height = `${rect.h * 100}%`;
      layer.append(mark);
    }
  }
  // Appended last: pdf.js positions its own layers relative to each other.
  page.append(layer);
}

function paintAllHighlights(
  viewer: PdfJsViewer,
  highlights: PdfHighlight[],
  activeId: string | null,
) {
  if (!viewer.pdfDocument) return;
  for (let index = 0; index < viewer.pagesCount; index++) {
    const pageView = viewer.getPageView(index);
    if (pageView?.div) paintHighlights(pageView.div, index + 1, highlights, activeId);
  }
}

/**
 * PDF viewer built on pdf.js: continuous scrolling with lazy page rendering,
 * selectable text, clickable links, zoom, page navigation and full-text search.
 * With `onAnnotate`, selected text can be turned into a note; `highlights` are
 * drawn on top of the pages.
 */
export default function PdfViewer({
  url,
  fileName,
  highlights,
  activeHighlightId,
  onAnnotate,
  onHighlightClick,
  ref,
}: {
  url: string;
  fileName: string;
  highlights?: PdfHighlight[];
  activeHighlightId?: string | null;
  onAnnotate?: (selection: PdfSelection) => void;
  onHighlightClick?: (id: string) => void;
  ref?: Ref<PdfViewerHandle>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pdfViewer = useRef<PdfJsViewer | null>(null);
  const eventBus = useRef<EventBus | null>(null);
  const highlightsRef = useRef<PdfHighlight[]>([]);
  const activeRef = useRef<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{
    data: PdfSelection;
    top: number;
    left: number;
  } | null>(null);

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
      paintAllHighlights(viewer, highlightsRef.current, activeRef.current);
    });
    // pdf.js clears a page's DOM before re-rendering it (e.g. on zoom) – redraw ours.
    bus.on(
      "pagerendered",
      ({ pageNumber, source }: { pageNumber: number; source: { div: HTMLElement } }) =>
        paintHighlights(source.div, pageNumber, highlightsRef.current, activeRef.current),
    );
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

  // Redraw highlights whenever notes change.
  useEffect(() => {
    highlightsRef.current = highlights ?? [];
    activeRef.current = activeHighlightId ?? null;
    if (pdfViewer.current) {
      paintAllHighlights(pdfViewer.current, highlightsRef.current, activeRef.current);
    }
  }, [highlights, activeHighlightId]);

  useImperativeHandle(
    ref,
    () => ({
      scrollTo: (pageNumber, y) => {
        const container = containerRef.current;
        const page = pdfViewer.current?.getPageView(pageNumber - 1)?.div as HTMLElement | undefined;
        if (!container || !page) return;
        const offset = page.getBoundingClientRect().top - container.getBoundingClientRect().top;
        container.scrollTo({
          top: container.scrollTop + offset + y * page.clientHeight - 96,
          behavior: "smooth",
        });
      },
    }),
    [],
  );

  // Offer the "Note" button for a fresh selection; a plain click may hit a highlight.
  const checkSelection = () => {
    const container = containerRef.current;
    const viewerElement = viewerRef.current;
    const selected = onAnnotate && container && viewerElement ? readSelection(viewerElement) : null;
    setPendingSelection(
      selected && container
        ? { data: selected.data, ...buttonPosition(selected.range, container) }
        : null,
    );
    return Boolean(selected);
  };

  const onPointerUp = (event: MouseEvent) => {
    if (!onAnnotate && !onHighlightClick) return;
    if (checkSelection()) return;
    const page = (event.target as Element).closest<HTMLElement>(".page[data-page-number]");
    if (!page || !onHighlightClick) return;
    const box = pageBox(page);
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    const pageNumber = Number(page.dataset.pageNumber);
    const hit = highlightsRef.current.find(
      (highlight) =>
        highlight.page === pageNumber &&
        highlight.rects.some(
          (rect) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h,
        ),
    );
    if (hit) onHighlightClick(hit.id);
  };

  // Hide the button once the selection is gone.
  useEffect(() => {
    if (!pendingSelection) return;
    const onChange = () => {
      if (document.getSelection()?.isCollapsed !== false) setPendingSelection(null);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [pendingSelection]);

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
        {/* biome-ignore lint/a11y/noStaticElementInteractions: text selection and highlight clicks */}
        <div
          ref={containerRef}
          className="pdf-container absolute inset-0 overflow-auto"
          onMouseUp={onPointerUp}
          onKeyUp={(event) => {
            if (event.shiftKey && onAnnotate) checkSelection();
          }}
        >
          <div ref={viewerRef} className="pdfViewer" />
          {pendingSelection && onAnnotate && (
            <AnnotateButton
              top={pendingSelection.top}
              left={pendingSelection.left}
              onClick={() => {
                onAnnotate(pendingSelection.data);
                document.getSelection()?.removeAllRanges();
                setPendingSelection(null);
              }}
            />
          )}
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
