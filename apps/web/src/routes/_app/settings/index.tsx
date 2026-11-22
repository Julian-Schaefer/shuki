import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sessionQuery } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/_app/settings/")({
  component: GeneralSettingsPage,
});

function GeneralSettingsPage() {
  const { data: session } = useQuery(sessionQuery);
  const info = useQuery(trpc.system.info.queryOptions());

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Settings", link: { to: "/settings" } }, { label: "General" }]}
      />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="grid max-w-3xl gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Signed in as {session?.user.email}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              Name: {session?.user.name} · Role: {session?.user.role}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Instance</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">Version {info.data?.version}</Badge>
              <Badge variant="outline">
                Registration {info.data?.registrationOpen ? "open" : "closed"}
              </Badge>
              <Badge variant="outline">AI {info.data?.features.ai ? "enabled" : "disabled"}</Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
