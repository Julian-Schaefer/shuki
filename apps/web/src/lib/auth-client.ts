import { queryOptions } from "@tanstack/react-query";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [
    inferAdditionalFields({
      user: { role: { type: "string", required: false, input: false } },
    }),
  ],
});

export type Session = typeof authClient.$Infer.Session;

export const sessionQuery = queryOptions({
  queryKey: ["auth", "session"],
  queryFn: async () => {
    const { data, error } = await authClient.getSession();
    if (error) throw error;
    return data;
  },
  staleTime: 60_000,
});
