import type * as React from "react";

// Structural copy of the desktop v1 slot contract. No imports from the host repo.
export type Translate = (key: string, options?: {
  defaultValue?: string;
  values?: Record<string, string | number>;
}) => string;
export type ToolCallInfo = Readonly<{
  name: string;
  arguments: string;
  interactionId: string;
  status: "pending" | "running" | "completed" | "error";
  result?: string;
  streamingStdout?: string;
  streamingStderr?: string;
}>;
export type ToolCallContext = Readonly<{
  slot: "tool-call";
  conversationId?: string;
  messageId?: string;
  toolCall: ToolCallInfo;
}>;
export type ToolCallNodeProps = {
  toolName: string;
  badgeName?: string;
  category?: "web" | "database";
  displayName?: React.ReactNode;
  displayNameTitle?: string;
  status: ToolCallInfo["status"];
  meta?: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
  lazyBody?: boolean;
  children?: React.ReactNode;
};
export type DataTableViewerProps = {
  columns: string[];
  rows: unknown[][];
  maxInitialRows?: number;
  className?: string;
  enableExport?: boolean;
  enableSearch?: boolean;
};
export type ToolCallApi = Readonly<{
  id: string;
  version: string;
  locale: "en" | "zh-CN" | "zh-TW";
  t: Translate;
  signal: AbortSignal;
  ui: Readonly<{
    React: typeof React;
    icon: (name: string) => unknown;
    toolCallRendererVersion: 1;
    ToolCallNode: React.ComponentType<ToolCallNodeProps>;
    DataTableViewer: React.ComponentType<DataTableViewerProps>;
    localizeToolError: (t: Translate, message: string | null | undefined) => string;
  }>;
  links: Readonly<{ open: (url: string, target?: "browser" | "external") => void }>;
}>;
