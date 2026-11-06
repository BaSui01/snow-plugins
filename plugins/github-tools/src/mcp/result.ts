import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const MAX_TEXT_CHARS = 20_000;

function serialize(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  if (text === undefined) {
    throw new Error("GitHub operation returned a value that cannot be serialized as JSON.");
  }
  return text;
}

export function assertResultSize(value: unknown, guidance?: string): void {
  const length = serialize(value).length;
  if (length > MAX_TEXT_CHARS) {
    throw new Error(
      `GitHub result is ${length} characters; the limit is ${MAX_TEXT_CHARS}. The result was not truncated. ${guidance ?? "A remote write, if completed, is not rolled back by this error."}`,
    );
  }
}

export async function run(operation: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const value = await operation();
    assertResultSize(value);
    return { content: [{ type: "text", text: serialize(value) }] };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
    };
  }
}
