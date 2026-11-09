export type Args = Record<string, unknown>;
export type Payload = Record<string, unknown> | unknown[] | string | null;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asText = (value: unknown): string =>
  typeof value === "string" ? value : "";

export const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const parseJson = (raw: string | undefined): unknown => {
  if (raw === undefined || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

export const parseArgs = (raw: string): Args => {
  const parsed = parseJson(raw);
  return isRecord(parsed) ? parsed : {};
};

/** MCP result envelope unwrap: `{content:[{type:"text",text}]}` / `{result}` → payload. */
export const unwrapResult = (value: unknown): Payload => {
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

export const isErrorEnvelope = (value: unknown): boolean =>
  isRecord(value) && value.isError === true;

export const errorText = (payload: Payload): string => {
  if (typeof payload === "string") return payload;
  if (isRecord(payload)) {
    if (typeof payload.message === "string") return payload.message;
    if (typeof payload.error === "string") return payload.error;
  }
  return payload === null ? "" : JSON.stringify(payload);
};

export const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

export const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
