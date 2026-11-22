import { Link, type LinkOptions } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export type Crumb = { label: ReactNode; link?: LinkOptions };

export function PageHeader({
  breadcrumbs,
  actions,
}: {
  breadcrumbs: Crumb[];
  actions?: ReactNode;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex min-w-0 items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: breadcrumbs are static per page
                <Fragment key={index}>
                  <BreadcrumbItem className={isLast ? "min-w-0" : "hidden md:block"}>
                    {isLast || !crumb.link ? (
                      <BreadcrumbPage className="block truncate">{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link {...crumb.link}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator className="hidden md:block" />}
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2 px-4">{actions}</div>}
    </header>
  );
}

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader breadcrumbs={[{ label: title }]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl bg-muted/50 p-8 text-center">
          <p className="font-heading text-lg font-medium">Coming soon</p>
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </>
  );
}
