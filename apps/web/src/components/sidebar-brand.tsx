import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpenTextIcon } from "lucide-react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { trpc } from "@/lib/trpc";

/**
 * Sidebar header in the style of sidebar-07's team switcher. Shuki has a
 * single library per user today, so it links home instead of switching –
 * shared libraries (roadmap) can turn it into a real switcher later.
 */
export function SidebarBrand() {
  const info = useQuery(trpc.system.info.queryOptions());
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          <Link to="/">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <BookOpenTextIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">Shuki</span>
              <span className="truncate text-xs">
                Paper library{info.data ? ` · v${info.data.version}` : ""}
              </span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
