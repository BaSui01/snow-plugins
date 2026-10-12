/**
 * Input-toolbar action (`chatInputAction: "optimizeDraft"`).
 *
 * The host calls this export only on an explicit toolbar click, and each click
 * receives a fresh API plus fresh storage, so nothing here depends on the
 * configuration panel being mounted.
 */

import {
  buildInstructions,
  normalizePreferences,
  PREFERENCES_KEY,
  PROJECT_CONTEXT_KEY,
  normalizeProjectContexts,
} from "./preferences";
import {
  isRuntimeSupported,
  readChannelModels,
  readProfiles,
  selectionError,
  type ChannelModels,
} from "./profiles";
import type {
  ChatInputActionContext,
  ChatInputActionResult,
  OptimizePromptOptions,
  PromptOptimizationResult,
  PromptContextReport,
} from "./types";

const cancelled = (): DOMException =>
  new DOMException("Optimization cancelled", "AbortError");

const checkActive = (signal: AbortSignal): void => {
  if (signal.aborted) throw cancelled();
};

type CapturedDraft = {
  draftToken: string;
  projectId?: string;
  inputText?: string;
  text?: string;
  conversationId?: string | null;
};

const isAbort = (error: unknown): boolean =>
  (error as { name?: string } | null)?.name === "AbortError";

/** Failure carrying no message. The host renders `error.message` next to the
 *  button, so an empty message keeps the toolbar completely silent instead of
 *  showing a sentence that would be truncated there anyway. */
const silentFailure = (): Error => new Error("");

/**
 * The input toolbar shows only a spinner for this action.
 *
 * Every status sentence is cleared, including failures: the toolbar is too
 * narrow to read them, and the host still renders its own prominent Undo button
 * on success. Problems stay discoverable from the configuration panel, which
 * reports `unavailable`, `settingsError` and selection errors in place.
 *
 * Receipts are returned in details for the host result UI; no draft, source
 * handle, report or provider error payload is written to plugin logs/storage.
 */
export async function optimizeDraft(
  context: ChatInputActionContext,
  forceProjectContext = false,
): Promise<ChatInputActionResult> {
  context.onStatus("");
  try {
    return await runOptimization(context, forceProjectContext);
  } catch (error) {
    context.onStatus("");
    // Cancellation keeps its own type so the host's cancel semantics still hold.
    if (isAbort(error)) throw error;
    return {
      details: {
        originalText: "",
        warnings: [
          error instanceof Error &&
          [
            "unavailable",
            "settingsError",
            "profilesError",
            "profileRequired",
            "profileInvalid",
            "modelRequired",
            "modelInvalid",
            "empty",
            "captureError",
            "promptRequired",
            "settingsTooLong",
          ]
            .map((key) => context.api.t(key))
            .includes(error.message)
            ? error.message
            : context.api.t("generateError"),
        ],
      },
    };
  }
}

