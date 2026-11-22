import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  // Self-contained bundle – see apps/server/tsdown.config.ts.
  deps: {
    alwaysBundle: [/.*/],
    // Optional native addon of `pg` – never installed, guarded by a try/catch.
    neverBundle: ["pg-native"],
    onlyBundle: false,
  },
  // mupdf loads its WebAssembly binary relative to the bundle.
  copy: [{ from: "node_modules/mupdf/dist/mupdf-wasm.wasm", to: "dist" }],
  sourcemap: true,
  clean: true,
});
