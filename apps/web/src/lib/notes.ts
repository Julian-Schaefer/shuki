import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { type RouterOutputs, trpc } from "@/lib/trpc";

export type Note = RouterOutputs["note"]["listByPaper"][number];
export type NoteAnchor = NonNullable<Note["anchor"]>;
export type PdfAnchor = Extract<NoteAnchor, { type: "pdf" }>;
export type TextAnchor = Extract<NoteAnchor, { type: "text" }>;
/** Rectangle on a PDF page in 0..1 of the page size. */
export type NoteRect = PdfAnchor["rects"][number];

/** Order in the notes column: general notes first, then by position in the document. */
export function sortNotes(notes: Note[]): Note[] {
  const position = (note: Note): [number, number, number] => {
    const anchor = note.anchor;
    if (!anchor) return [0, 0, note.createdAt.getTime()];
    if (anchor.type === "text") return [1, anchor.start, 0];
    const top = Math.min(...anchor.rects.map((rect) => rect.y));
    const left = Math.min(...anchor.rects.map((rect) => rect.x));
    return [1, anchor.page * 10 + top, left];
  };
  return [...notes].sort((a, b) => {
    const [pa, pb] = [position(a), position(b)];
    return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
  });
}

/** Whitespace-collapsed quote for display. */
export const displayQuote = (anchor: NoteAnchor) => anchor.quote.replace(/\s+/g, " ").trim();

/** Notes of a paper plus mutations that keep the cached list in sync. */
export function usePaperNotes(paperId: string) {
  const queryClient = useQueryClient();
  const listOptions = trpc.note.listByPaper.queryOptions({ paperId });
  const notes = useQuery(listOptions);
  const setNotes = (update: (notes: Note[]) => Note[]) =>
    queryClient.setQueryData(listOptions.queryKey, (previous) => update(previous ?? []));

  const create = useMutation(
    trpc.note.create.mutationOptions({
      onSuccess: (created) => setNotes((list) => [...list, created]),
      onError: (error) => toast.error(error.message),
    }),
  );
  const update = useMutation(
    trpc.note.update.mutationOptions({
      onSuccess: (updated) =>
        setNotes((list) => list.map((note) => (note.id === updated.id ? updated : note))),
      onError: (error) => toast.error(`Note not saved: ${error.message}`),
    }),
  );
  const remove = useMutation(
    trpc.note.delete.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );

  const deleteNote = (note: Note, body: string) => {
    setNotes((list) => list.filter((item) => item.id !== note.id));
    remove.mutate(
      { id: note.id },
      {
        onSuccess: () =>
          toast("Note deleted", {
            action: {
              label: "Undo",
              onClick: () => create.mutate({ paperId, body, anchor: note.anchor ?? undefined }),
            },
          }),
        onError: () => setNotes((list) => [...list, note]),
      },
    );
  };

  return { notes, create, update, deleteNote };
}
