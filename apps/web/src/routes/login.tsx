import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { AuthForm } from "@/components/auth-form";
import { sessionQuery } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (session) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch();
  return <AuthForm mode="login" redirectTo={redirectTo} />;
}
