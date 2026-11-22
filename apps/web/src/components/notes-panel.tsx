import { MessageSquareTextIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { displayQuote, type Note, sortNotes, type usePaperNotes } from "@/lib/notes";
import { cn } from "@/lib/utils";

type NotesApi = ReturnType<typeof usePaperNotes>;

export function NotesPanel({
  paperId,
  api,
  activeId,
  focusRequest,
  onActivate,
  onJump,
}: {
  paperId: string;
  api: NotesApi;
  activeId: string | null;
  /** A new nonce scrolls to and focuses that note. */
  focusRequest: { id: string; nonce: number } | null;
  onActivate: (id: string, focus?: boolean) => void;
  onJump: (note: Note) => void;
}) {
  const notes = sortNotes(api.notes.data ?? []);

  return (
    <aside className="flex h-full min-w-0 flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <MessageSquareTextIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Notes</span>
        {notes.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">{notes.length}</span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          disabled={api.create.isPending}
          onClick={() =>
            api.create.mutate({ paperId }, { onSuccess: (created) => onActivate(created.id, true) })
          }
          title="Add a note without marking text"
        >
          <PlusIcon /> Note
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {api.notes.isPending ? null : notes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
            <MessageSquareTextIcon className="size-6 opacity-60" />
            <p>No notes yet.</p>
            <p className="text-xs">
              Select text in the document and click <strong>Note</strong> to attach a note to that
              passage.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2 p-3">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                api={api}
                active={note.id === activeId}
                focusNonce={focusRequest?.id === note.id ? focusRequest.nonce : null}
                onActivate={() => onActivate(note.id)}
                onJump={() => {
                  onActivate(note.id);
                  onJump(note);
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function NoteCard({
  note,
  api,
  active,
  focusNonce,
  onActivate,
  onJump,
}: {
  note: Note;
  api: NotesApi;
  active: boolean;
  focusNonce: number | null;
  onActivate: () => void;
  onJump: () => void;
}) {
  const [draft, setDraft] = useState(note.body);
  const [saving, setSaving] = useState(false);
  const draftRef = useRef(draft);
  const savedRef = useRef(note.body);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cardRef = useRef<HTMLLIElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { update } = api;

  const flush = () => {
    clearTimeout(timer.current);
    const body = draftRef.current;
    if (body === savedRef.current) return;
    savedRef.current = body;
    setSaving(true);
    update.mutate({ id: note.id, body }, { onSettled: () => setSaving(false) });
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Flush pending edits on unmount.
  useEffect(() => () => flushRef.current(), []);

  useEffect(() => {
    if (focusNonce === null) return;
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    textareaRef.current?.focus({ preventScroll: true });
  }, [focusNonce]);

  const anchor = note.anchor;

  return (
    <li
      ref={cardRef}
      className={cn(
        "group/note rounded-lg border bg-card p-2.5 transition-shadow",
        active ? "border-primary/60 ring-2 ring-primary/30" : "hover:shadow-sm",
      )}
    >
      {anchor && (
        <button
          type="button"
          onClick={onJump}
          className="mb-2 block w-full cursor-pointer rounded-sm border-l-2 border-yellow-400 bg-yellow-400/10 py-1 pr-1 pl-2 text-left text-xs leading-relaxed text-muted-foreground hover:bg-yellow-400/20"
          title="Show in document"
        >
          {anchor.type === "pdf" && (
            <span className="mr-1.5 font-medium text-foreground/70">p. {anchor.page}</span>
          )}
          <span className="line-clamp-3 inline">{displayQuote(anchor)}</span>
        </button>
      )}
      <textarea
        ref={textareaRef}
        value={draft}
        placeholder={anchor ? "Write a note about this passage…" : "Write a note…"}
        rows={2}
        onFocus={onActivate}
        onChange={(event) => {
          setDraft(event.target.value);
          draftRef.current = event.target.value;
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, 800);
        }}
        onBlur={flush}
        className="field-sizing-content block max-h-96 min-h-12 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
      />
      <div className="mt-1 flex h-6 items-center gap-2 text-[0.7rem] text-muted-foreground">
        <span>
          {saving
            ? "Saving…"
            : note.updatedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </span>
        <Button
          size="icon-xs"
          variant="ghost"
          className="ml-auto opacity-0 group-hover/note:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
          onClick={() => {
            clearTimeout(timer.current);
            savedRef.current = draftRef.current;
            api.deleteNote(note, draftRef.current);
          }}
          title="Delete note"
        >
          <Trash2Icon />
        </Button>
      </div>
    </li>
  );
}
