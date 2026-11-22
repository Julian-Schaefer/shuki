import { asc, user } from "@shuki/db";
import { adminProcedure, router } from "../init";

export const adminRouter = router({
  users: adminProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(asc(user.createdAt)),
  ),
});
