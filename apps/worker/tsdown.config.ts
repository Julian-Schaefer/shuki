import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  // Self-contained bundle – see apps/server/tsdown.config.ts.
  noExternal: [/.*/],
  deps: { onlyBundle: false },
  external: ["pg-native"],
  sourcemap: true,
  clean: true,
});