async function runOptimization(
  { api, signal }: ChatInputActionContext,
  forceProjectContext: boolean,
): Promise<ChatInputActionResult> {
  if (!isRuntimeSupported(api)) throw new Error(api.t("unavailable"));
  checkActive(signal);

  let prefs;
  try {
    prefs = normalizePreferences(
      (key) => api.t(key),
      await api.storage.getJson(PREFERENCES_KEY, {}),
    );
  } catch {
    throw new Error(api.t("settingsError"));
  }

  const profiles = await readProfiles(api);
  checkActive(signal);

  // Models outside the profile's own basic/advanced fields can only be checked
  // against the live channel list, so it is fetched only when it can change the
  // answer. A failed fetch leaves the decision to the host backend.
  const profile = profiles.find(
    (item) => item.profileName === prefs.apiProfile,
  );
  let channel: ChannelModels | null = null;
  if (
    profile &&
    (!profile.models.length ||
      (Boolean(prefs.model) && !profile.models.includes(prefs.model)))
  ) {
    channel = await readChannelModels(api, profile.profileName);
    checkActive(signal);
  }

  const invalidSelection = selectionError(profiles, prefs, channel);
  if (invalidSelection) throw new Error(api.t(invalidSelection));
  checkActive(signal);

  const write = api.write;
  if (!write) throw new Error(api.t("unavailable"));

  const captured = await write.run("chatInput.captureDraft", {});
  if (!captured.ok || !captured.data) throw new Error(api.t("captureError"));
  const draft = captured.data as CapturedDraft;
  if (typeof draft.draftToken !== "string" || !draft.draftToken) {
    throw new Error(api.t("captureError"));
  }
  if (!draft.text?.trim()) throw new Error(api.t("empty"));

  const overrides = normalizeProjectContexts(
    await api.storage.getJson(PROJECT_CONTEXT_KEY, {}),
  );
  checkActive(signal);
  // Only the host's captured binding selects a project; never send a plugin projectId.
  const codebaseContext = structuredClone(
    (draft.projectId ? overrides[draft.projectId] : undefined) ??
      prefs.codebaseContext,
  );
  if (forceProjectContext) codebaseContext.mode = "always";
  const supportedContext =
    api.ai?.capabilities?.promptOptimization?.projectContext === 1 &&
    api.ai.capabilities.promptOptimization.sourceReview === 1;

  // Attachment chips are detected on the raw input; the optimizer only ever
  // receives the plain text.
  const hasImages =
    typeof draft.inputText === "string" && draft.inputText.includes("@@image:");
  const optimizationInstructions = buildInstructions(prefs, hasImages);
  const includeContext =
    prefs.contextMode === "recent" && Boolean(draft.conversationId);

  checkActive(signal);

  const optimize = api.ai?.optimizePrompt;
  if (!optimize) throw new Error(api.t("unavailable"));
  const options: OptimizePromptOptions = {
    draft: draft.text,
    draftToken: draft.draftToken,
    conversationId: draft.conversationId ?? undefined,
    apiProfile: prefs.apiProfile,
    model: prefs.model,
    contextRounds: prefs.contextRounds,
    includeContext,
    optimizationInstructions,
    signal,
    ...(supportedContext ? { codebaseContext } : {}),
  };
  const fallbackReport: PromptContextReport | undefined =
    !supportedContext && codebaseContext.mode !== "off"
      ? {
          outcome: "degraded",
          reason: "unsupported",
          sources: [],
          warnings: [api.t("codebaseUnsupported")],
          indexState: "unavailable",
          queryKind: "none",
          characters: 0,
          elapsedMs: 0,
          cacheHit: false,
          truncated: false,
        }
      : undefined;
  const finish = async (
    output: PromptOptimizationResult,
  ): Promise<ChatInputActionResult> => {
    checkActive(signal);
    const report = output.contextReport ?? fallbackReport;
    const details = {
      originalText: draft.text!,
      contextReport: report,
      warnings: [
        ...(output.warnings ?? []),
        ...(report?.warnings ?? []),
        ...(report?.reason
          ? [
              api.t(`contextReason.${report.reason}`, {
                defaultValue: report.reason,
              }),
            ]
          : []),
      ],
    };
    if (output.reviewRequired) {
      if (!output.contextHandle || !report)
        throw new Error(api.t("generateError"));
      const handle = output.contextHandle;
      let continued = false;
      return {
        details,
        sourceSelection: {
          sources: report.sources,
          defaultSelectedIds: report.sources
            .filter((source) => source.selected)
            .map((source) => source.id),
          contextHandle: handle,
          apply: async (sourceIds) => {
            checkActive(signal);
            if (continued) throw cancelled();
            const available = new Set(
              report.sources.map((source) => source.id),
            );
            if (sourceIds.some((id) => !available.has(id)))
              throw new Error(api.t("generateError"));
            continued = true;
            try {
              return await finish(
                await optimize({
                  ...options,
                  contextHandle: handle,
                  selectedSourceIds: [...new Set(sourceIds)],
                }),
              );
            } catch (error) {
              if (signal.aborted || isAbort(error)) throw cancelled();
              return {
                details: {
                  ...details,
                  warnings: [...details.warnings, api.t("generateError")],
                },
              };
            }
          },
        },
      };
    }
    if (typeof output?.content !== "string" || !output.content.trim()) {
      throw new Error(api.t("generateError"));
    }
    const preview = output.content;
    let used = false;

    const apply = async (): Promise<ChatInputActionResult> => {
      checkActive(signal);
      if (used) return { preview, details };
      used = true;
      // Never recapture and overwrite newer user text when this token is stale.
      let applied;
      try {
        applied = await write.run("chatInput.applyDraft", {
          draftToken: draft.draftToken,
          text: preview,
        });
      } catch {
        checkActive(signal);
        return { preview, details };
      }
      checkActive(signal);
      const restoreToken = (
        applied.data as { restoreToken?: unknown } | undefined
      )?.restoreToken;
      if (!applied.ok || typeof restoreToken !== "string") {
        return { preview, details };
      }
      let restored = false;
      // No message on success: the host shows its own prominent Undo button.
      return {
        preview,
        details,
        undo: async () => {
          checkActive(signal);
          if (restored) throw silentFailure();
          restored = true;
          const response = await write.run("chatInput.restoreDraft", {
            restoreToken,
          });
          if (!response.ok) throw silentFailure();
        },
      };
    };

    return prefs.autoApply ? await apply() : { preview, apply, details };
  };
  try {
    return await finish(await optimize(options));
  } catch (error) {
    if (signal.aborted || isAbort(error)) throw cancelled();
    return {
      details: { originalText: draft.text, warnings: [api.t("generateError")] },
    };
  }
}

export const optimizeDraftWithProjectContext = (
  context: ChatInputActionContext,
): Promise<ChatInputActionResult> => optimizeDraft(context, true);
