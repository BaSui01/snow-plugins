/**
 * Saved preference schema, defaults, normalization and the effective
 * instruction builder. Kept free of React and DOM access so both the panel and
 * the input-toolbar action share exactly one source of truth.
 */

export const STRATEGIES = {
  faithful: "Improve clarity conservatively. Clarify ambiguity only when supported by the draft or reference context; otherwise preserve it. Preserve all intent, facts, constraints and uncertainty; never add requirements.",
  structured:
    "Organize the task's existing objectives, context, constraints and output requirements into a coherent order. Follow the presentation preference rather than imposing headings. Omit missing information instead of inventing it.",
  concise:
    "Remove repetition and redundant wording while preserving every meaningful requirement, qualifier, fact and uncertainty.",
  custom:
    "Use the user's optimization instructions without adding an extra preset strategy.",
} as const;

export const LENGTHS = {
  preserve:
    "Keep the result approximately as long as the draft where practical; never discard valid constraints to hit a length target.",
  expand:
    "Expand only to explain existing intent or constraints more clearly. Do not add facts, examples, requirements or assumptions.",
  concise:
    "Prefer the shortest wording that retains the full intent and all valid constraints.",
} as const;

export const STRUCTURES = {
  natural:
    "Use clear natural-language paragraphs, with no unnecessary template headings.",
  structured:
    "Use concise sections or bullets for the information that actually exists. Omit empty or unevidenced sections.",
} as const;

export const CONTEXT_MODES = ["recent", "draft"] as const;

export type StrategyId = keyof typeof STRATEGIES;
export type LengthId = keyof typeof LENGTHS;
export type StructureId = keyof typeof STRUCTURES;
export type ContextMode = (typeof CONTEXT_MODES)[number];

export type Preferences = {
  apiProfile: string;
  strategy: StrategyId;
  optimizationPrompt: string;
  contextMode: ContextMode;
  contextRounds: number;
  model: string;
  length: LengthId;
  structure: StructureId;
  autoApply: boolean;
};

export const PROMPT_LIMIT = 7000;
export const INSTRUCTIONS_LIMIT = 8000;

/** Mirrors the host limit: the textarea allows a wider edit buffer than the limit. */
export const PROMPT_INPUT_MAX = PROMPT_LIMIT * 2;

export const PREFERENCES_KEY = "preferences";
export const INPUT_SETTINGS_KEY = "inputSettingsVisible";

export type Translate = (key: string) => string;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (source: Record<string, unknown>, key: string): boolean =>
  Object.hasOwn(source, key);

export const createDefaults = (t: Translate): Preferences => ({
  apiProfile: "",
  strategy: "faithful",
  optimizationPrompt: t("defaultPrompt"),
  contextMode: "recent",
  contextRounds: 3,
  model: "",
  length: "preserve",
  structure: "natural",
  autoApply: true,
});

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

export const normalizePreferences = (
  t: Translate,
  raw: unknown,
): Preferences => {
  const value = isRecord(raw) ? raw : {};
  const base = createDefaults(t);
  return {
    ...base,
    strategy: hasOwn(STRATEGIES, asString(value.strategy))
      ? (value.strategy as StrategyId)
      : base.strategy,
    optimizationPrompt:
      typeof value.optimizationPrompt === "string"
        ? value.optimizationPrompt
        : base.optimizationPrompt,
    contextMode: CONTEXT_MODES.includes(value.contextMode as ContextMode)
      ? (value.contextMode as ContextMode)
      : base.contextMode,
    contextRounds: Number.isInteger(value.contextRounds)
      ? Math.max(1, Math.min(10, value.contextRounds as number))
      : base.contextRounds,
    apiProfile:
      typeof value.apiProfile === "string" ? value.apiProfile : base.apiProfile,
    model: typeof value.model === "string" ? value.model : base.model,
    length: hasOwn(LENGTHS, asString(value.length))
      ? (value.length as LengthId)
      : base.length,
    structure: hasOwn(STRUCTURES, asString(value.structure))
      ? (value.structure as StructureId)
      : base.structure,
    autoApply:
      typeof value.autoApply === "boolean" ? value.autoApply : base.autoApply,
  };
};

export type InstructionError = "promptRequired" | "settingsTooLong";

export class InstructionBuildError extends Error {
  readonly reason: InstructionError;

  constructor(reason: InstructionError) {
    super(reason);
    this.name = "InstructionBuildError";
    this.reason = reason;
  }
}

export const countCodePoints = (text: string): number =>
  Array.from(text).length;

/**
 * Composes the optimizer meta-prompt. The host keeps its own non-negotiable
 * safety baseline, so this text can only narrow, never widen, what the model is
 * allowed to do with the draft.
 */
export const buildInstructions = (
  preferences: Preferences,
  hasImages = false,
): string => {
  const prompt = preferences.optimizationPrompt.trim();
  if (!prompt) {
    throw new InstructionBuildError("promptRequired");
  }
  if (countCodePoints(preferences.optimizationPrompt) > PROMPT_LIMIT) {
    throw new InstructionBuildError("settingsTooLong");
  }
  const parts = [
    "Apply these preferences together: the strategy sets the editing focus, length sets detail, and presentation sets the format. Preserve all meaningful constraints and uncertainty before style or length targets; do not pad the result just to preserve length.",
  ];
  if (hasImages) {
    parts.push(
      "Attachment context:\nThe user attached one or more images/screenshots with this draft. Preserve and clarify any references to the visual attachments (such as 'as shown in the screenshot', 'the attached image', UI elements, or error callouts), ensuring the rewritten prompt clearly guides the model to inspect them. Do not remove, contradict, or obscure references to the visual input.",
    );
  }
  parts.push(
    "Optimization rules:\n" + prompt,
    "Selected strategy:\n" + STRATEGIES[preferences.strategy],
    "Length preference:\n" + LENGTHS[preferences.length],
    "Presentation preference:\n" + STRUCTURES[preferences.structure],
  );
  const text = parts.join("\n\n");
  if (countCodePoints(text) > INSTRUCTIONS_LIMIT) {
    throw new InstructionBuildError("settingsTooLong");
  }
  return text;
};

/** Returns the effective rules or the translation key explaining the failure. */
export const previewInstructions = (
  t: Translate,
  preferences: Preferences,
): { text: string; error: "" | InstructionError } => {
  try {
    return { text: buildInstructions(preferences), error: "" };
  } catch (error) {
    if (error instanceof InstructionBuildError) {
      return { text: t(error.reason), error: error.reason };
    }
    return { text: t("settingsTooLong"), error: "settingsTooLong" };
  }
};
