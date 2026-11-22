import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/migrate.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  // Bundle everything (workspace packages and npm deps) into self-contained
  // files, so the Docker image needs no node_modules.
  deps: {
    alwaysBundle: [/.*/],
    // Optional native addon of `pg` – never installed, guarded by a try/catch.
    neverBundle: ["pg-native"],
    onlyBundle: false,
  },
  sourcemap: true,
  clean: true,
});
