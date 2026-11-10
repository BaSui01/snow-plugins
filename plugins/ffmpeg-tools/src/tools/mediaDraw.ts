import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  describeOutputs, escapeFilterPath, failure, inputProblem, isFile, outputProblem,
  respond, runFfmpeg, totalInputBytes,
  type Payload, type ToolResponse,
} from "./shared";

const OPERATIONS = ["crop", "pad", "rotate", "flip", "text", "chromakey", "delogo"] as const;
const VIDEO_CRF = "23";

/** Which operation owns which switch: anything else supplied for it is rejected. */
const OPERATION_FIELDS: Record<(typeof OPERATIONS)[number], string[]> = {
  crop: ["width", "height", "x", "y"], pad: ["width", "height", "x", "y", "color"],
  rotate: ["degrees", "color"], flip: ["axis"],
  text: ["text", "x", "y", "fontSize", "fontColor", "fontFile", "box", "boxColor"],
  chromakey: ["color", "similarity", "blend", "key"], delogo: ["x", "y", "width", "height", "show"],
};
const COMMON_FIELDS = new Set(["input", "output", "operation", "overwrite"]);

const pixel = (note: string) => z.number().int().optional().describe(note);
const size = (note: string) => z.number().int().min(2).optional().describe(note);

// One definition of the tool surface: the argument type below is inferred from it, so
// schema and handler can never drift apart.
const DRAW_SCHEMA = {
  input: z.string().min(1).describe("Absolute input path"),
  output: z.string().min(1).describe("Absolute output path; its directory must exist"),
  operation: z.enum(OPERATIONS).describe("Space, graphic or text operation to run"),
  overwrite: z.boolean().optional().describe("Replace an existing output file"),
  width: size("crop / pad / delogo: width in pixels (>= 2)"),
  height: size("crop / pad / delogo: height in pixels (>= 2)"),
  x: pixel("crop / pad / delogo: x offset in pixels; crop and pad centre when omitted"),
  y: pixel("crop / pad / delogo: y offset in pixels; crop and pad centre when omitted"),
  color: z.string().min(1).optional().describe("pad / rotate background colour, or the chromakey key colour"),
  degrees: z.number().optional().describe("rotate: clockwise degrees; 90/180/270 use transpose"),
  axis: z.enum(["horizontal", "vertical", "both"]).optional().describe("flip: which way to mirror"),
  text: z.string().min(1).optional().describe("text: caption to draw"),
  fontSize: z.number().min(1).optional().describe("text: font size in pixels, default 24"),
  fontColor: z.string().min(1).optional().describe("text: caption colour, default white"),
  fontFile: z.string().min(1).optional().describe("text: absolute font file; without it the local fontconfig default is used"),
  box: z.boolean().optional().describe("text: draw a filled box behind the caption"),
  boxColor: z.string().min(1).optional().describe("text: box colour, default black"),
  similarity: z.number().min(0).max(1).optional().describe("chromakey: colour match tolerance, default 0.01"),
  blend: z.number().min(0).max(1).optional().describe("chromakey: key blend, default 0"),
  key: z.enum(["colorkey", "chromakey"]).optional().describe("chromakey: RGB colorkey, or chromakey for YUV"),
  show: z.boolean().optional().describe("delogo: outline the removed area instead of hiding it"),
};

type Args = z.infer<z.ZodObject<typeof DRAW_SCHEMA>>;
type Operation = Args["operation"];

type Planned = { ok: true; filters: string[]; settings: Payload } | { ok: false; response: ToolResponse };

function planned(filters: string[], settings: Payload): Planned {
  return { ok: true, filters, settings };
}

function reject(code: string, message: string): Planned {
  return { ok: false, response: failure(code, message) };
}

function unusedFields(input: Args): string[] {
  const allowed = new Set(OPERATION_FIELDS[input.operation]);
  return Object.entries(input)
    .filter(([field, value]) => value !== undefined && !COMMON_FIELDS.has(field) && !allowed.has(field))
    .map(([field]) => field);
}

