// Single-file ESM build: the host loads plugin entries as Blob URL modules, so
// relative imports cannot be resolved at runtime and the MCP server is spawned
// from a folder that never contains node_modules.
// --check is a production artifact consistency check, not a test runner.
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const normalize = (text) => text.replaceAll("\r\n", "\n");

for (const [entry, output, platform] of [
  ["src/server.ts", "server.js", "node"],
  ["src/renderer/index.ts", "index.js", "browser"],
]) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform,
    target: platform === "node" ? "node18" : "es2022",
    legalComments: "none",
    charset: "utf8",
    logLevel: "warning",
    metafile: true,
    write: false,
    banner: {
      js: "// Generated from src/ by scripts/build.mjs — edit TypeScript sources, not this file.\n// Copyright (c) 2026 BaSui, MIT. See LICENSE.",
    },
  });
  if (platform === "browser") {
    // The renderer must reuse the host React runtime instead of bundling one.
    for (const input of Object.keys(result.metafile.inputs)) {
      if (!input.startsWith("src/")) {
        throw new Error(`Renderer must use host React, not bundle ${input}`);
      }
    }
    for (const item of Object.values(result.metafile.outputs)) {
      if (item.imports.length) {
        throw new Error("Renderer entry must be self-contained, without runtime imports");
      }
    }
  }
  const target = path.join(root, output);
  const source = normalize(result.outputFiles[0].text);
  if (check) {
    if (normalize(await readFile(target, "utf8")) !== source) {
      console.error(`${output} is out of date with src/: run npm run build.`);
      process.exit(1);
    }
  } else {
    await writeFile(target, source, "utf8");
  }
}
console.log(check ? "Artifacts match sources." : "Built server.js and index.js.");
