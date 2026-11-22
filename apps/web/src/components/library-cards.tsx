import { Link } from "@tanstack/react-router";
import { FileTextIcon, FolderIcon, GlobeIcon, MoreHorizontalIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { isBusy, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FolderRow } from "@/lib/folders";
import type { RouterOutputs } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type PaperItem = RouterOutputs["paper"]["list"][number];

const hostname = (url: string | null) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** Shared "…" button that sits on top of a card's stretched link. */
function CardActions({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-xs"
          variant="secondary"
          className={cn(
            "absolute top-2 right-2 z-10 opacity-0 shadow-sm transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 max-md:opacity-100",
            className,
          )}
        >
          <MoreHorizontalIcon />
          <span className="sr-only">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-fit">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Card with a visual preview: first PDF page or the website's image. */
export function PaperCard({
  paper,
  active,
  showFolder,
  folderName,
  actions,
}: {
  paper: PaperItem;
  active: boolean;
  showFolder: boolean;
  folderName?: string;
  actions: ReactNode;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const isWebsite = paper.sourceType === "url";
  const Icon = isWebsite ? GlobeIcon : FileTextIcon;
  const site = paper.venue ?? hostname(paper.url);
  const thumbnail =
    paper.thumbnailAt && !imageFailed
      ? `/api/papers/${paper.id}/thumbnail?v=${paper.thumbnailAt.getTime()}`
      : null;

  return (
    <Card
      size="sm"
      className={cn(
        "group/item relative gap-0 py-0 transition-shadow hover:shadow-md hover:ring-foreground/15",
        active && "ring-2 ring-primary hover:ring-primary",
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden border-b bg-muted">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            className={cn(
              "size-full object-cover transition-transform duration-300 group-hover/item:scale-[1.03]",
              isWebsite ? "object-center" : "object-top",
            )}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Icon className="size-8 opacity-60" />
            {site && <span className="max-w-[80%] truncate text-xs">{site}</span>}
          </div>
        )}
        {paper.status !== "ready" && (
          <div className="absolute bottom-2 left-2">
            <StatusBadge status={paper.status} />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
        <Link
          to="/papers/$paperId"
          params={{ paperId: paper.id }}
          search={(prev) => ({ ...prev, preview: paper.id })}
          className="line-clamp-2 text-sm leading-snug font-medium after:absolute after:inset-0 after:content-['']"
          title={paper.title}
        >
          {paper.title}
        </Link>
        <p className="mt-auto flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className={cn("size-3.5 shrink-0", isBusy(paper.status) && "animate-pulse")} />
          <span className="truncate">
            {[site ?? (isWebsite ? "Website" : "PDF"), paper.year].filter(Boolean).join(" · ")}
          </span>
        </p>
        {showFolder && folderName && (
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <FolderIcon className="size-3.5 shrink-0" />
            <span className="truncate">{folderName}</span>
          </p>
        )}
      </div>
      <CardActions label="Paper actions">{actions}</CardActions>
    </Card>
  );
}

/** Compact folder tile shown above the paper cards. */
export function FolderCard({ folder, actions }: { folder: FolderRow; actions: ReactNode }) {
  return (
    <Card
      size="sm"
      className="group/item relative flex-row items-center gap-3 px-3 py-3 transition-shadow hover:shadow-md hover:ring-foreground/15"
    >
      <FolderIcon className="size-5 shrink-0 text-muted-foreground" />
      <Link
        to="/"
        search={{ folder: folder.id }}
        className="min-w-0 flex-1 truncate pr-6 text-sm font-medium after:absolute after:inset-0 after:content-['']"
        title={folder.name}
      >
        {folder.name}
      </Link>
      <CardActions label="Folder actions" className="top-1/2 -translate-y-1/2">
        {actions}
      </CardActions>
    </Card>
  );
}
