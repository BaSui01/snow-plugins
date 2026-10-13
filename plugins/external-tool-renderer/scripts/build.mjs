// Single-file ESM build: Blob URL entry imports cannot resolve relative modules.
// --check is a production artifact consistency check, not a test runner.
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "index.js");
const check = process.argv.includes("--check");
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/index.tsx"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  legalComments: "none",
  charset: "utf8",
  logLevel: "warning",
  metafile: true,
  write: false,
  banner: { js: "// Generated from src/ by scripts/build.mjs — edit TypeScript sources, not this file.\n// Derived from Snow App, Copyright (c) 2026 MayMay, MIT. See LICENSE and NOTICE." },
});
// Reject host dependencies (including React/lucide implementations) in the bundle.
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.startsWith("src/")) throw new Error(`Unexpected bundled dependency: ${input}`);
}
for (const output of Object.values(result.metafile.outputs)) {
  if (output.imports.length) throw new Error("Entry must be self-contained, without runtime imports");
}
const normalize = (text) => text.replaceAll("\r\n", "\n");
const built = normalize(result.outputFiles[0].text);
if (check) {
  if (built !== normalize(await readFile(outfile, "utf8"))) {
    console.error("index.js is out of date with src/: run npm run build.");
    process.exit(1);
  }
  console.log("index.js matches TypeScript sources; only local modules bundled.");
} else {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(outfile, built, "utf8");
  console.log("Built standalone index.js from src/ (host React/icons/UI are not bundled).");
}
