/**
 * Model service discovery. Every read hits the host collector, so the panel and
 * each toolbar click always see the current service list instead of a snapshot.
 */

import type { MetadataResponse, PluginApi } from "./types";

export type ProfileOption = {
  profileName: string;
  displayName: string;
  isActive: boolean;
  basicModel: string;
  models: string[];
};

export const readProfiles = async (api: PluginApi): Promise<ProfileOption[]> => {
  let response: MetadataResponse;
  try {
    response = await api.metadata.get("apiProfiles");
  } catch {
    throw new Error(api.t("profilesError"));
  }
  const profiles = response?.domains?.apiProfiles;
  const invalid =
    response?.denied?.apiProfiles !== undefined ||
    !Array.isArray(profiles) ||
    profiles.some(
      (profile) =>
        !profile ||
        typeof (profile as { profileName?: unknown }).profileName !== "string" ||
        !(profile as { profileName: string }).profileName.trim(),
    );
  if (invalid) {
    throw new Error(api.t("profilesError"));
  }
  return (profiles as Record<string, unknown>[]).map((profile) => {
    const profileName = profile.profileName as string;
    const displayName =
      typeof profile.displayName === "string" && profile.displayName.trim()
        ? profile.displayName
        : profileName;
    const models = [profile.basicModel, profile.advancedModel].filter(
      (model): model is string => typeof model === "string" && !!model.trim(),
    );
    return {
      profileName,
      displayName,
      isActive: profile.isActive === true,
      basicModel:
        typeof profile.basicModel === "string" && profile.basicModel.trim()
          ? profile.basicModel
          : "",
      models: [...new Set(models)],
    };
  });
};

export type ChannelModels = {
  /** False when the running host has no `apiModels` domain (older builds). */
  supported: boolean;
  /** Provider model ids, or null when the live fetch failed. Never a key. */
  models: string[] | null;
};

/**
 * Live model list of one service. The host performs the provider request with
 * the profile's stored credentials and returns model ids only; the plugin never
 * sees a key. A failed fetch is `models: null`, which callers must treat as
 * "unknown", never as "empty".
 */
export const readChannelModels = async (
  api: PluginApi,
  profileName: string,
): Promise<ChannelModels> => {
  let response: MetadataResponse;
  try {
    response = await api.metadata.get("apiModels", {
      params: { profileName },
    });
  } catch {
    return { supported: false, models: null };
  }
  if (
    response?.unknown?.includes("apiModels") ||
    response?.denied?.apiModels !== undefined
  ) {
    return { supported: false, models: null };
  }
  const data = response?.domains?.apiModels as { models?: unknown } | null;
  if (!data || typeof data !== "object" || !Array.isArray(data.models)) {
    return { supported: true, models: null };
  }
  return {
    supported: true,
    models: data.models.filter(
      (model): model is string => typeof model === "string" && !!model.trim(),
    ),
  };
};

/** Configured models first, then the channel list; duplicates removed. */
export const mergeModelOptions = (
  configured: readonly string[],
  channel: ChannelModels | null | undefined,
): string[] => {
  const merged = [...configured, ...(channel?.models ?? [])].filter(
    (model) => !!model.trim(),
  );
  return [...new Set(merged)];
};

export type SelectionIssue =
  | ""
  | "profilesEmpty"
  | "activeProfileUnavailable"
  | "basicModelUnavailable"
  | "profileInvalid"
  | "profileRequired"
  | "modelsEmpty"
  | "modelInvalid"
  | "modelRequired";

/**
 * Validates the saved service/model selection. An empty saved selection is only
 * allowed when exactly one active service exposes a basic model, which is the
 * same fallback the host backend applies.
 *
 * `channel` is the live channel model list when it has been fetched. A
 * non-empty successful list is authoritative: a selection outside the merged
 * options is reported as invalid. When the list is unavailable (older host,
 * failed fetch, empty result or a caller that skipped it) membership cannot be
 * verified, so a non-empty selection is left to the host backend instead of
 * being reported as invalid.
 */
export const selectionError = (
  profiles: ProfileOption[],
  selection: { apiProfile: string; model: string },
  channel?: ChannelModels | null,
): SelectionIssue => {
  if (!profiles.length) return "profilesEmpty";
  if (!selection.apiProfile && !selection.model) {
    const active = profiles.filter((item) => item.isActive);
    if (active.length !== 1) return "activeProfileUnavailable";
    const fallback = active[0];
    if (!fallback?.basicModel) return "basicModelUnavailable";
  }
  const profile = profiles.find(
    (item) => item.profileName === selection.apiProfile,
  );
  if (!profile) return selection.apiProfile ? "profileInvalid" : "profileRequired";
  const options = mergeModelOptions(profile.models, channel);
  if (!options.length) return "modelsEmpty";
  if (!options.includes(selection.model)) {
    if (!selection.model) return "modelRequired";
    // Only a non-empty live list proves a model id is gone; a missing or empty
    // list is unverifiable and stays a host-backend decision.
    if (!channel?.models?.length) return "";
    return "modelInvalid";
  }
  return "";
};

/** True when the host exposes the optimization and safe draft capabilities. */
export const isRuntimeSupported = (api: PluginApi): boolean => {
  const granted = new Set(
    (api.write?.domains() ?? []).flatMap((domain) =>
      domain.actions.filter((action) => action.granted).map((action) => action.id),
    ),
  );
  return (
    typeof api.ai?.optimizePrompt === "function" &&
    ["chatInput.captureDraft", "chatInput.applyDraft", "chatInput.restoreDraft"].every(
      (id) => granted.has(id),
    )
  );
};
