import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LibraryIcon, MoreHorizontalIcon, PlusIcon, TagIcon, Trash2Icon } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { trpc } from "@/lib/trpc";

/** Tags as quick filters for the library (the "Projects" group of sidebar-07). */
export function NavTags() {
  const { isMobile } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const tags = useQuery(trpc.tag.list.queryOptions());
  const activeTagId =
    location.pathname === "/" ? (location.search as { tag?: string }).tag : undefined;

  const remove = useMutation(
    trpc.tag.delete.mutationOptions({
      onSuccess: async (_, { id }) => {
        await queryClient.invalidateQueries({ queryKey: trpc.tag.pathKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.paper.pathKey() });
        if (activeTagId === id) await navigate({ to: "/" });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Tags</SidebarGroupLabel>
      <SidebarMenu>
        {tags.data?.map((item) => (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton asChild isActive={activeTagId === item.id}>
              <Link to="/" search={{ tag: item.id }}>
                <TagIcon />
                <span>{item.name}</span>
              </Link>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction showOnHover className="aria-expanded:bg-muted">
                  <MoreHorizontalIcon />
                  <span className="sr-only">More</span>
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-fit"
                side={isMobile ? "bottom" : "right"}
                align={isMobile ? "end" : "start"}
              >
                <DropdownMenuItem asChild>
                  <Link to="/" search={{ tag: item.id }}>
                    <LibraryIcon />
                    <span>Show papers</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    if (confirm(`Delete tag "${item.name}"? Papers keep existing.`)) {
                      remove.mutate({ id: item.id });
                    }
                  }}
                >
                  <Trash2Icon />
                  <span>Delete tag</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        <SidebarMenuItem>
          <SidebarMenuButton
            className="text-sidebar-foreground/70"
            onClick={() => setDialogOpen(true)}
          >
            <PlusIcon className="text-sidebar-foreground/70" />
            <span>New tag</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <NewTagDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </SidebarGroup>
  );
}

function NewTagDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const create = useMutation(
    trpc.tag.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries({ queryKey: trpc.tag.pathKey() });
        if (!created) toast.info("A tag with this name already exists");
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (name) create.mutate({ name });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New tag</DialogTitle>
            <DialogDescription>Group papers by topic, project or reading status.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="tag-name">Name</Label>
            <Input id="tag-name" name="name" required maxLength={100} autoFocus />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              Create tag
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
