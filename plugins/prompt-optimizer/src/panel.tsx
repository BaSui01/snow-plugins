/**
 * Configuration panel: the right-hand tab declared in plugin.json.
 *
 * This panel only edits and saves preferences. It never calls the AI, never
 * captures a draft and never triggers the toolbar action; opening or saving it
 * must stay free of charge.
 */

import { h, bindReact } from "./jsx";
import {
  buildInstructions,
  CONTEXT_MODES,
  createDefaults,
  countCodePoints,
  INPUT_SETTINGS_KEY,
  InstructionBuildError,
  LENGTHS,
  normalizePreferences,
  PREFERENCES_KEY,
  PROMPT_INPUT_MAX,
  PROMPT_LIMIT,
  previewInstructions,
  STRATEGIES,
  STRUCTURES,
  type Preferences,
} from "./preferences";
import {
  isRuntimeSupported,
  readProfiles,
  selectionError,
  type ProfileOption,
} from "./profiles";
import type { PanelProps } from "./types";

export default function PromptOptimizerSettings({ api }: PanelProps) {
  const { useState, useEffect, useRef } = bindReact(api.ui.React);
  const t = (
    key: string,
    options?: { values?: Record<string, string | number> },
  ): string => api.t(key, options);

  const [prefs, setPrefs] = useState<Preferences>(() => createDefaults(t));
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("loading");
  const [dirty, setDirty] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [resetPending, setResetPending] = useState(false);

  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [profilesStatus, setProfilesStatus] = useState("profilesLoading");
  const [profilesFeedback, setProfilesFeedback] = useState("");
  const [profilesRetry, setProfilesRetry] = useState(0);

  // Gear visibility is an independent preference: it saves on its own and never
  // touches the optimization rules being edited.
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [settingsRetry, setSettingsRetry] = useState(0);

  const mounted = useRef(false);
  const saveLock = useRef(false);
  const profilesLock = useRef(false);
  const settingsLock = useRef(false);
  // Whether the chat input is bound to a real conversation decides if history
  // can be attached at all; a new conversation has no id and sends none.
  // `runtime.chatInput.conversationId` and the action's captured draft both come
  // from the same host variable, so this mirrors the action exactly.
  const [hasConversation, setHasConversation] = useState(false);
  // `runtime.conversation.messageCount` shares that same source, so it reports
  // the bound conversation's size without requesting the sensitive `messages`
  // domain (whose default parameter is the *focused* conversation instead).
  const [boundMessageCount, setBoundMessageCount] = useState(0);

  useEffect(() => {
    let alive = true;
    let subscription: { unsubscribe: () => void } | null = null;
    // `runtime` is a live domain and needs no privacy declaration. It also keeps
    // the hint correct when the user switches conversations while the panel is open.
    api.metadata
      .subscribe("runtime", (response) => {
        if (!alive) return;
        const runtime = response?.domains?.runtime as
          | {
              chatInput?: { conversationId?: string | null };
              conversation?: { conversationId?: string; messageCount?: number };
            }
          | undefined;
        const bound = Boolean(runtime?.chatInput?.conversationId);
        setHasConversation(bound);
        // Only trust the count when it belongs to the bound conversation.
        const focused = runtime?.conversation;
        setBoundMessageCount(
          bound && focused?.conversationId === runtime?.chatInput?.conversationId
            ? (focused?.messageCount ?? 0)
            : 0,
        );
      })
      .then((value) => {
        if (alive) subscription = value;
        else value.unsubscribe();
      })
      .catch(() => {
        /* The hint simply stays in its conservative "no history" state. */
      });
    return () => {
      alive = false;
      subscription?.unsubscribe();
    };
  }, [api]);

  useEffect(() => {
    let alive = true;
    mounted.current = true;
    setLoaded(false);
    setStatus("loading");
    setDirty(false);
    setResetPending(false);
    saveLock.current = false;
    api.storage
      .getJson(PREFERENCES_KEY, {})
      .then((value) => {
        if (!alive) return;
        setPrefs(normalizePreferences(t, value));
        setLoaded(true);
        setStatus("ready");
      })
      .catch(() => {
        if (alive) setStatus("settingsError");
      });
    return () => {
      alive = false;
      mounted.current = false;
    };
  }, [api, retry]);

  useEffect(() => {
    let alive = true;
    setSettingsLoaded(false);
    api.storage
      .getJson(INPUT_SETTINGS_KEY, false)
      .then((value) => {
        if (!alive) return;
        setSettingsVisible(value === true);
        setSettingsLoaded(true);
        setSettingsStatus("");
      })
      .catch(() => {
        if (alive) setSettingsStatus("inputSettingsError");
      });
    return () => {
      alive = false;
    };
  }, [api, settingsRetry]);

  useEffect(() => {
    let alive = true;
    profilesLock.current = true;
    setProfilesStatus("profilesLoading");
    setProfilesFeedback("");
    // Each attempt reaches the host collector; never reuse a panel snapshot.
    readProfiles(api)
      .then((items) => {
        if (!alive) return;
        setProfiles(items);
        setProfilesStatus("");
        setProfilesFeedback(profilesRetry ? "profilesReloaded" : "");
      })
      .catch(() => {
        if (!alive) return;
        setProfiles([]);
        setProfilesStatus("profilesError");
      })
      .finally(() => {
        if (alive) profilesLock.current = false;
      });
    return () => {
      alive = false;
    };
  }, [api, profilesRetry]);

  useEffect(() => {
    if (!loaded || profilesStatus || prefs.apiProfile || prefs.model) return;
    const active = profiles.filter((item) => item.isActive);
    if (active.length !== 1) return;
    const candidate = active[0];
    if (!candidate || !candidate.basicModel) return;
    // A default is an unsaved panel choice, never a migration or storage write.
    setPrefs((previous) =>
      previous.apiProfile || previous.model
        ? previous
        : { ...previous, apiProfile: candidate.profileName, model: candidate.basicModel },
    );
    setDirty(true);
    setStatus("unsaved");
  }, [loaded, profilesStatus, profiles, prefs.apiProfile, prefs.model]);

  const change = (patch: Partial<Preferences>): void => {
    setPrefs((previous) => ({ ...previous, ...patch }));
    setDirty(true);
    setStatus("unsaved");
  };

  const toggleSettings = async (visible: boolean): Promise<void> => {
    if (!settingsLoaded || settingsLock.current) return;
    settingsLock.current = true;
    setSettingsSaving(true);
    try {
      await api.storage.setJson(INPUT_SETTINGS_KEY, visible);
      if (mounted.current) {
        setSettingsVisible(visible);
        setSettingsStatus("inputSettingsSaved");
      }
    } catch {
      if (mounted.current) setSettingsStatus("inputSettingsError");
    } finally {
      settingsLock.current = false;
      if (mounted.current) setSettingsSaving(false);
    }
  };

  const refreshProfiles = (): void => {
    if (saveLock.current || profilesLock.current) return;
    profilesLock.current = true;
    setProfilesStatus("profilesLoading");
    setProfilesFeedback("");
    setProfilesRetry((value) => value + 1);
  };

  const save = async (value: Preferences = prefs): Promise<void> => {
    if (!loaded || saveLock.current || profilesStatus) return;
    const invalidSelection = selectionError(profiles, value);
    if (invalidSelection) {
      setStatus(invalidSelection);
      return;
    }
    try {
      buildInstructions(value);
    } catch (error) {
      setStatus(
        error instanceof InstructionBuildError && error.reason === "promptRequired"
          ? "promptRequired"
          : "settingsTooLong",
      );
      return;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      await api.storage.setJson(PREFERENCES_KEY, value);
      if (mounted.current) {
        setPrefs(value);
        setDirty(false);
        setStatus("saved");
        setResetPending(false);
      }
    } catch {
      if (mounted.current) setStatus("settingsError");
    } finally {
      saveLock.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const supported = isRuntimeSupported(api);
  const profile = profiles.find((item) => item.profileName === prefs.apiProfile);
  const models = profile?.models ?? [];
  const modelStatus = profilesStatus || selectionError(profiles, prefs);
  const busy = saving || !loaded || profilesStatus === "profilesLoading";
  const count = countCodePoints(prefs.optimizationPrompt);
  const overLimit = count > PROMPT_LIMIT;
  const preview = previewInstructions(t, prefs);
  const brandIcon = api.ui.icon("WandSparkles");
  const renderableIcon =
    typeof brandIcon === "function" ||
    (typeof brandIcon === "object" && brandIcon !== null);

  // Mirrors the action's own rule: history is only attached when the strategy
  // includes context AND the input is bound to an existing conversation that
  // actually contains messages.
  const contextHint: {
    key: string;
    values?: Record<string, string | number>;
    warn: boolean;
  } =
    prefs.contextMode === "draft"
      ? { key: "contextHintDraft", warn: false }
      : !hasConversation
        ? { key: "contextHintNoSession", warn: true }
        : boundMessageCount === 0
          ? { key: "contextHintEmptySession", warn: true }
          : {
              key: "contextHintRecent",
              values: {
                rounds: prefs.contextRounds,
                messages: boundMessageCount,
              },
              warn: false,
            };

  const select = (
    key: keyof Preferences,
    values: readonly string[],
  ): unknown => (
    <select
      value={String(prefs[key])}
      disabled={!loaded || saving}
      onChange={(event: { target: { value: string } }) =>
        change({ [key]: event.target.value } as Partial<Preferences>)
      }
    >
      {values.map((value) => (
        <option key={value} value={value}>
          {t(`${String(key)}.${value}`)}
        </option>
      ))}
    </select>
  );

  const footerStatus = saving
    ? t("saving")
    : modelStatus
      ? t(modelStatus)
      : t(status);

  return (
    <section
      className="snow-po-settings"
      aria-label={t("title")}
      aria-busy={busy}
    >
      <header className="po-header">
        <span className="po-icon" aria-hidden="true">
          {renderableIcon ? h(brandIcon, { size: 20 }) : "✦"}
        </span>
        <div className="po-header-text">
          <h2>{t("title")}</h2>
          <p className="po-muted">{t("ready")}</p>
        </div>
      </header>

      {!supported && (
        <div className="po-status po-warning" role="alert">
          {t("unavailable")}
        </div>
      )}

      <p className="po-disclosure">{t("privacy")}</p>

      <div className="po-card">
        <div className="po-card-head">
          <h3>{t("rulesTitle")}</h3>
          <p className="po-muted">{t("strategyHelp")}</p>
        </div>
        <label className="po-field">
          <span>{t("strategy")}</span>
          {select("strategy", Object.keys(STRATEGIES))}
        </label>
        <label className="po-field">
          <span className="po-label">
            <span>{t("optimizationPrompt")}</span>
            <span className={"po-counter" + (overLimit ? " po-over-limit" : "")}>
              {count} / {PROMPT_LIMIT} · {t("codePoints")}
            </span>
          </span>
          <textarea
            value={prefs.optimizationPrompt}
            disabled={!loaded || saving}
            maxLength={PROMPT_INPUT_MAX}
            rows={7}
            spellCheck={false}
            aria-invalid={overLimit}
            onChange={(event: { target: { value: string } }) =>
              change({ optimizationPrompt: event.target.value })
            }
          />
        </label>
        <p className="po-muted">{t("promptHelp")}</p>
        <div className="po-grid">
          <label className="po-field">
            <span>{t("length")}</span>
            {select("length", Object.keys(LENGTHS))}
          </label>
          <label className="po-field">
            <span>{t("structure")}</span>
            {select("structure", Object.keys(STRUCTURES))}
          </label>
        </div>
      </div>

      <div className="po-card">
        <div className="po-card-head">
          <h3>{t("contextTitle")}</h3>
        </div>
        <div className="po-grid">
          <label className="po-field">
            <span>{t("contextMode")}</span>
            {select("contextMode", CONTEXT_MODES)}
          </label>
          {prefs.contextMode === "recent" && (
            <label className="po-field">
              <span>{t("rounds")}</span>
              <input
                type="number"
                min={1}
                max={10}
                step={1}
                value={prefs.contextRounds}
                disabled={!loaded || saving}
                onChange={(event: { target: { value: string } }) =>
                  change({
                    contextRounds: Math.max(
                      1,
                      Math.min(10, Math.trunc(Number(event.target.value) || 1)),
                    ),
                  })
                }
              />
            </label>
          )}
        </div>
        <p
          className={"po-hint" + (contextHint.warn ? " po-hint-warn" : "")}
          role="status"
          aria-live="polite"
        >
          <span className="po-hint-dot" aria-hidden="true" />
          <span>{t(contextHint.key, { values: contextHint.values })}</span>
        </p>
        <div className="po-grid">
          <label className="po-field">
            <span>{t("apiProfile")}</span>
            <select
              value={profile ? prefs.apiProfile : ""}
              disabled={
                !loaded || saving || Boolean(profilesStatus) || !profiles.length
              }
              onChange={(event: { target: { value: string } }) => {
                const selected = profiles.find(
                  (item) => item.profileName === event.target.value,
                );
                if (selected) {
                  change({
                    apiProfile: selected.profileName,
                    model: selected.basicModel,
                  });
                }
              }}
            >
              <option value="" disabled>
                {t("profileRequired")}
              </option>
              {profiles.map((item) => (
                <option key={item.profileName} value={item.profileName}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="po-field">
            <span>{t("model")}</span>
            <select
              value={models.includes(prefs.model) ? prefs.model : ""}
              disabled={
                !loaded || saving || Boolean(profilesStatus) || !models.length
              }
              onChange={(event: { target: { value: string } }) => {
                if (models.includes(event.target.value)) {
                  change({ model: event.target.value });
                }
              }}
            >
              <option value="" disabled>
                {t("modelRequired")}
              </option>
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        </div>
        {(profilesFeedback || modelStatus) && (
          <div className="po-status po-inline" role="status" aria-live="polite">
            {profilesFeedback && <p>{t(profilesFeedback)}</p>}
            {modelStatus && <p>{t(modelStatus)}</p>}
          </div>
        )}
        <button
          type="button"
          className="po-ghost"
          disabled={saving || profilesStatus === "profilesLoading"}
          onClick={refreshProfiles}
        >
          {t(
            profilesStatus === "profilesLoading" ? "profilesLoading" : "profilesRetry",
          )}
        </button>
      </div>

      <div className="po-card">
        <div className="po-card-head">
          <h3>{t("fillTitle")}</h3>
        </div>
        <label className="po-check">
          <input
            type="checkbox"
            checked={prefs.autoApply}
            disabled={!loaded || saving}
            onChange={(event: { target: { checked: boolean } }) =>
              change({ autoApply: event.target.checked })
            }
          />
          <span>{t("autoApply")}</span>
        </label>
        <p className="po-muted">{t("autoApplyHelp")}</p>
      </div>

      <details className="po-details">
        <summary>{t("workflowTitle")}</summary>
        <div className="po-details-body">
          <p>{t("workflow")}</p>
          <p>{t("autoApplyHelp")}</p>
          <p>{t("safety")}</p>
        </div>
      </details>

      <details className="po-details">
        <summary>{t("effectiveInstructions")}</summary>
        <div className="po-details-body">
          <pre className="po-preview">{preview.text}</pre>
        </div>
      </details>

      <div className="po-card po-card-soft">
        <label className="po-check">
          <input
            type="checkbox"
            checked={settingsVisible}
            disabled={!settingsLoaded || settingsSaving}
            onChange={(event: { target: { checked: boolean } }) => {
              void toggleSettings(event.target.checked);
            }}
          />
          <span>{t("inputSettingsVisible")}</span>
        </label>
        <p className="po-muted">{t("inputSettingsHelp")}</p>
        {settingsStatus && (
          <div className="po-status po-inline" role="status">
            {t(settingsStatus)}
          </div>
        )}
        {!settingsLoaded && settingsStatus === "inputSettingsError" && (
          <button
            type="button"
            className="po-ghost"
            onClick={() => setSettingsRetry((value) => value + 1)}
          >
            {t("retry")}
          </button>
        )}
      </div>

      <footer className="po-savebar">
        {resetPending ? (
          <div className="po-confirm" role="alert">
            <p>{t("resetWarning")}</p>
            <div className="po-actions">
              <button
                type="button"
                className="po-primary"
                disabled={saving || Boolean(modelStatus)}
                onClick={() =>
                  void save({
                    ...createDefaults(t),
                    apiProfile: prefs.apiProfile,
                    model: prefs.model,
                  })
                }
              >
                {t("confirmReset")}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setResetPending(false)}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="po-savebar-body">
            <div className="po-savebar-status" role="status" aria-live="polite">
              <span className={dirty ? "po-dot po-dot-dirty" : "po-dot"} />
              <span className="po-savebar-text">
                {footerStatus}
                {dirty && status !== "unsaved" ? ` · ${t("unsaved")}` : ""}
              </span>
            </div>
            <div className="po-savebar-meta">
              <span>
                {t("apiProfile")}：{profile?.displayName ?? "—"}
              </span>
              <span>
                {t("model")}：{models.includes(prefs.model) ? prefs.model : "—"}
              </span>
            </div>
            <div className="po-actions">
              {!loaded && status === "settingsError" && (
                <button
                  type="button"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  {t("retry")}
                </button>
              )}
              <button
                type="button"
                className="po-primary"
                disabled={!loaded || saving || Boolean(modelStatus)}
                onClick={() => void save()}
              >
                {t(saving ? "saving" : "save")}
              </button>
              <button
                type="button"
                disabled={!loaded || saving}
                onClick={() => setResetPending(true)}
              >
                {t("reset")}
              </button>
            </div>
          </div>
        )}
      </footer>
    </section>
  );
}
