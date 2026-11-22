import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

export type FolderDialogState =
  | { mode: "create"; parentId: string | null; parentName?: string }
  | { mode: "rename"; id: string; name: string }
  | null;

/** Create or rename a folder. Render once and drive it with `state`. */
export function FolderDialog({
  state,
  onClose,
  onCreated,
}: {
  state: FolderDialogState;
  onClose: () => void;
  onCreated?: (folder: { id: string }) => void;
}) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.folder.pathKey() });

  const create = useMutation(
    trpc.folder.create.mutationOptions({
      onSuccess: async (folder) => {
        await invalidate();
        onClose();
        onCreated?.(folder);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const rename = useMutation(
    trpc.folder.rename.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        onClose();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (!name || !state) return;
    if (state.mode === "create") create.mutate({ name, parentId: state.parentId });
    else rename.mutate({ id: state.id, name });
  }

  const isRename = state?.mode === "rename";
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {state && (
          <form onSubmit={onSubmit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{isRename ? "Rename folder" : "New folder"}</DialogTitle>
              <DialogDescription>
                {state.mode === "create" && state.parentName
                  ? `Creates a subfolder in "${state.parentName}".`
                  : isRename
                    ? "Give the folder a new name."
                    : "Creates a folder at the top level of your library."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="folder-name">Name</Label>
              <Input
                id="folder-name"
                name="name"
                required
                maxLength={200}
                autoFocus
                defaultValue={state.mode === "rename" ? state.name : ""}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending || rename.isPending}>
                {isRename ? "Rename" : "Create folder"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Small hook bundling dialog state, so callers just call `openCreate` / `openRename`. */
export function useFolderDialog() {
  const [state, setState] = useState<FolderDialogState>(null);
  return {
    state,
    close: () => setState(null),
    openCreate: (parentId: string | null, parentName?: string) =>
      setState({ mode: "create", parentId, parentName }),
    openRename: (id: string, name: string) => setState({ mode: "rename", id, name }),
  };
}
