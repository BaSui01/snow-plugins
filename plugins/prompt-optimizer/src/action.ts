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
} from "./preferences";
import { isRuntimeSupported, readProfiles, selectionError } from "./profiles";
import type { ChatInputActionContext, ChatInputActionResult } from "./types";

const cancelled = (): DOMException =>
  new DOMException("Optimization cancelled", "AbortError");

const checkActive = (signal: AbortSignal): void => {
  if (signal.aborted) throw cancelled();
};

type CapturedDraft = {
  draftToken: string;
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
 * Because the UI is silent, failures are still logged through `api.log` so a
 * real error remains traceable in the application logs without surfacing text
 * in the toolbar.
 */
export async function optimizeDraft(
  context: ChatInputActionContext,
): Promise<ChatInputActionResult> {
  context.onStatus("");
  try {
    return await runOptimization(context);
  } catch (error) {
    context.onStatus("");
    // Cancellation keeps its own type so the host's cancel semantics still hold.
    if (isAbort(error)) throw error;
    context.api.log?.("optimizeDraft failed:", error);
    throw silentFailure();
  }
}

async function runOptimization({
  api,
  signal,
}: ChatInputActionContext): Promise<ChatInputActionResult> {
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

  const invalidSelection = selectionError(profiles, prefs);
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

  // Attachment chips are detected on the raw input; the optimizer only ever
  // receives the plain text.
  const hasImages =
    typeof draft.inputText === "string" && draft.inputText.includes("@@image:");
  const optimizationInstructions = buildInstructions(prefs, hasImages);
  const includeContext =
    prefs.contextMode === "recent" && Boolean(draft.conversationId);

  checkActive(signal);

  let output: { content: string };
  try {
    const optimize = api.ai?.optimizePrompt;
    if (!optimize) throw new Error(api.t("unavailable"));
    output = await optimize({
      draft: draft.text,
      conversationId: draft.conversationId ?? undefined,
      apiProfile: prefs.apiProfile,
      model: prefs.model,
      contextRounds: prefs.contextRounds,
      includeContext,
      optimizationInstructions,
      signal,
    });
  } catch (error) {
    if (signal.aborted || (error as { name?: string })?.name === "AbortError") {
      throw cancelled();
    }
    throw new Error(api.t("generateError"));
  }
  checkActive(signal);

  if (typeof output?.content !== "string" || !output.content.trim()) {
    throw new Error(api.t("generateError"));
  }
  const preview = output.content;
  let used = false;

  const apply = async (): Promise<ChatInputActionResult> => {
    checkActive(signal);
    if (used) return { preview };
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
      return { preview };
    }
    checkActive(signal);
    const restoreToken = (applied.data as { restoreToken?: unknown } | undefined)
      ?.restoreToken;
    if (!applied.ok || typeof restoreToken !== "string") {
      return { preview };
    }
    let restored = false;
    // No message on success: the host shows its own prominent Undo button.
    return {
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

  return prefs.autoApply
    ? await apply()
    : { preview, apply };
}