async function runDraw(input: Args, filters: string[], settings: Payload): Promise<ToolResponse> {
  const args = [
    "-hide_banner", "-loglevel", "error", input.overwrite === true ? "-y" : "-n",
    "-i", input.input, "-vf", filters.join(","), "-c:v", "libx264", "-crf", VIDEO_CRF,
    "-c:a", "copy", input.output,
  ];
  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;
  return respond({
    ok: true, operation: input.operation, settings,
    input: input.input, inputBytes: totalInputBytes([input.input]),
    outputs: describeOutputs([input.output]), elapsedMs: run.elapsedMs, stderrTail: run.stderrTail,
  });
}

function planOperation(operation: Exclude<Operation, "text">, input: Args): Planned {
  switch (operation) {
    case "crop": {
      if (input.width === undefined || input.height === undefined) return reject("missing-size", "crop 需要 width 与 height");
      const options = [`w=${input.width}`, `h=${input.height}`];
      // The filter's own default is centred, so x/y are only sent when given.
      if (input.x !== undefined) options.push(`x=${input.x}`);
      if (input.y !== undefined) options.push(`y=${input.y}`);
      const settings = { width: input.width, height: input.height, x: input.x ?? null, y: input.y ?? null };
      return planned([`crop=${options.join(":")}`], settings);
    }
    case "pad": {
      if (input.width === undefined || input.height === undefined) return reject("missing-size", "pad 需要 width 与 height");
      const color = input.color ?? "black";
      // pad itself defaults to 0:0, so centring has to be spelled out.
      const x = input.x !== undefined ? String(input.x) : "(ow-iw)/2";
      const y = input.y !== undefined ? String(input.y) : "(oh-ih)/2";
      const options = [`width=${input.width}`, `height=${input.height}`, `x=${x}`, `y=${y}`, `color=${color}`];
      return planned([`pad=${options.join(":")}`], { width: input.width, height: input.height, x, y, color });
    }
    case "rotate": {
      const degrees = input.degrees;
      if (degrees === undefined) return reject("missing-degrees", "rotate 需要 degrees");
      const color = input.color ?? "black";
      const rightAngle = ((degrees % 360) + 360) % 360;
      const radians = Number((degrees * (Math.PI / 180)).toFixed(6));
      // Verified values: transpose takes clock/cclock, and rotate takes radians plus a
      // fill colour for every angle that is not a quarter turn.
      const filters: string[] = [];
      if (rightAngle === 90) filters.push("transpose=clock");
      else if (rightAngle === 180) filters.push("transpose=clock", "transpose=clock");
      else if (rightAngle === 270) filters.push("transpose=cclock");
      else filters.push(`rotate=angle=${radians}:fillcolor=${color}`);
      return planned(filters, { degrees, color });
    }
    case "flip": {
      const axis = input.axis;
      if (axis === undefined) return reject("missing-axis", "flip 需要 axis（horizontal / vertical / both）");
      const filters = axis === "horizontal" ? ["hflip"] : axis === "vertical" ? ["vflip"] : ["hflip", "vflip"];
      return planned(filters, { axis });
    }
    case "chromakey": {
      const color = input.color;
      if (color === undefined) return reject("missing-color", "chromakey 需要 color（如 green 或 0x00FF00）");
      const key = input.key ?? "colorkey";
      const similarity = input.similarity ?? 0.01;
      const blend = input.blend ?? 0;
      const filter = `${key}=color=${color}:similarity=${similarity}:blend=${blend}`;
      return planned([filter], { key, color, similarity, blend });
    }
    case "delogo": {
      const x = input.x, y = input.y, width = input.width, height = input.height;
      if (x === undefined || y === undefined || width === undefined || height === undefined) {
        return reject("missing-arguments", "delogo 需要 x / y / width / height");
      }
      const options = [`x=${x}`, `y=${y}`, `w=${width}`, `h=${height}`];
      if (input.show === true) options.push("show=1");
      return planned([`delogo=${options.join(":")}`], { x, y, width, height, show: input.show === true });
    }
  }
}

