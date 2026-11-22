import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  GlobeIcon,
  LibraryIcon,
  Loader2Icon,
  MoreHorizontalIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { FolderActionsMenuItems } from "@/components/folder-actions";
import { FolderDialog, useFolderDialog } from "@/components/folder-dialogs";
import { MoveToFolderSubmenu, useMovePapers } from "@/components/move-to-folder-menu";
import { isBusy } from "@/components/status-badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { buildFolderTree, type FolderNode, folderPath, foldersQuery } from "@/lib/folders";
import { type RouterOutputs, trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type LibrarySearch = { view?: string; tag?: string; folder?: string };
type PaperItem = RouterOutputs["paper"]["list"][number];

/** Everything the recursive tree needs, computed once in NavLibrary. */
type TreeContext = {
  dialog: ReturnType<typeof useFolderDialog>;
  papersByFolder: Map<string | null, PaperItem[]>;
  /** Folders that must be expanded to reveal the current folder or paper. */
  expandIds: Set<string>;
  activeFolderId: string | undefined;
  activePaperId: string | undefined;
};

/**
 * "Library" entry of the workspace navigation. Like the collapsible items of
 * sidebar-07, but the sub-items are the library's folder tree.
 */
export function NavLibrary() {
  const location = useLocation();
  const folders = useQuery(foldersQuery());
  const dialog = useFolderDialog();
  const rows = folders.data ?? [];
  const tree = buildFolderTree(rows);
  // All papers (id, title, folder) to place them in the tree.
  const papers = useQuery({
    ...trpc.paper.list.queryOptions(),
    refetchInterval: (query) => (query.state.data?.some((p) => isBusy(p.status)) ? 3000 : false),
  });
  const papersByFolder = new Map<string | null, PaperItem[]>();
  for (const paper of [...(papers.data ?? [])].sort((a, b) => a.title.localeCompare(b.title))) {
    const list = papersByFolder.get(paper.folderId) ?? [];
    list.push(paper);
    papersByFolder.set(paper.folderId, list);
  }

  const onLibrary = location.pathname === "/" || location.pathname.startsWith("/papers");
  const search = (location.pathname === "/" ? location.search : {}) as LibrarySearch;
  const isRoot = location.pathname === "/" && !search.view && !search.tag && !search.folder;
  const activePaperId = location.pathname.match(/^\/papers\/([^/]+)/)?.[1];
  const activePaperFolder = papers.data?.find((p) => p.id === activePaperId)?.folderId;
  const ctx: TreeContext = {
    dialog,
    papersByFolder,
    expandIds: new Set(
      folderPath(rows, activePaperId ? activePaperFolder : search.folder).map((f) => f.id),
    ),
    activeFolderId: search.folder,
    activePaperId,
  };

  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (onLibrary) setOpen(true);
  }, [onLibrary]);

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip="Library" isActive={isRoot}>
          <Link to="/">
            <LibraryIcon />
            <span>Library</span>
          </Link>
        </SidebarMenuButton>
        <CollapsibleTrigger asChild>
          <SidebarMenuAction className="transition-transform duration-200 data-[state=open]:rotate-90">
            <ChevronRightIcon />
            <span className="sr-only">Toggle library</span>
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild isActive={search.view === "all"}>
                <Link to="/" search={{ view: "all" }}>
                  <span>All papers</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
            {tree.map((node) => (
              <FolderTreeItem key={node.id} node={node} ctx={ctx} />
            ))}
            {papersByFolder.get(null)?.map((paper) => (
              <PaperTreeItem key={paper.id} paper={paper} ctx={ctx} />
            ))}
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild className="text-sidebar-foreground/70">
                <button type="button" onClick={() => dialog.openCreate(null)}>
                  <FolderPlusIcon className="text-sidebar-foreground/70!" />
                  <span>New folder</span>
                </button>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </CollapsibleContent>
        <FolderDialog state={dialog.state} onClose={dialog.close} />
      </SidebarMenuItem>
    </Collapsible>
  );
}

