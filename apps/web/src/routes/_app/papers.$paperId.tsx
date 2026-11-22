import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, linkOptions, useNavigate } from "@tanstack/react-router";
import {
  BookOpenIcon,
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FolderIcon,
  GlobeIcon,
  MoreHorizontalIcon,
  PanelRightIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { MoveToFolderSubmenu, useMovePapers } from "@/components/move-to-folder-menu";
import { type Crumb, PageHeader } from "@/components/page-header";
import { isBusy, StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { folderPath, foldersQuery } from "@/lib/folders";
import { usePreview } from "@/lib/preview";
import { trpc } from "@/lib/trpc";
import { formatBytes } from "@/lib/upload";

export const Route = createFileRoute("/_app/papers/$paperId")({
  component: PaperPage,
});

function PaperPage() {
  const { paperId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const paper = useQuery({
    ...trpc.paper.byId.queryOptions({ id: paperId }),
    refetchInterval: (query) =>
      query.state.data && isBusy(query.state.data.status) ? 2000 : false,
  });

  const folders = useQuery(foldersQuery());
  const preview = usePreview();
  const move = useMovePapers();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.paper.pathKey() });

  const reprocess = useMutation(
    trpc.paper.reprocess.mutationOptions({
      onSuccess: invalidate,
      onError: (error) => toast.error(error.message),
    }),
  );
  const remove = useMutation(
    trpc.paper.delete.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Paper deleted");
        await navigate({ to: "/" });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  if (paper.isPending) {
    return (
      <>
        <PageHeader breadcrumbs={[{ label: "Library", link: { to: "/" } }, { label: "…" }]} />
        <div className="p-4 pt-0">
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }
  if (paper.isError) {
    return (
      <>
        <PageHeader breadcrumbs={[{ label: "Library", link: { to: "/" } }, { label: "Paper" }]} />
        <p className="p-4 pt-0 text-sm text-muted-foreground">{paper.error.message}</p>
      </>
    );
  }

  const data = paper.data;
  const path = folderPath(folders.data ?? [], data.folderId);
  const breadcrumbs: Crumb[] = [
    { label: "Library", link: { to: "/" } },
    ...path.map(
      (f): Crumb => ({ label: f.name, link: linkOptions({ to: "/", search: { folder: f.id } }) }),
    ),
    { label: data.title },
  ];
  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        actions={
          <>
            <Button size="sm" asChild>
              <Link to="/read/$paperId" params={{ paperId: data.id }}>
                <BookOpenIcon /> <span className="hidden @xl/main:inline">Read</span>
              </Link>
            </Button>
            <Button
              size="sm"
              variant={preview.previewId === data.id ? "secondary" : "outline"}
              onClick={() =>
                preview.previewId === data.id ? preview.close() : preview.open(data.id)
              }
            >
              <PanelRightIcon /> <span className="hidden @xl/main:inline">Preview</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="outline" title="More actions">
                  <MoreHorizontalIcon />
                  <span className="sr-only">More actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-fit">
                <DropdownMenuItem
                  disabled={reprocess.isPending || isBusy(data.status)}
                  onSelect={() => reprocess.mutate({ id: data.id })}
                >
                  <RotateCwIcon /> Reprocess
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={remove.isPending}
                  onSelect={() => {
                    if (confirm(`Delete "${data.title}"? This cannot be undone.`)) {
                      remove.mutate({ id: data.id });
                    }
                  }}
                >
                  <Trash2Icon /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <div className="grid gap-4 p-4 pt-0 @3xl/main:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Field label="Status">
              <StatusBadge status={data.status} />
              {data.error && <span className="ml-2 text-destructive">{data.error}</span>}
            </Field>
            <Field label="Folder">
              <div className="flex items-center gap-2">
                {path.length ? (
                  <Link
                    to="/"
                    search={{ folder: data.folderId ?? undefined }}
                    className="inline-flex min-w-0 items-center gap-1.5 hover:underline"
                  >
                    <FolderIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{path.map((f) => f.name).join(" / ")}</span>
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Library root</span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-xs" variant="ghost">
                      <MoreHorizontalIcon />
                      <span className="sr-only">Move paper</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-fit">
                    <MoveToFolderSubmenu
                      currentFolderId={data.folderId}
                      onSelect={(folderId) => move.mutate({ ids: [data.id], folderId })}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Field>
            <Field label="Source">
              {data.url ? (
                <a
                  href={data.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 hover:underline"
                >
                  <GlobeIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{data.url}</span>
                </a>
              ) : (
                data.sourceType
              )}
            </Field>
            {data.venue && <Field label="Site / venue">{data.venue}</Field>}
            <Field label="Authors">
              {data.authors.length ? data.authors.map((a) => a.name).join(", ") : "—"}
            </Field>
            <Field label="Year">{data.year ?? "—"}</Field>
            <Field label="DOI">{data.doi ?? "—"}</Field>
            <Field label="Abstract">
              <span className="text-muted-foreground">
                {data.abstract ?? "Metadata enrichment will fill this in a later version."}
              </span>
            </Field>
          </CardContent>
        </Card>
        <div className="grid content-start gap-4">
          <TagsCard paperId={data.id} tagIds={data.tagIds} />
          <Card>
            <CardHeader>
              <CardTitle>Files</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {data.files.length === 0 && (
                <p className="text-sm text-muted-foreground">No files attached.</p>
              )}
              {data.files.map((file) => (
                <div
                  key={file.id}
                  className="flex min-w-0 items-center gap-2 rounded-lg border p-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{file.fileName}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  </div>
                  <Button size="icon-sm" variant="ghost" asChild>
                    <a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" title="Open">
                      <ExternalLinkIcon />
                    </a>
                  </Button>
                  <Button size="icon-sm" variant="ghost" asChild>
                    <a href={`/api/files/${file.id}?download=1`} title="Download">
                      <DownloadIcon />
                    </a>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 break-words">
      <span className="text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function TagsCard({ paperId, tagIds }: { paperId: string; tagIds: string[] }) {
  const queryClient = useQueryClient();
  const tags = useQuery(trpc.tag.list.queryOptions());
  const setTags = useMutation(
    trpc.paper.setTags.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.paper.pathKey() }),
      onError: (error) => toast.error(error.message),
    }),
  );
  const selected = new Set(tagIds);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTags.mutate({ id: paperId, tagIds: [...next] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tags</CardTitle>
        {tags.data?.length === 0 && (
          <CardDescription>Create tags in the sidebar to organize your papers.</CardDescription>
        )}
      </CardHeader>
      {Boolean(tags.data?.length) && (
        <CardContent className="flex flex-wrap gap-2">
          {tags.data?.map((t) => {
            const active = selected.has(t.id);
            return (
              <Badge key={t.id} variant={active ? "default" : "outline"} asChild>
                <button
                  type="button"
                  aria-pressed={active}
                  disabled={setTags.isPending}
                  onClick={() => toggle(t.id)}
                  className="cursor-pointer"
                >
                  {active && <CheckIcon />}
                  {t.name}
                </button>
              </Badge>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
