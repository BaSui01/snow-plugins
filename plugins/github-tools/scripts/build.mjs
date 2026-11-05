// Builds two self-contained ESM artifacts:
//   - server.js: the stdio MCP server referenced by plugin.json via {{pluginDir}}.
//   - index.js:  the tool-call renderer loaded by the desktop host (renderMode esm).
//
// `--check` rebuilds both into memory and fails when a committed artifact differs,
// so CI catches edits made only to the TypeScript sources. CRLF is normalized
// because the repository ships LF through .gitattributes.
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const normalize = (text) => text.replaceAll("\r\n", "\n");

const serverOptions = {
  entryPoints: [path.join(root, "src/index.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  legalComments: "none",
  charset: "utf8",
  logLevel: "warning",
  banner: {
    js: "// Generated from src/ by scripts/build.mjs — edit the TypeScript sources, not this file.",
  },
};

const rendererOptions = {
  absWorkingDir: root,
  entryPoints: ["src/renderer/index.tsx"],
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
  banner: {
    js: "// Generated from src/renderer/ by scripts/build.mjs — edit the TypeScript sources, not this file.",
  },
};

if (check) {
  const server = await build({ ...serverOptions, write: false });
  const serverBuilt = normalize(server.outputFiles[0].text);
  const serverCurrent = normalize(
    await readFile(path.join(root, "server.js"), "utf8"),
  );
  if (serverBuilt !== serverCurrent) {
    console.error(
      "server.js is out of date with src/: run `npm run build` and commit the result.",
    );
    process.exit(1);
  }

  const renderer = await build({ ...rendererOptions, write: false });
  for (const input of Object.keys(renderer.metafile.inputs)) {
    if (!input.startsWith("src/")) {
      throw new Error(`Unexpected bundled dependency: ${input}`);
    }
  }
  for (const output of Object.values(renderer.metafile.outputs)) {
    if (output.imports.length) {
      throw new Error("Renderer entry must be self-contained");
    }
  }
  const rendererBuilt = normalize(renderer.outputFiles[0].text);
  const rendererCurrent = normalize(
    await readFile(path.join(root, "index.js"), "utf8"),
  );
  if (rendererBuilt !== rendererCurrent) {
    console.error(
      "index.js is out of date with src/renderer/: run `npm run build` and commit the result.",
    );
    process.exit(1);
  }
  console.log("server.js and index.js match the TypeScript sources.");
} else {
  await build({ ...serverOptions, outfile: path.join(root, "server.js") });
  const renderer = await build({ ...rendererOptions, write: false });
  for (const input of Object.keys(renderer.metafile.inputs)) {
    if (!input.startsWith("src/")) {
      throw new Error(`Unexpected bundled dependency: ${input}`);
    }
  }
  for (const output of Object.values(renderer.metafile.outputs)) {
    if (output.imports.length) {
      throw new Error("Renderer entry must be self-contained");
    }
  }
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    path.join(root, "index.js"),
    normalize(renderer.outputFiles[0].text),
    "utf8",
  );
  console.log("Built server.js from src/ and index.js from src/renderer/.");
}
