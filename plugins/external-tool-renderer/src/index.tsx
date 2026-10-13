import { React } from "./runtime";
import { ApiContext } from "./api";
import { AnysearchToolCall } from "./AnysearchToolCall";
import { DbxToolCall } from "./DbxToolCall";
import { McpToolCall } from "./McpToolCall";
import { identifyProvider } from "./providers";
import type { ToolCallApi, ToolCallContext } from "./types";

// Synchronous factories: no hooks, Promise, load-time API, or global card state.
export function renderAnysearch(api: ToolCallApi, context: ToolCallContext): React.ReactNode | null {
  if (api.signal.aborted || api.ui.toolCallRendererVersion !== 1 || api.ui.React !== React || context.slot !== "tool-call") return null;
  if (!context.toolCall.name.startsWith("anysearch-") && !context.toolCall.name.startsWith("anysearch_")) return null;
  return <ApiContext.Provider value={api}><AnysearchToolCall toolCall={context.toolCall} /></ApiContext.Provider>;
}

export function renderDbx(api: ToolCallApi, context: ToolCallContext): React.ReactNode | null {
  if (api.signal.aborted || api.ui.toolCallRendererVersion !== 1 || api.ui.React !== React || context.slot !== "tool-call") return null;
  if (!context.toolCall.name.startsWith("dbx-") && !context.toolCall.name.startsWith("dbx_")) return null;
  return <ApiContext.Provider value={api}><DbxToolCall toolCall={context.toolCall} /></ApiContext.Provider>;
}

export function renderMcp(api: ToolCallApi, context: ToolCallContext): React.ReactNode | null {
  if (api.signal.aborted || api.ui.toolCallRendererVersion !== 1 || api.ui.React !== React || context.slot !== "tool-call") return null;
  const match = identifyProvider(context.toolCall.name);
  if (!match) return null;
  return <ApiContext.Provider value={api}><McpToolCall key={context.toolCall.interactionId} toolCall={context.toolCall} {...match} /></ApiContext.Provider>;
}
