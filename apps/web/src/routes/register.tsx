import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth-form";
import { sessionQuery } from "@/lib/auth-client";

export const Route = createFileRoute("/register")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (session) throw redirect({ to: "/" });
  },
  component: () => <AuthForm mode="register" />,
});
