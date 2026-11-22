import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { FolderPlusIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { MoveToFolderSubmenu } from "@/components/move-to-folder-menu";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { type FolderRow, foldersQuery, subtreeIds } from "@/lib/folders";
import { trpc } from "@/lib/trpc";

/** Menu items for a folder: new subfolder, rename, move, delete. Used in sidebar and library. */
export function FolderActionsMenuItems({
  folder,
  onNewSubfolder,
  onRename,
}: {
  folder: FolderRow;
  onNewSubfolder: () => void;
  onRename: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const folders = useQuery(foldersQuery());
  const rows = folders.data ?? [];
  const subtree = subtreeIds(rows, folder.id);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.folder.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.paper.pathKey() }),
    ]);

  const move = useMutation(
    trpc.folder.move.mutationOptions({
      onSuccess: invalidate,
      onError: (error) => toast.error(error.message),
    }),
  );
  const remove = useMutation(
    trpc.folder.delete.mutationOptions({
      onSuccess: async () => {
        // Leave the deleted folder (or one of its subfolders) if it is open.
        const open = (location.search as { folder?: string }).folder;
        if (location.pathname === "/" && open && subtree.has(open)) {
          await navigate({
            to: "/",
            search: folder.parentId ? { folder: folder.parentId } : {},
          });
        }
        await invalidate();
        toast.success(`Deleted "${folder.name}"`);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <>
      <DropdownMenuItem onSelect={onNewSubfolder}>
        <FolderPlusIcon />
        New subfolder
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onRename}>
        <PencilIcon />
        Rename
      </DropdownMenuItem>
      <MoveToFolderSubmenu
        currentFolderId={folder.parentId}
        disabledIds={subtree}
        onSelect={(parentId) => move.mutate({ id: folder.id, parentId })}
      />
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => {
          const message =
            subtree.size > 1
              ? `Delete "${folder.name}" and its ${subtree.size - 1} subfolder(s)? Papers inside are kept and moved to the library root.`
              : `Delete "${folder.name}"? Papers inside are kept and moved to the library root.`;
          if (confirm(message)) remove.mutate({ id: folder.id });
        }}
      >
        <Trash2Icon />
        Delete folder
      </DropdownMenuItem>
    </>
  );
}
