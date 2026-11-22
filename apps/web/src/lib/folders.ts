import { queryOptions } from "@tanstack/react-query";
import { type RouterOutputs, trpc } from "@/lib/trpc";

export type FolderRow = RouterOutputs["folder"]["list"][number];
export type FolderNode = FolderRow & { children: FolderNode[] };

export const foldersQuery = () => queryOptions(trpc.folder.list.queryOptions());

export function buildFolderTree(rows: FolderRow[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>(rows.map((row) => [row.id, { ...row, children: [] }]));
  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: FolderNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of list) sort(node.children);
  };
  sort(roots);
  return roots;
}

/** Folders from the root down to (and including) `id`. */
export function folderPath(rows: FolderRow[], id: string | null | undefined): FolderRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const path: FolderRow[] = [];
  let current = id ? byId.get(id) : undefined;
  while (current && path.length <= rows.length) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Depth-first list of the tree, for menus that show the hierarchy by indentation. */
export function flattenFolderTree(
  nodes: FolderNode[],
  depth = 0,
): { folder: FolderNode; depth: number }[] {
  return nodes.flatMap((node) => [
    { folder: node, depth },
    ...flattenFolderTree(node.children, depth + 1),
  ]);
}

/** The folder itself plus all of its descendants. */
export function subtreeIds(rows: FolderRow[], id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of rows) {
      if (row.parentId && ids.has(row.parentId) && !ids.has(row.id)) {
        ids.add(row.id);
        grew = true;
      }
    }
  }
  return ids;
}
