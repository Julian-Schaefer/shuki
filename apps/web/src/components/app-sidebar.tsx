import { useQuery } from "@tanstack/react-query";
import { linkOptions } from "@tanstack/react-router";
import { NotebookPenIcon, SearchIcon, Settings2Icon } from "lucide-react";
import type { ComponentProps } from "react";
import { NavLibrary } from "@/components/nav-library";
import { type NavItem, NavMain } from "@/components/nav-main";
import { NavTags } from "@/components/nav-tags";
import { NavUser } from "@/components/nav-user";
import { SidebarBrand } from "@/components/sidebar-brand";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { sessionQuery } from "@/lib/auth-client";

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const { data: session } = useQuery(sessionQuery);
  const isAdmin = session?.user.role === "admin";

  const navMain: NavItem[] = [
    {
      title: "Notes",
      icon: <NotebookPenIcon />,
      match: (pathname) => pathname.startsWith("/notes"),
      link: linkOptions({ to: "/notes" }),
    },
    {
      title: "Search",
      icon: <SearchIcon />,
      match: (pathname) => pathname.startsWith("/search"),
      link: linkOptions({ to: "/search" }),
    },
    {
      title: "Settings",
      icon: <Settings2Icon />,
      match: (pathname) => pathname.startsWith("/settings"),
      items: [
        { title: "General", link: linkOptions({ to: "/settings" }) },
        ...(isAdmin ? [{ title: "Users", link: linkOptions({ to: "/settings/users" }) }] : []),
      ],
    },
  ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarBrand />
      </SidebarHeader>
      <SidebarContent>
        <NavMain label="Workspace" items={navMain} leading={<NavLibrary />} />
        <NavTags />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