async function runText(input: Args): Promise<ToolResponse> {
  const text = input.text;
  if (text === undefined) return failure("missing-text", "text 需要 text 参数指定要绘制的文字");
  const fontFile = input.fontFile;
  if (fontFile !== undefined) {
    if (!path.isAbsolute(fontFile)) return failure("invalid-font-file", `fontFile 必须是绝对路径：${fontFile}`);
    if (!isFile(fontFile)) return failure("invalid-font-file", `fontFile 不存在或不是文件：${fontFile}`);
  }
  const fontSize = input.fontSize ?? 24, x = input.x ?? 10, y = input.y ?? 10;
  const fontColor = input.fontColor ?? "white";
  const box = input.box === true;
  const boxColor = input.boxColor ?? "black";
  const caption = path.join(tmpdir(), `ffmpeg-tools-${process.pid}-${Date.now().toString(36)}.txt`);
  const options = [
    // The caption travels in a temp file and expansion=none keeps it literal, so a "%"
    // or a quote inside the text cannot be read as a drawtext expression.
    `textfile=${escapeFilterPath(caption)}`, "expansion=none",
    `x=${x}`, `y=${y}`, `fontsize=${fontSize}`, `fontcolor=${fontColor}`,
  ];
  if (box) options.push("box=1", `boxcolor=${boxColor}`);
  if (fontFile !== undefined) options.push(`fontfile=${escapeFilterPath(fontFile)}`);
  try {
    writeFileSync(caption, text, "utf8");
    return await runDraw(input, [`drawtext=${options.join(":")}`], {
      x, y, fontSize, fontColor, box, boxColor: box ? boxColor : null, fontFile: fontFile ?? null,
    });
  } finally {
    try {
      unlinkSync(caption);
    } catch {
      // Temp cleanup is best effort; the call result stays authoritative.
    }
  }
}

async function handle(input: Args): Promise<ToolResponse> {
  const inputIssue = inputProblem(input.input);
  if (inputIssue) return failure("invalid-input", inputIssue);
  const outputIssue = outputProblem(input.output, input.overwrite === true);
  if (outputIssue) return failure("invalid-output", outputIssue);
  const unused = unusedFields(input);
  if (unused.length) return failure("unused-arguments", `${unused.join(" / ")} 不适用于 operation=${input.operation}`);

  if (input.operation === "text") return runText(input);
  const plan = planOperation(input.operation, input);
  if (!plan.ok) return plan.response;
  return runDraw(input, plan.filters, plan.settings);
}

export function registerMediaDraw(server: McpServer): void {
  server.registerTool(
    "media_draw",
    {
      title: "Draw, reframe and mask",
      description:
        "Draw on, reframe or mask one video. operation picks it: crop (centred unless x/y are given), pad (centred unless x/y are given), rotate (90/180/270 go through transpose, any other angle through rotate in radians with a fill colour), flip, text (drawtext; fontFile should be given, because without one the local fontconfig default is used and this Windows build ships no fontconfig config, so ffmpeg fails and returns its own message; the caption is drawn literally, drawtext expressions stay disabled), chromakey (colorkey for RGB, chromakey for YUV; the keyed-out result is only meaningful in a container that carries alpha — png, webm or mov — and H.264 output drops the alpha channel), and delogo (removes a rectangle, optionally outlined with show). Every operation re-encodes video as H.264 CRF 23 and copies audio. Switch names and values were confirmed against this machine's ffmpeg. Nothing is overwritten unless overwrite is true.",
      inputSchema: DRAW_SCHEMA,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) => handle(args as Args),
  );
}
