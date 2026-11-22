import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/_app/settings/users")({
  beforeLoad: ({ context }) => {
    if (context.session.user.role !== "admin") throw redirect({ to: "/settings" });
  },
  component: UsersPage,
});

function UsersPage() {
  const users = useQuery(trpc.admin.users.queryOptions());
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Settings", link: { to: "/settings" } }, { label: "Users" }]}
      />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              Control sign-ups with the ALLOW_REGISTRATION environment variable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.role}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
