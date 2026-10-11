/**
 * Minimal structural types for the host message-footer runtime API.
 *
 * Only the members this plugin actually calls are declared: the host owns the
 * real implementation (`src/renderer/plugins/pluginApi.ts` in Snow App), and
 * adding an unused member here would silently widen the plugin's contract.
 *
 * Records arrive as untrusted runtime data, so their fields stay loose and the
 * footer narrows them at runtime instead of trusting the declared shape.
 */

export type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export type TranslateOptions = {
  defaultValue?: string;
  values?: Record<string, string | number>;
};

export type IconComponent = {
  render?: (
    props: Record<string, unknown>,
    ref: unknown,
  ) => { props?: { iconNode?: unknown } } | null | undefined;
};

export type FooterUi = {
  icon: (name: string) => IconComponent | undefined;
  messageFooterVersion?: number;
};

export type FooterWriteAction = {
  id: string;
  scope?: string | null;
  granted: boolean;
  summary?: string;
};

export type FooterWriteDomain = {
  id: string;
  granted: boolean;
  actions?: FooterWriteAction[];
};

export type WriteResponse = {
  ok: boolean;
  action?: string;
  data?: unknown;
  denied?: { reason: string; scope?: string };
  error?: string;
};

/** Footer runtimes expose reads plus the file-reader navigation action only. */
export type FooterWriteApi = {
  domains: () => FooterWriteDomain[];
  run: (
    actionId: string,
    params?: Record<string, unknown>,
  ) => Promise<WriteResponse>;
};

export type FooterApi = {
  id?: string;
  locale?: string;
  t: (key: string, options?: TranslateOptions) => string;
  /** The footer contract always provides `ui`; `write` is the optional subset. */
  ui: FooterUi;
  write?: FooterWriteApi;
  log?: (...args: unknown[]) => void;
};

export type FileChangeDiff = {
  patch?: unknown;
  isBinary?: unknown;
};

/** Raw host record; every field is validated before it is used. */
export type FileChangeRecord = {
  filePath?: unknown;
  fileKey?: unknown;
  kind?: unknown;
  source?: unknown;
  root?: unknown;
  timestamp?: unknown;
  agent?: unknown;
  subAgentName?: unknown;
  diff?: FileChangeDiff | null;
};

/** Frozen `context.task` snapshot: this task's file evidence, never a counter. */
export type TaskSnapshot = {
  id?: string;
  records?: unknown;
  coverage?: unknown;
};

export type FooterContext = {
  slot?: string;
  conversationId?: string;
  messageId?: string;
  directoryId?: string;
  task?: TaskSnapshot;
};
