import { Link, type LinkOptions, useLocation } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

export type NavSubItem = {
  title: string;
  link: LinkOptions;
};

export type NavItem = {
  title: string;
  icon: ReactNode;
  /** e.g. "/settings" */
  match: (pathname: string) => boolean;
  link?: LinkOptions;
  items?: NavSubItem[];
};

function useIsLinkActive() {
  const location = useLocation();
  return (link: LinkOptions) => {
    if (link.to !== location.pathname) return false;
    const wanted = (link.search ?? {}) as Record<string, unknown>;
    const current = location.search as Record<string, unknown>;
    const keys = new Set([...Object.keys(wanted), ...Object.keys(current)]);
    return [...keys].every((key) => wanted[key] === current[key]);
  };
}

export function NavMain({
  label,
  items,
  leading,
}: {
  label: string;
  items: NavItem[];
  leading?: ReactNode;
}) {
  const { pathname } = useLocation();
  const isLinkActive = useIsLinkActive();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {leading}
        {items.map((item) =>
          item.items?.length ? (
            <NavCollapsible key={item.title} active={item.match(pathname)}>
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title}>
                    {item.icon}
                    <span>{item.title}</span>
                    <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton asChild isActive={isLinkActive(subItem.link)}>
                          <Link {...subItem.link}>
                            <span>{subItem.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </NavCollapsible>
          ) : (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild tooltip={item.title} isActive={item.match(pathname)}>
                <Link {...item.link}>
                  {item.icon}
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ),
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function NavCollapsible({ active, children }: { active: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);
  return (
    <Collapsible asChild open={open} onOpenChange={setOpen} className="group/collapsible">
      {children}
    </Collapsible>
  );
}
