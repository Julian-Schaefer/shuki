import DOMPurify from "dompurify";
import {
  type MouseEvent,
  type Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnnotateButton, buttonPosition } from "@/components/annotate-button";
import type { TextAnchor } from "@/lib/notes";
import { cn } from "@/lib/utils";

export type TextHighlight = { id: string; start: number; end: number; quote: string };
export type TextSelection = Omit<TextAnchor, "type">;
export type ReaderViewHandle = { scrollTo: (highlight: TextHighlight) => void };

function textOffset(root: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function rangeFromOffsets(root: Node, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let position = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = (node as Text).data.length;
    if (!started && start <= position + length) {
      range.setStart(node, start - position);
      started = true;
    }
    if (started && end <= position + length) {
      range.setEnd(node, end - position);
      return range;
    }
    position += length;
  }
  return null;
}

/** Falls back to searching the quote if the text shifted. */
function locate(root: Node, highlight: TextHighlight): Range | null {
  const range = rangeFromOffsets(root, highlight.start, highlight.end);
  if (range?.toString().startsWith(highlight.quote)) return range;
  const index = (root.textContent ?? "").indexOf(highlight.quote);
  return index < 0
    ? null
    : rangeFromOffsets(root, index, index + (highlight.end - highlight.start));
}

/** `caretRangeFromPoint` for older Safari. */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  if ("caretPositionFromPoint" in document) {
    const position = document.caretPositionFromPoint(x, y);
    return position ? { node: position.offsetNode, offset: position.offset } : null;
  }
  const range = (document as Document).caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

const supportsHighlights = () => typeof CSS !== "undefined" && "highlights" in CSS;

/** Highlights use the CSS Custom Highlight API, so the article DOM stays untouched. */
export function ReaderView({
  html,
  imageUrl,
  highlights,
  activeHighlightId,
  onAnnotate,
  onHighlightClick,
  className,
  ref,
}: {
  html: string;
  imageUrl?: string | null;
  highlights?: TextHighlight[];
  activeHighlightId?: string | null;
  onAnnotate?: (selection: TextSelection) => void;
  onHighlightClick?: (id: string) => void;
  className?: string;
  ref?: Ref<ReaderViewHandle>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rangesRef = useRef(new Map<string, Range>());
  const [pending, setPending] = useState<{
    data: TextSelection;
    top: number;
    left: number;
  } | null>(null);

  // Defense in depth: the server sanitized it already.
  const cleanHtml = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        FORBID_TAGS: ["style", "form", "input", "iframe"],
        ADD_ATTR: ["target"],
      }),
    [html],
  );

  useEffect(() => {
    const root = contentRef.current;
    const ranges = new Map<string, Range>();
    if (root && cleanHtml) {
      for (const highlight of highlights ?? []) {
        const range = locate(root, highlight);
        if (range) ranges.set(highlight.id, range);
      }
    }
    rangesRef.current = ranges;
    if (!supportsHighlights() || !highlights) return;
    const all = [...ranges].filter(([id]) => id !== activeHighlightId).map(([, range]) => range);
    const active = activeHighlightId ? ranges.get(activeHighlightId) : undefined;
    CSS.highlights.set("shuki-note", new Highlight(...all));
    CSS.highlights.set("shuki-note-active", new Highlight(...(active ? [active] : [])));
    return () => {
      CSS.highlights.delete("shuki-note");
      CSS.highlights.delete("shuki-note-active");
    };
  }, [cleanHtml, highlights, activeHighlightId]);

  useImperativeHandle(
    ref,
    () => ({
      scrollTo: (highlight) => {
        const container = scrollRef.current;
        const range =
          rangesRef.current.get(highlight.id) ??
          (contentRef.current ? locate(contentRef.current, highlight) : null);
        if (!container || !range) return;
        const offset = range.getBoundingClientRect().top - container.getBoundingClientRect().top;
        container.scrollTo({ top: container.scrollTop + offset - 96, behavior: "smooth" });
      },
    }),
    [],
  );

  const checkSelection = () => {
    const root = contentRef.current;
    const container = scrollRef.current;
    const selection = document.getSelection();
    if (!onAnnotate || !root || !container || !selection || selection.isCollapsed) {
      setPending(null);
      return false;
    }
    const range = selection.getRangeAt(0);
    const quote = range.toString();
    if (!root.contains(range.commonAncestorContainer) || !quote.trim()) {
      setPending(null);
      return false;
    }
    const start = textOffset(root, range.startContainer, range.startOffset);
    setPending({
      data: { start, end: start + quote.length, quote: quote.slice(0, 10_000) },
      ...buttonPosition(range, container),
    });
    return true;
  };

  const onMouseUp = (event: MouseEvent) => {
    if (checkSelection() || !onHighlightClick) return;
    const caret = caretAt(event.clientX, event.clientY);
    if (!caret) return;
    for (const [id, range] of rangesRef.current) {
      if (range.isPointInRange(caret.node, caret.offset)) {
        onHighlightClick(id);
        return;
      }
    }
  };

  useEffect(() => {
    if (!pending) return;
    const onChange = () => {
      if (document.getSelection()?.isCollapsed !== false) setPending(null);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [pending]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: text selection and highlight clicks
    <div
      ref={scrollRef}
      className="relative h-full overflow-auto"
      onMouseUp={onMouseUp}
      onKeyUp={(event) => {
        if (event.shiftKey) checkSelection();
      }}
    >
      <article className={cn("reader mx-auto max-w-2xl px-6 py-6", className)}>
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            className="mb-6 max-h-64 w-full object-cover"
            referrerPolicy="no-referrer"
          />
        )}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized twice (server + DOMPurify) */}
        <div ref={contentRef} dangerouslySetInnerHTML={{ __html: cleanHtml }} />
      </article>
      {pending && onAnnotate && (
        <AnnotateButton
          top={pending.top}
          left={pending.left}
          onClick={() => {
            onAnnotate(pending.data);
            document.getSelection()?.removeAllRanges();
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
