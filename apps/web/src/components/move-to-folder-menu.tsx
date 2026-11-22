import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderIcon, FolderInputIcon, LibraryIcon } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { buildFolderTree, flattenFolderTree, foldersQuery } from "@/lib/folders";
import { trpc } from "@/lib/trpc";

export function MoveToFolderSubmenu({
  currentFolderId,
  disabledIds,
  onSelect,
}: {
  currentFolderId: string | null;
  disabledIds?: Set<string>;
  onSelect: (folderId: string | null) => void;
}) {
  const folders = useQuery(foldersQuery());
  const flat = flattenFolderTree(buildFolderTree(folders.data ?? []));

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <FolderInputIcon />
        Move to
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuItem disabled={currentFolderId === null} onSelect={() => onSelect(null)}>
          <LibraryIcon />
          Library (no folder)
        </DropdownMenuItem>
        {flat.length > 0 && <DropdownMenuSeparator />}
        {flat.map(({ folder, depth }) => (
          <DropdownMenuItem
            key={folder.id}
            disabled={folder.id === currentFolderId || disabledIds?.has(folder.id)}
            onSelect={() => onSelect(folder.id)}
            style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
          >
            <FolderIcon />
            <span className="truncate">{folder.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function useMovePapers() {
  const queryClient = useQueryClient();
  return useMutation(
    trpc.paper.move.mutationOptions({
      onSuccess: () => {
        toast.success("Moved");
        return queryClient.invalidateQueries({ queryKey: trpc.paper.pathKey() });
      },
      onError: (error) => toast.error(error.message),
    }),
  );
}
