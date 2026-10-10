// Bundles src/ into the single ESM entry declared by plugin.json.
// The host imports the entry from a Blob URL, so relative imports cannot
// resolve at runtime: everything must be inlined into index.js.
//
// `--check` rebuilds into memory and fails when the committed index.js differs,
// which keeps CI honest when someone edits the TypeScript sources only.
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "index.js");
const check = process.argv.includes("--check");

const options = {
  entryPoints: [path.join(root, "src/index.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "transform",
  jsxFactory: "h",
  legalComments: "none",
  charset: "utf8",
  logLevel: "warning",
  banner: {
    js: "// Generated from src/ by scripts/build.mjs — edit the TypeScript sources, not this file.",
  },
};

if (check) {
  const result = await build({ ...options, write: false });
  const built = result.outputFiles[0].text;
  const current = await readFile(outfile, "utf8");
  if (built !== current) {
    console.error(
      "index.js is out of date with src/: run `npm run build` and commit the result.",
    );
    process.exit(1);
  }
  console.log("index.js matches the TypeScript sources.");
} else {
  await build({ ...options, outfile });
  console.log("Built index.js from src/.");
}
