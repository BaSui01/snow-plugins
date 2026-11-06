import type { Args, Payload } from "./config";
export type { Args, Payload } from "./config";
export { isRecord, asText, asNumber, parseJson, parseArgs, unwrapResult, errorText, safeUrl };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asText = (value: unknown): string =>
  typeof value === "string" ? value : "";

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const parseJson = (raw: string | undefined): unknown => {
  if (raw === undefined || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const parseArgs = (raw: string): Args => {
  const parsed = parseJson(raw);
  return isRecord(parsed) ? parsed : {};
};

/** MCP 结果信封解包：`{content:[{type:"text",text}]}` / `{result}` → 实际载荷。 */
const unwrapResult = (value: unknown): Payload => {
  if (isRecord(value) && Array.isArray(value.content)) {
    const text = value.content
      .flatMap((block: unknown) =>
        isRecord(block) && block.type === "text" && typeof block.text === "string"
          ? [block.text]
          : [],
      )
      .join("\n");
    if (text) {
      const parsed = parseJson(text);
      return isRecord(parsed) || Array.isArray(parsed) || typeof parsed === "string"
        ? parsed
        : text;
    }
  }
  if (isRecord(value) && "result" in value) return unwrapResult(value.result);
  if (isRecord(value) || Array.isArray(value) || typeof value === "string")
    return value;
  return null;
};

const errorText = (payload: Payload): string => {
  if (typeof payload === "string") return payload;
  if (isRecord(payload) && typeof payload.message === "string")
    return payload.message;
  return payload === null ? "" : JSON.stringify(payload);
};

const safeUrl = (value: unknown): string => {
  const text = asText(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
};