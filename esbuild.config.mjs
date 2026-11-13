// Build script: bundles src/main.ts into main.js for Obsidian.
import esbuild from "esbuild";
import { builtinModules } from "node:module";

// "production" as first argument disables source maps and minifies the output
const production = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // Modules provided by Obsidian at runtime must never be bundled
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtinModules,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  minify: production,
  treeShaking: true,
  outfile: "main.js",
});

if (production) {
  // One-shot build for releases
  await context.rebuild();
  process.exit(0);
} else {
  // Watch mode for development
  await context.watch();
}
