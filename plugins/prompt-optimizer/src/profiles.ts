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
 */
export const selectionError = (
  profiles: ProfileOption[],
  selection: { apiProfile: string; model: string },
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
  if (!profile.models.length) return "modelsEmpty";
  if (!profile.models.includes(selection.model)) {
    return selection.model ? "modelInvalid" : "modelRequired";
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
