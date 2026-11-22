import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileTextIcon, FolderIcon, FolderPlusIcon, MoreHorizontalIcon } from "lucide-react";
import { z } from "zod";
import { FolderActionsMenuItems } from "@/components/folder-actions";
import { FolderDialog, useFolderDialog } from "@/components/folder-dialogs";
import { MoveToFolderSubmenu, useMovePapers } from "@/components/move-to-folder-menu";
import { NewPaperDialog } from "@/components/new-paper-dialog";
import { type Crumb, PageHeader } from "@/components/page-header";
import { isBusy, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type FolderRow, folderPath, foldersQuery } from "@/lib/folders";
import { trpc } from "@/lib/trpc";

/**
 * The library page is a folder explorer (subfolders + papers of the current
 * folder, root by default). `view=all` and `tag` show flat paper lists instead.
 */

export const Route = createFileRoute("/_app/")({
  validateSearch: z.object({
    view: z.literal("all").optional(),
    tag: z.uuid().optional(),
    folder: z.uuid().optional(),
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const { view, tag, folder } = Route.useSearch();
  const filtered = Boolean(view || tag);
  /** Explorer mode: browse the folder hierarchy (root or `folder`). */
  const isExplorer = !filtered;
  const dialog = useFolderDialog();
  const navigate = Route.useNavigate();

  const folders = useQuery(foldersQuery());
  const folderRows = folders.data ?? [];
  const tags = useQuery({ ...trpc.tag.list.queryOptions(), enabled: Boolean(tag) });
  const papers = useQuery({
    ...trpc.paper.list.queryOptions({
      tagId: tag,
      folderId: isExplorer ? (folder ?? null) : undefined,
    }),
    // Poll while the worker is still busy with any paper.
    refetchInterval: (query) => (query.state.data?.some((p) => isBusy(p.status)) ? 2000 : false),
  });

  const path = folderPath(folderRows, folder);
  const currentFolder = path.at(-1);
  const subfolders = isExplorer ? folderRows.filter((f) => f.parentId === (folder ?? null)) : [];
  const folderNames = new Map(folderRows.map((f) => [f.id, f.name]));

  const breadcrumbs: Crumb[] = [{ label: "Library", link: { to: "/" } }];
  if (isExplorer) {
    for (const f of path) {
      breadcrumbs.push({ label: f.name, link: { to: "/", search: { folder: f.id } } });
    }
    if (folder && !currentFolder) breadcrumbs.push({ label: "…" });
  } else {
    breadcrumbs.push({
      label: tag ? `#${tags.data?.find((t) => t.id === tag)?.name ?? "…"}` : "All papers",
    });
  }

  const isEmpty = papers.data?.length === 0 && subfolders.length === 0;

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                dialog.openCreate(isExplorer ? (folder ?? null) : null, currentFolder?.name)
              }
            >
              <FolderPlusIcon /> {isExplorer && folder ? "New subfolder" : "New folder"}
            </Button>
            <NewPaperDialog folderId={isExplorer ? (folder ?? null) : null} />
          </>
        }
      />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {papers.isPending ? (
          <div className="grid gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-muted/50 p-12 text-center">
            {folder ? (
              <FolderIcon className="size-8 text-muted-foreground" />
            ) : (
              <FileTextIcon className="size-8 text-muted-foreground" />
            )}
            {filtered ? (
              <p className="text-sm text-muted-foreground">No papers match this filter.</p>
            ) : folder ? (
              <p className="text-sm text-muted-foreground">
                This folder is empty. Add a paper or create a subfolder.
              </p>
            ) : (
              <>
                <div>
                  <p className="font-medium">Your library is empty</p>
                  <p className="text-sm text-muted-foreground">
                    Add your first paper or create a folder to get started.
                  </p>
                </div>
                <NewPaperDialog />
              </>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                {!isExplorer && <TableHead className="w-48">Folder</TableHead>}
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-32 text-right">Added</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subfolders.map((sub) => (
                <FolderTableRow
                  key={sub.id}
                  folder={sub}
                  onNewSubfolder={() => dialog.openCreate(sub.id, sub.name)}
                  onRename={() => dialog.openRename(sub.id, sub.name)}
                />
              ))}
              {papers.data?.map((paper) => (
                <TableRow key={paper.id}>
                  <TableCell className="max-w-0 truncate font-medium">
                    <Link
                      to="/papers/$paperId"
                      params={{ paperId: paper.id }}
                      className="hover:underline"
                    >
                      {paper.title}
                    </Link>
                  </TableCell>
                  {!isExplorer && (
                    <TableCell className="max-w-0 truncate text-muted-foreground">
                      {paper.folderId ? (
                        <Link
                          to="/"
                          search={{ folder: paper.folderId }}
                          className="inline-flex items-center gap-1.5 hover:underline"
                        >
                          <FolderIcon className="size-3.5" />
                          {folderNames.get(paper.folderId) ?? "…"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <StatusBadge status={paper.status} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {paper.createdAt.toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <PaperRowActions paperId={paper.id} folderId={paper.folderId} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <FolderDialog
        state={dialog.state}
        onClose={dialog.close}
        onCreated={() => {
          // Show the explorer where the new folder now appears.
          if (!isExplorer) navigate({ search: folder ? { folder } : {} });
        }}
      />
    </>
  );
}

function FolderTableRow({
  folder,
  onNewSubfolder,
  onRename,
}: {
  folder: FolderRow;
  onNewSubfolder: () => void;
  onRename: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="max-w-0 truncate font-medium">
        <Link
          to="/"
          search={{ folder: folder.id }}
          className="inline-flex items-center gap-2 hover:underline"
        >
          <FolderIcon className="size-4 text-muted-foreground" />
          {folder.name}
        </Link>
      </TableCell>
      <TableCell />
      <TableCell />
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost">
              <MoreHorizontalIcon />
              <span className="sr-only">Folder actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-fit">
            <FolderActionsMenuItems
              folder={folder}
              onNewSubfolder={onNewSubfolder}
              onRename={onRename}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function PaperRowActions({ paperId, folderId }: { paperId: string; folderId: string | null }) {
  const move = useMovePapers();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost">
          <MoreHorizontalIcon />
          <span className="sr-only">Paper actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-fit">
        <MoveToFolderSubmenu
          currentFolderId={folderId}
          onSelect={(target) => move.mutate({ ids: [paperId], folderId: target })}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
