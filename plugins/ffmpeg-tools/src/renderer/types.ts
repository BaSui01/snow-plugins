import type * as React from "react";

// Structural copy of the desktop v1 tool-call slot contract. Only the fields this
// renderer consumes are declared; nothing is imported from the host at runtime.
export type Translate = (
  key: string,
  options?: { defaultValue?: string; values?: Record<string, string | number> },
) => string;

export type ToolCallStatus = "pending" | "running" | "completed" | "error";

export type ToolCallInfo = Readonly<{
  /** Public tool name `<publicServerName>-<toolName>`; the server prefix is host-derived. */
  name: string;
  /** Complete manifest tool name, never truncated by the public-name limit. */
  originalToolName?: string;
  arguments: string;
  status: ToolCallStatus;
  result?: string;
  /** Epoch ms when the call transitioned to "running"; absent for non-running calls. */
  startedAt?: number;
  streamingStdout?: string;
  streamingStderr?: string;
}>;

export type ToolCallContext = Readonly<{
  slot: "tool-call";
  conversationId?: string;
  messageId?: string;
  toolCall: ToolCallInfo;
}>;

type ToolCallNodeProps = {
  toolName: string;
  /** Confirmed plugin ownership, so the host draws the plugin origin without re-resolving it. */
  sourcePluginId?: string;
  badgeName: string;
  /** Per-tool badge icon supplied by this plugin (host ignores it when unsupported). */
  badgeIcon?: React.ReactNode;
  /** Context label after the badge (e.g. the produced file name). */
  displayName?: React.ReactNode;
  /** Tooltip for the displayName area. */
  displayNameTitle?: string;
  status: ToolCallStatus;
  /** Whether the body starts expanded. */
  defaultOpen?: boolean;
  /** Compact facts rendered inline in the header. */
  meta?: React.ReactNode;
  children?: React.ReactNode;
};

type DataTableViewerProps = {
  columns: string[];
  rows: unknown[][];
  maxInitialRows?: number;
  className?: string;
  enableExport?: boolean;
  enableSearch?: boolean;
};

export type PluginMediaKind = "video" | "audio" | "image";

export type MediaPreviewProps = {
  /** Local absolute path of the artifact. */
  src: string;
  kind?: PluginMediaKind | "auto";
  /** Accessible name; localized by this plugin. */
  title?: string;
  /** Cover image path for videos; the host falls back to the first frame. */
  poster?: string;
  mode?: "inline" | "thumbnail";
  className?: string;
};

/**
 * Additive host capability (does not bump `toolCallRendererVersion`).
 * Older hosts omit `ui.media`, so every use goes through `api.ui.media?.…`.
 */
type ToolCallMediaApi = {
  url: (path: string) => string | undefined;
  open: (path: string) => boolean;
  supports: (path: string) => PluginMediaKind | undefined;
  Preview: React.ComponentType<MediaPreviewProps>;
};

export type ToolCallApi = Readonly<{
  /** Plugin id from the manifest; the host hands it to the renderer. */
  id: string;
  t: Translate;
  signal: AbortSignal;
  ui: Readonly<{
    React: typeof React;
    /** Lucide icon lookup; returns undefined for a name the host does not provide. */
    icon: (name: string) => unknown;
    toolCallRendererVersion: 1;
    ToolCallNode: React.ComponentType<ToolCallNodeProps>;
    /** Present in v1; declared optional so the card degrades instead of throwing. */
    DataTableViewer?: React.ComponentType<DataTableViewerProps>;
    /** Host-provided translator for host error strings (MCP / permission failures). */
    localizeToolError?: (t: Translate, message: string | null | undefined) => string;
    /** Local media preview; absent on hosts older than the additive `ui.media` change. */
    media?: ToolCallMediaApi;
  }>;
}>;
