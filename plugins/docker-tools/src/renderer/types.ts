import type * as React from "react";

// Structural copy of the desktop v1 tool-call slot contract. No imports from
// the host repository: plugins only receive the frozen per-card API.
export type Translate = (
  key: string,
  options?: {
    defaultValue?: string;
    values?: Record<string, string | number>;
  },
) => string;

export type ToolCallInfo = Readonly<{
  name: string;
  originalToolName?: string;
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

export type ToolCategory =
  | "read"
  | "edit"
  | "create"
  | "copy"
  | "search"
  | "terminal"
  | "web"
  | "git"
  | "outline"
  | "todo"
  | "interaction"
  | "agent"
  | "message"
  | "workflow"
  | "lens"
  | "image"
  | "skill"
  | "database"
  | "telemetry"
  | "html"
  | "decision"
  | "generic";

export type ToolCallNodeProps = {
  toolName: string;
  badgeName?: string;
  category?: ToolCategory;
  displayName?: React.ReactNode;
  displayNameTitle?: string;
  status: ToolCallInfo["status"];
  meta?: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
  lazyBody?: boolean;
  children?: React.ReactNode;
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
    localizeToolError: (
      t: Translate,
      message: string | null | undefined,
    ) => string;
  }>;
  links: Readonly<{
    open: (url: string, target?: "browser" | "external") => void;
  }>;
}>;
