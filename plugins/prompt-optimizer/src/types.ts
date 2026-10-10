/**
 * Minimal structural types for the host plugin runtime API.
 *
 * Only the members this plugin actually calls are declared: the host owns the
 * real implementation (`src/renderer/plugins/pluginApi.ts` in Snow App), and
 * adding an unused member here would silently widen the plugin's contract.
 */

export type ReactLike = {
  createElement: (
    type: unknown,
    props?: unknown,
    ...children: unknown[]
  ) => unknown;
  useState: <T>(
    initial: T | (() => T),
  ) => [T, (next: T | ((previous: T) => T)) => void];
  useEffect: (
    effect: () => void | (() => void),
    deps?: readonly unknown[],
  ) => void;
  useRef: <T>(initial: T) => { current: T };
};

export type WriteResponse = {
  ok: boolean;
  action: string;
  data?: unknown;
  denied?: { reason: string; scope?: string };
  error?: string;
};

export type WriteActionSummary = {
  id: string;
  scope: string | null;
  granted: boolean;
  summary: string;
};

export type WriteDomainSummary = {
  id: string;
  granted: boolean;
  actions: WriteActionSummary[];
};

export type WriteApi = {
  run: (
    actionId: string,
    params?: Record<string, unknown>,
  ) => Promise<WriteResponse>;
  domains: () => WriteDomainSummary[];
};

export type MetadataResponse = {
  generatedAt?: string;
  domains?: Record<string, unknown>;
  denied?: Record<string, { reason: string; scope?: string }>;
  withheld?: Record<string, string[]>;
  unknown?: string[];
};

export type MetadataApi = {
  get: (
    domain: string | string[],
    options?: { params?: Record<string, unknown> },
  ) => Promise<MetadataResponse>;
  subscribe: (
    domain: string,
    listener: (response: MetadataResponse) => void,
    options?: { params?: Record<string, unknown>; intervalMs?: number },
  ) => Promise<{ unsubscribe: () => void }>;
};

export type StorageApi = {
  getJson: <T>(key: string, fallback: T) => Promise<T>;
  setJson: (key: string, value: unknown) => Promise<void>;
};

export type OptimizePromptOptions = {
  draft: string;
  conversationId?: string;
  apiProfile?: string;
  model?: string;
  contextRounds?: number;
  includeContext?: boolean;
  optimizationInstructions?: string;
  signal?: AbortSignal;
};

export type AiApi = {
  optimizePrompt?: (
    options: OptimizePromptOptions,
  ) => Promise<{ content: string }>;
};

export type PluginApi = {
  id: string;
  locale?: string;
  t: (
    key: string,
    options?: { defaultValue?: string; values?: Record<string, string | number> },
  ) => string;
  metadata: MetadataApi;
  write?: WriteApi;
  storage: StorageApi;
  ai?: AiApi;
  ui: { React: ReactLike; icon: (name: string) => unknown };
  log?: (...args: unknown[]) => void;
};

export type ChatInputActionResult = {
  message?: string;
  preview?: string;
  apply?: () => Promise<ChatInputActionResult>;
  undo?: () => Promise<void>;
};

export type ChatInputActionContext = {
  api: PluginApi;
  signal: AbortSignal;
  onStatus: (message: string) => void;
  confirm: (message: string) => Promise<boolean>;
};

export type PanelProps = {
  api: PluginApi;
  isActive?: boolean;
  inputText?: string;
};
