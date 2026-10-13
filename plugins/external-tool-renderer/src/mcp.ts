// Protocol parsing is independent of React/provider schemas. All values remain untrusted.
export const PAGE_SIZE = 20;
export const TEXT_PAGE_SIZE = 12000;
export const MAX_JSON_CHARS = 8 * 1024 * 1024;
export const HIDDEN = "[redacted]";
export const BINARY = "[binary omitted]";
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function parseJson(text: string | undefined): unknown {
  if (!text || text.length > MAX_JSON_CHARS) return text;
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

const secretKey = /password|passwd|secret|token|cookie|auth|headers|api[-_]?key|private[-_]?key|credential|session[-_]?id|confirm[-_]?token/i;
const inputKey = /^(text|value|values|fields|elements|script|function|prompt|body|requestBody|content|input|data|payload|payload_text|payload_base64|raw|code|command|sql)$/i;
export function hiddenKey(key: string, parameters = false): boolean {
  return secretKey.test(key) || (parameters && inputKey.test(key));
}

export function safeText(text: string): string {
  return text
    .replace(/data:[^\s,;]+;base64,[a-z0-9+/=\s]+/gi, BINARY)
    .replace(/[a-z0-9+/]{256,}={0,2}/gi, BINARY)
    .replace(/\b(?:Bearer|Basic)\s+[a-z0-9._~+/=-]+/gi, HIDDEN)
    .replace(/((?:["']?(?:password|passwd|secret|token|cookies?|authorization|headers|api[-_]?key|private[-_]?key)["']?)\s*[:=]\s*)([^\r\n,;]+)/gi, `$1${HIDDEN}`)
    .replace(/(https?:\/\/)[^\s/]+@/gi, `$1${HIDDEN}@`)
    .replace(/([?&](?:[^=&\s]*(?:token|key|secret|password|auth|cookie)[^=&\s]*)=)[^&#\s]+/gi, `$1${HIDDEN}`);
}

export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096 || /[\u0000-\u0020]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if ([...url.searchParams.keys()].some((key) => hiddenKey(key))) return null;
    return url.href;
  } catch { return null; }
}

export function preview(value: unknown, key = "", parameters = false): string {
  if (hiddenKey(key, parameters)) return HIDDEN;
  if (typeof value === "string") return safeText(value).slice(0, 300);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (isRecord(value)) return `{${Object.keys(value).length}}`;
  return String(value);
}

export type ContentBlock = { label: string; kind: "value" | "image"; value: unknown };
export type ParsedMcp = { blocks: ContentBlock[]; failed: boolean; bounded: boolean };

function failed(value: unknown, depth = 0): boolean {
  if (!isRecord(value) || depth > 8) return false;
  if (value.isError === true || value.success === false || value.status === "failed" || value.status === "error") return true;
  if (value.error !== undefined && value.error !== null && value.error !== false && value.error !== "") return true;
  for (const key of ["structuredContent", "data", "result"]) {
    if (failed(value[key], depth + 1)) return true;
  }
  if (Array.isArray(value.content)) {
    return value.content.some((part) => isRecord(part) && (
      failed(part, depth + 1) || (part.type === "text" && failed(parseJson(typeof part.text === "string" ? part.text : undefined), depth + 1))
    ));
  }
  return false;
}

function contentBlock(part: unknown, index: number): ContentBlock {
  if (!isRecord(part)) return { label: `content[${index}]`, kind: "value", value: part };
  if (part.type === "image") return { label: `content[${index}] · image`, kind: "image", value: part };
  if (part.type === "text" && typeof part.text === "string") {
    // Retain annotations and unknown fields; text is separately available as parsed JSON/text.
    const extra = Object.fromEntries(Object.entries(part).filter(([key]) => key !== "text" && key !== "type"));
    return { label: `content[${index}] · text`, kind: "value", value: Object.keys(extra).length ? { text: parseJson(part.text), ...extra } : parseJson(part.text) };
  }
  if (part.type === "resource" && isRecord(part.resource)) {
    const resource = { ...part.resource };
    if (typeof resource.text === "string") resource.text = parseJson(resource.text);
    return { label: `content[${index}] · resource`, kind: "value", value: { ...part, resource } };
  }
  return { label: `content[${index}] · ${typeof part.type === "string" ? safeText(part.type).slice(0, 60) : "unknown"}`, kind: "value", value: part };
}

export function parseMcp(result: string | undefined): ParsedMcp {
  if (result === undefined || result === "") return { blocks: [], failed: false, bounded: false };
  const root = parseJson(result);
  let envelope = root;
  // Some transports put MCP content inside result/data; preserve outer fields too.
  let transportKey: "result" | "data" | undefined;
  if (isRecord(root) && !Array.isArray(root.content) && root.structuredContent === undefined) {
    for (const key of ["result", "data"] as const) {
      const value = root[key];
      if (isRecord(value) && (Array.isArray(value.content) || value.structuredContent !== undefined)) {
        envelope = value; transportKey = key; break;
      }
    }
  }
  const blocks: ContentBlock[] = [];
  if (isRecord(envelope) && (Array.isArray(envelope.content) || envelope.structuredContent !== undefined)) {
    if (envelope.structuredContent !== undefined) blocks.push({ label: "structuredContent", kind: "value", value: envelope.structuredContent });
    if (Array.isArray(envelope.content)) {
      // Keep all blocks; mounting is paginated by the card, not truncated by the parser.
      envelope.content.forEach((part, index) => blocks.push(contentBlock(part, index)));
    }
    const fields = Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== "content" && key !== "structuredContent"));
    if (Object.keys(fields).length) blocks.push({ label: "envelope", kind: "value", value: fields });
    if (root !== envelope && isRecord(root)) blocks.push({ label: "transport", kind: "value", value: Object.fromEntries(Object.entries(root).filter(([key]) => key !== transportKey)) });
  } else blocks.push({ label: "result", kind: "value", value: root });
  return { blocks, failed: failed(root), bounded: result.length > MAX_JSON_CHARS };
}

export function candidates(blocks: readonly ContentBlock[]): Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (!isRecord(value) || depth > 5 || output.length >= 80) return;
    output.push(value);
    for (const key of ["data", "result", "text", "resource"]) visit(value[key], depth + 1);
  };
  for (const block of blocks.slice(0, 80)) if (block.kind === "value") visit(block.value, 0);
  return output;
}

export type SearchGroup = { name: string; items: unknown[] };
export function searchGroups(records: readonly Record<string, unknown>[]): SearchGroup[] {
  const groups: SearchGroup[] = [];
  const seen = new Set<unknown>();
  for (const record of records) {
    for (const name of ["web", "news", "images", "results"]) {
      const field = record[name];
      const items = Array.isArray(field) ? field : isRecord(field) && Array.isArray(field.results) ? field.results : null;
      if (items && !seen.has(items)) { seen.add(items); groups.push({ name, items }); }
    }
  }
  return groups;
}

// No remote images, SVG/HTML, or oversized data URIs. Validate base64 and magic bytes.
export function inlineImage(value: unknown): { src: string; bytes: number } | null {
  if (!isRecord(value) || typeof value.data !== "string" || typeof value.mimeType !== "string") return null;
  const { data, mimeType } = value;
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mimeType) || data.length < 16 || data.length > 2 * 1024 * 1024 || data.length % 4 !== 0 || !/^[a-z0-9+/]+={0,2}$/i.test(data)) return null;
  try {
    const prefix = atob(data.slice(0, 64));
    const byte = (index: number): number => prefix.charCodeAt(index);
    const png = mimeType === "image/png" && prefix.startsWith("\x89PNG\r\n\x1a\n");
    const gif = mimeType === "image/gif" && (prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a"));
    const jpeg = mimeType === "image/jpeg" && byte(0) === 255 && byte(1) === 216 && byte(2) === 255;
    const webp = mimeType === "image/webp" && prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP";
    if (!png && !gif && !jpeg && !webp) return null;
    if (png || gif) {
      const u32 = (offset: number): number => byte(offset) * 16777216 + byte(offset + 1) * 65536 + byte(offset + 2) * 256 + byte(offset + 3);
      const width = png ? u32(16) : byte(6) + byte(7) * 256;
      const height = png ? u32(20) : byte(8) + byte(9) * 256;
      if (!width || !height || width > 8192 || height > 8192 || width * height > 16000000) return null;
    }
    return { src: `data:${mimeType};base64,${data}`, bytes: Math.floor(data.length * 3 / 4) };
  } catch { return null; }
}
