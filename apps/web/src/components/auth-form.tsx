import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, sessionQuery } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";

type Mode = "login" | "register";

export function AuthForm({ mode, redirectTo }: { mode: Mode; redirectTo?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const info = useQuery(trpc.system.info.queryOptions());
  const [pending, setPending] = useState(false);

  const isRegister = mode === "register";
  const needsSetup = info.data?.needsSetup ?? false;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setPending(true);
    const { error } = isRegister
      ? await authClient.signUp.email({ email, password, name: String(form.get("name")) })
      : await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Something went wrong");
      return;
    }
    await queryClient.invalidateQueries();
    await queryClient.fetchQuery(sessionQuery);
    await navigate({ to: redirectTo ?? "/" });
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2">
          <Logo className="size-7" />
          <span className="font-heading text-xl font-semibold">Shuki</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{isRegister ? "Create account" : "Sign in"}</CardTitle>
            <CardDescription>
              {isRegister && needsSetup
                ? "Welcome! The first account becomes the administrator of this instance."
                : isRegister
                  ? "Start collecting your papers and notes."
                  : "Welcome back to your library."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isRegister && info.data && !info.data.registrationOpen ? (
              <p className="text-sm text-muted-foreground">
                Registration is disabled on this instance. Ask your administrator for an account.
              </p>
            ) : (
              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                {isRegister && (
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" name="name" required autoComplete="name" />
                  </div>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete={isRegister ? "new-password" : "current-password"}
                  />
                </div>
                <Button type="submit" disabled={pending}>
                  {isRegister ? "Create account" : "Sign in"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="text-center text-sm text-muted-foreground">
          {isRegister ? (
            <>
              Already have an account?{" "}
              <Link to="/login" className="underline underline-offset-4">
                Sign in
              </Link>
            </>
          ) : info.data?.registrationOpen ? (
            <>
              No account yet?{" "}
              <Link to="/register" className="underline underline-offset-4">
                Create one
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