const iconButton =
  "absolute top-1.5 flex size-4 items-center justify-center text-sidebar-foreground/70 outline-hidden ring-sidebar-ring hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-3.5";

function FolderTreeItem({ node, ctx }: { node: FolderNode; ctx: TreeContext }) {
  const { isMobile } = useSidebar();
  const { dialog } = ctx;
  const papers = ctx.papersByFolder.get(node.id) ?? [];
  const hasChildren = node.children.length > 0 || papers.length > 0;
  // Expand automatically when the current folder or paper lies inside this folder.
  const shouldExpand = ctx.expandIds.has(node.id);
  const [open, setOpen] = useState(shouldExpand);
  useEffect(() => {
    if (shouldExpand) setOpen(true);
  }, [shouldExpand]);

  const Icon = open && hasChildren ? FolderOpenIcon : FolderIcon;

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <SidebarMenuSubItem>
        <SidebarMenuSubButton
          asChild
          isActive={ctx.activeFolderId === node.id}
          className="peer/folder pr-7 pl-6"
        >
          <Link to="/" search={{ folder: node.id }}>
            <Icon />
            <span>{node.name}</span>
          </Link>
        </SidebarMenuSubButton>
        {hasChildren && (
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(iconButton, "left-1 transition-transform data-[state=open]:rotate-90")}
            >
              <ChevronRightIcon />
              <span className="sr-only">Toggle {node.name}</span>
            </button>
          </CollapsibleTrigger>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                iconButton,
                "right-1 opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 md:opacity-0 md:peer-hover/folder:opacity-100 md:hover:opacity-100",
              )}
            >
              <MoreHorizontalIcon />
              <span className="sr-only">Folder actions</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-fit"
            side={isMobile ? "bottom" : "right"}
            align={isMobile ? "end" : "start"}
          >
            <FolderActionsMenuItems
              folder={node}
              onNewSubfolder={() => {
                setOpen(true);
                dialog.openCreate(node.id, node.name);
              }}
              onRename={() => dialog.openRename(node.id, node.name)}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        {hasChildren && (
          <CollapsibleContent>
            <SidebarMenuSub className="mr-0 ml-3 pr-0 pl-1.5">
              {node.children.map((child) => (
                <FolderTreeItem key={child.id} node={child} ctx={ctx} />
              ))}
              {papers.map((paper) => (
                <PaperTreeItem key={paper.id} paper={paper} ctx={ctx} />
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        )}
      </SidebarMenuSubItem>
    </Collapsible>
  );
}

function PaperTreeItem({ paper, ctx }: { paper: PaperItem; ctx: TreeContext }) {
  const { isMobile } = useSidebar();
  const move = useMovePapers();
  const Icon = isBusy(paper.status)
    ? Loader2Icon
    : paper.sourceType === "url"
      ? GlobeIcon
      : FileTextIcon;

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        asChild
        isActive={ctx.activePaperId === paper.id}
        className="peer/paper pr-7 pl-6"
      >
        <Link
          to="/papers/$paperId"
          params={{ paperId: paper.id }}
          search={(prev) => ({ ...prev, preview: paper.id })}
          title={paper.title}
        >
          <Icon className={cn(isBusy(paper.status) && "animate-spin")} />
          <span>{paper.title}</span>
        </Link>
      </SidebarMenuSubButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              iconButton,
              "right-1 opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 md:opacity-0 md:peer-hover/paper:opacity-100 md:hover:opacity-100",
            )}
          >
            <MoreHorizontalIcon />
            <span className="sr-only">Paper actions</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-fit"
          side={isMobile ? "bottom" : "right"}
          align={isMobile ? "end" : "start"}
        >
          <MoveToFolderSubmenu
            currentFolderId={paper.folderId}
            onSelect={(folderId) => move.mutate({ ids: [paper.id], folderId })}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuSubItem>
  );
}
