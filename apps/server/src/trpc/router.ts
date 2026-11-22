import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { router } from "./init";
import { adminRouter } from "./routers/admin";
import { folderRouter } from "./routers/folder";
import { paperRouter } from "./routers/paper";
import { systemRouter } from "./routers/system";
import { tagRouter } from "./routers/tag";

export const appRouter = router({
  system: systemRouter,
  folder: folderRouter,
  paper: paperRouter,
  tag: tagRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
