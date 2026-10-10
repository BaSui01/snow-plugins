// Generated from src/ by scripts/build.mjs — edit the TypeScript sources, not this file.

// src/preferences.ts
var STRATEGIES = {
  faithful: "Improve clarity conservatively. Clarify ambiguity only when supported by the draft or reference context; otherwise preserve it. Preserve all intent, facts, constraints and uncertainty; never add requirements.",
  structured: "Organize the task's existing objectives, context, constraints and output requirements into a coherent order. Follow the presentation preference rather than imposing headings. Omit missing information instead of inventing it.",
  concise: "Remove repetition and redundant wording while preserving every meaningful requirement, qualifier, fact and uncertainty.",
  custom: "Use the user's optimization instructions without adding an extra preset strategy."
};
var LENGTHS = {
  preserve: "Keep the result approximately as long as the draft where practical; never discard valid constraints to hit a length target.",
  expand: "Expand only to explain existing intent or constraints more clearly. Do not add facts, examples, requirements or assumptions.",
  concise: "Prefer the shortest wording that retains the full intent and all valid constraints."
};
var STRUCTURES = {
  natural: "Use clear natural-language paragraphs, with no unnecessary template headings.",
  structured: "Use concise sections or bullets for the information that actually exists. Omit empty or unevidenced sections."
};
var CONTEXT_MODES = ["recent", "draft"];
var PROMPT_LIMIT = 7e3;
var INSTRUCTIONS_LIMIT = 8e3;
var PROMPT_INPUT_MAX = PROMPT_LIMIT * 2;
var PREFERENCES_KEY = "preferences";
var INPUT_SETTINGS_KEY = "inputSettingsVisible";
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var hasOwn = (source, key) => Object.hasOwn(source, key);
var createDefaults = (t) => ({
  apiProfile: "",
  strategy: "faithful",
  optimizationPrompt: t("defaultPrompt"),
  contextMode: "recent",
  contextRounds: 3,
  model: "",
  length: "preserve",
  structure: "natural",
  autoApply: true
});
var asString = (value) => typeof value === "string" ? value : "";
var normalizePreferences = (t, raw) => {
  const value = isRecord(raw) ? raw : {};
  const base = createDefaults(t);
  return {
    ...base,
    strategy: hasOwn(STRATEGIES, asString(value.strategy)) ? value.strategy : base.strategy,
    optimizationPrompt: typeof value.optimizationPrompt === "string" ? value.optimizationPrompt : base.optimizationPrompt,
    contextMode: CONTEXT_MODES.includes(value.contextMode) ? value.contextMode : base.contextMode,
    contextRounds: Number.isInteger(value.contextRounds) ? Math.max(1, Math.min(10, value.contextRounds)) : base.contextRounds,
    apiProfile: typeof value.apiProfile === "string" ? value.apiProfile : base.apiProfile,
    model: typeof value.model === "string" ? value.model : base.model,
    length: hasOwn(LENGTHS, asString(value.length)) ? value.length : base.length,
    structure: hasOwn(STRUCTURES, asString(value.structure)) ? value.structure : base.structure,
    autoApply: typeof value.autoApply === "boolean" ? value.autoApply : base.autoApply
  };
};
var InstructionBuildError = class extends Error {
  reason;
  constructor(reason) {
    super(reason);
    this.name = "InstructionBuildError";
    this.reason = reason;
  }
};
var countCodePoints = (text) => Array.from(text).length;
var buildInstructions = (preferences, hasImages = false) => {
  const prompt = preferences.optimizationPrompt.trim();
  if (!prompt) {
    throw new InstructionBuildError("promptRequired");
  }
  if (countCodePoints(preferences.optimizationPrompt) > PROMPT_LIMIT) {
    throw new InstructionBuildError("settingsTooLong");
  }
  const parts = [
    "Apply these preferences together: the strategy sets the editing focus, length sets detail, and presentation sets the format. Preserve all meaningful constraints and uncertainty before style or length targets; do not pad the result just to preserve length."
  ];
  if (hasImages) {
    parts.push(
      "Attachment context:\nThe user attached one or more images/screenshots with this draft. Preserve and clarify any references to the visual attachments (such as 'as shown in the screenshot', 'the attached image', UI elements, or error callouts), ensuring the rewritten prompt clearly guides the model to inspect them. Do not remove, contradict, or obscure references to the visual input."
    );
  }
  parts.push(
    "Optimization rules:\n" + prompt,
    "Selected strategy:\n" + STRATEGIES[preferences.strategy],
    "Length preference:\n" + LENGTHS[preferences.length],
    "Presentation preference:\n" + STRUCTURES[preferences.structure]
  );
  const text = parts.join("\n\n");
  if (countCodePoints(text) > INSTRUCTIONS_LIMIT) {
    throw new InstructionBuildError("settingsTooLong");
  }
  return text;
};
var previewInstructions = (t, preferences) => {
  try {
    return { text: buildInstructions(preferences), error: "" };
  } catch (error) {
    if (error instanceof InstructionBuildError) {
      return { text: t(error.reason), error: error.reason };
    }
    return { text: t("settingsTooLong"), error: "settingsTooLong" };
  }
};

// src/profiles.ts
var readProfiles = async (api) => {
  let response;
  try {
    response = await api.metadata.get("apiProfiles");
  } catch {
    throw new Error(api.t("profilesError"));
  }
  const profiles = response?.domains?.apiProfiles;
  const invalid = response?.denied?.apiProfiles !== void 0 || !Array.isArray(profiles) || profiles.some(
    (profile) => !profile || typeof profile.profileName !== "string" || !profile.profileName.trim()
  );
  if (invalid) {
    throw new Error(api.t("profilesError"));
  }
  return profiles.map((profile) => {
    const profileName = profile.profileName;
    const displayName = typeof profile.displayName === "string" && profile.displayName.trim() ? profile.displayName : profileName;
    const models = [profile.basicModel, profile.advancedModel].filter(
      (model) => typeof model === "string" && !!model.trim()
    );
    return {
      profileName,
      displayName,
      isActive: profile.isActive === true,
      basicModel: typeof profile.basicModel === "string" && profile.basicModel.trim() ? profile.basicModel : "",
      models: [...new Set(models)]
    };
  });
};
var selectionError = (profiles, selection) => {
  if (!profiles.length) return "profilesEmpty";
  if (!selection.apiProfile && !selection.model) {
    const active = profiles.filter((item) => item.isActive);
    if (active.length !== 1) return "activeProfileUnavailable";
    const fallback = active[0];
    if (!fallback?.basicModel) return "basicModelUnavailable";
  }
  const profile = profiles.find(
    (item) => item.profileName === selection.apiProfile
  );
  if (!profile) return selection.apiProfile ? "profileInvalid" : "profileRequired";
  if (!profile.models.length) return "modelsEmpty";
  if (!profile.models.includes(selection.model)) {
    return selection.model ? "modelInvalid" : "modelRequired";
  }
  return "";
};
var isRuntimeSupported = (api) => {
  const granted = new Set(
    (api.write?.domains() ?? []).flatMap(
      (domain) => domain.actions.filter((action) => action.granted).map((action) => action.id)
    )
  );
  return typeof api.ai?.optimizePrompt === "function" && ["chatInput.captureDraft", "chatInput.applyDraft", "chatInput.restoreDraft"].every(
    (id) => granted.has(id)
  );
};

// src/action.ts
var cancelled = () => new DOMException("Optimization cancelled", "AbortError");
var checkActive = (signal) => {
  if (signal.aborted) throw cancelled();
};
var isAbort = (error) => error?.name === "AbortError";
var silentFailure = () => new Error("");
async function optimizeDraft(context) {
  context.onStatus("");
  try {
    return await runOptimization(context);
  } catch (error) {
    context.onStatus("");
    if (isAbort(error)) throw error;
    context.api.log?.("optimizeDraft failed:", error);
    throw silentFailure();
  }
}
async function runOptimization({
  api,
  signal
}) {
  if (!isRuntimeSupported(api)) throw new Error(api.t("unavailable"));
  checkActive(signal);
  let prefs;
  try {
    prefs = normalizePreferences(
      (key) => api.t(key),
      await api.storage.getJson(PREFERENCES_KEY, {})
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
  const draft = captured.data;
  if (typeof draft.draftToken !== "string" || !draft.draftToken) {
    throw new Error(api.t("captureError"));
  }
  if (!draft.text?.trim()) throw new Error(api.t("empty"));
  const hasImages = typeof draft.inputText === "string" && draft.inputText.includes("@@image:");
  const optimizationInstructions = buildInstructions(prefs, hasImages);
  const includeContext = prefs.contextMode === "recent" && Boolean(draft.conversationId);
  checkActive(signal);
  let output;
  try {
    const optimize = api.ai?.optimizePrompt;
    if (!optimize) throw new Error(api.t("unavailable"));
    output = await optimize({
      draft: draft.text,
      conversationId: draft.conversationId ?? void 0,
      apiProfile: prefs.apiProfile,
      model: prefs.model,
      contextRounds: prefs.contextRounds,
      includeContext,
      optimizationInstructions,
      signal
    });
  } catch (error) {
    if (signal.aborted || error?.name === "AbortError") {
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
  const apply = async () => {
    checkActive(signal);
    if (used) return { preview };
    used = true;
    let applied;
    try {
      applied = await write.run("chatInput.applyDraft", {
        draftToken: draft.draftToken,
        text: preview
      });
    } catch {
      checkActive(signal);
      return { preview };
    }
    checkActive(signal);
    const restoreToken = applied.data?.restoreToken;
    if (!applied.ok || typeof restoreToken !== "string") {
      return { preview };
    }
    let restored = false;
    return {
      undo: async () => {
        checkActive(signal);
        if (restored) throw silentFailure();
        restored = true;
        const response = await write.run("chatInput.restoreDraft", {
          restoreToken
        });
        if (!response.ok) throw silentFailure();
      }
    };
  };
  return prefs.autoApply ? await apply() : { preview, apply };
}

// src/jsx.ts
var react = null;
var bindReact = (value) => {
  react = value;
  return value;
};
var getReact = () => {
  if (!react) {
    throw new Error("Plugin React runtime is unavailable");
  }
  return react;
};
var h = (type, props, ...children) => getReact().createElement(type, props, ...children);

// src/panel.tsx
function PromptOptimizerSettings({ api }) {
  const { useState, useEffect, useRef } = bindReact(api.ui.React);
  const t = (key, options) => api.t(key, options);
  const [prefs, setPrefs] = useState(() => createDefaults(t));
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("loading");
  const [dirty, setDirty] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [profilesStatus, setProfilesStatus] = useState("profilesLoading");
  const [profilesFeedback, setProfilesFeedback] = useState("");
  const [profilesRetry, setProfilesRetry] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [settingsRetry, setSettingsRetry] = useState(0);
  const mounted = useRef(false);
  const saveLock = useRef(false);
  const profilesLock = useRef(false);
  const settingsLock = useRef(false);
  const [hasConversation, setHasConversation] = useState(false);
  const [boundMessageCount, setBoundMessageCount] = useState(0);
  useEffect(() => {
    let alive = true;
    let subscription = null;
    api.metadata.subscribe("runtime", (response) => {
      if (!alive) return;
      const runtime = response?.domains?.runtime;
      const bound = Boolean(runtime?.chatInput?.conversationId);
      setHasConversation(bound);
      const focused = runtime?.conversation;
      setBoundMessageCount(
        bound && focused?.conversationId === runtime?.chatInput?.conversationId ? focused?.messageCount ?? 0 : 0
      );
    }).then((value) => {
      if (alive) subscription = value;
      else value.unsubscribe();
    }).catch(() => {
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
    api.storage.getJson(PREFERENCES_KEY, {}).then((value) => {
      if (!alive) return;
      setPrefs(normalizePreferences(t, value));
      setLoaded(true);
      setStatus("ready");
    }).catch(() => {
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
    api.storage.getJson(INPUT_SETTINGS_KEY, false).then((value) => {
      if (!alive) return;
      setSettingsVisible(value === true);
      setSettingsLoaded(true);
      setSettingsStatus("");
    }).catch(() => {
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
    readProfiles(api).then((items) => {
      if (!alive) return;
      setProfiles(items);
      setProfilesStatus("");
      setProfilesFeedback(profilesRetry ? "profilesReloaded" : "");
    }).catch(() => {
      if (!alive) return;
      setProfiles([]);
      setProfilesStatus("profilesError");
    }).finally(() => {
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
    setPrefs(
      (previous) => previous.apiProfile || previous.model ? previous : { ...previous, apiProfile: candidate.profileName, model: candidate.basicModel }
    );
    setDirty(true);
    setStatus("unsaved");
  }, [loaded, profilesStatus, profiles, prefs.apiProfile, prefs.model]);
  const change = (patch) => {
    setPrefs((previous) => ({ ...previous, ...patch }));
    setDirty(true);
    setStatus("unsaved");
  };
  const toggleSettings = async (visible) => {
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
  const refreshProfiles = () => {
    if (saveLock.current || profilesLock.current) return;
    profilesLock.current = true;
    setProfilesStatus("profilesLoading");
    setProfilesFeedback("");
    setProfilesRetry((value) => value + 1);
  };
  const save = async (value = prefs) => {
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
        error instanceof InstructionBuildError && error.reason === "promptRequired" ? "promptRequired" : "settingsTooLong"
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
  const renderableIcon = typeof brandIcon === "function" || typeof brandIcon === "object" && brandIcon !== null;
  const contextHint = prefs.contextMode === "draft" ? { key: "contextHintDraft", warn: false } : !hasConversation ? { key: "contextHintNoSession", warn: true } : boundMessageCount === 0 ? { key: "contextHintEmptySession", warn: true } : {
    key: "contextHintRecent",
    values: {
      rounds: prefs.contextRounds,
      messages: boundMessageCount
    },
    warn: false
  };
  const select = (key, values) => /* @__PURE__ */ h(
    "select",
    {
      value: String(prefs[key]),
      disabled: !loaded || saving,
      onChange: (event) => change({ [key]: event.target.value })
    },
    values.map((value) => /* @__PURE__ */ h("option", { key: value, value }, t(`${String(key)}.${value}`)))
  );
  const footerStatus = saving ? t("saving") : modelStatus ? t(modelStatus) : t(status);
  return /* @__PURE__ */ h(
    "section",
    {
      className: "snow-po-settings",
      "aria-label": t("title"),
      "aria-busy": busy
    },
    /* @__PURE__ */ h("header", { className: "po-header" }, /* @__PURE__ */ h("span", { className: "po-icon", "aria-hidden": "true" }, renderableIcon ? h(brandIcon, { size: 20 }) : "✦"), /* @__PURE__ */ h("div", { className: "po-header-text" }, /* @__PURE__ */ h("h2", null, t("title")), /* @__PURE__ */ h("p", { className: "po-muted" }, t("ready")))),
    !supported && /* @__PURE__ */ h("div", { className: "po-status po-warning", role: "alert" }, t("unavailable")),
    /* @__PURE__ */ h("p", { className: "po-disclosure" }, t("privacy")),
    /* @__PURE__ */ h("div", { className: "po-card" }, /* @__PURE__ */ h("div", { className: "po-card-head" }, /* @__PURE__ */ h("h3", null, t("rulesTitle")), /* @__PURE__ */ h("p", { className: "po-muted" }, t("strategyHelp"))), /* @__PURE__ */ h("label", { className: "po-field" }, /* @__PURE__ */ h("span", null, t("strategy")), select("strategy", Object.keys(STRATEGIES))), /* @__PURE__ */ h("label", { className: "po-field" }, /* @__PURE__ */ h("span", { className: "po-label" }, /* @__PURE__ */ h("span", null, t("optimizationPrompt")), /* @__PURE__ */ h("span", { className: "po-counter" + (overLimit ? " po-over-limit" : "") }, count, " / ", PROMPT_LIMIT, " · ", t("codePoints"))), /* @__PURE__ */ h(
      "textarea",
      {
        value: prefs.optimizationPrompt,
        disabled: !loaded || saving,
        maxLength: PROMPT_INPUT_MAX,
        rows: 7,
        spellCheck: false,
        "aria-invalid": overLimit,
        onChange: (event) => change({ optimizationPrompt: event.target.value })
      }
    )), /* @__PURE__ */ h("p", { className: "po-muted" }, t("promptHelp")), /* @__PURE__ */ h("div", { className: "po-grid" }, /* @__PURE__ */ h("label", { className: "po-field" }, /* @__PURE__ */ h("span", null, t("length")), select("length", Object.keys(LENGTHS))), /* @__PURE__ */ h("label", { className: "po-field" }, /* @__PURE__ */ h("span", null, t("structure")), select("structure", Object.keys(STRUCTURES))))),
    /* @__PURE__ */ h("div", { className: "po-card" }, /* @__PURE__ */ h("div", { className: "po-card-head" }, /* @__PURE__ */ h("h3", null, t("contextTitle"))), /* @__PURE__ */ h("div", { className: "po-grid" }, /* @__PURE__ */ h("label", { className: "po-field" }, /* @__PURE__ */ h("span", null, t("contextMode")), select("contextMode", CONTEXT_MODES)), prefs.contextMode === "recent" && /* @__PURE__ */ h("label", { className: "po-field" }, /* @__PURE__ */ h("span", null, t("rounds")), /* @__PURE__ */ h(
      "input",
      {
        type: "number",
        min: 1,
        max: 10,
        step: 1,
        value: prefs.contextRounds,
        disabled: !loaded || saving,
        onChange: (event) => change({
          contextRounds: Math.max(
            1,
            Math.min(10, Math.trunc(Number(event.target.value) || 1))
          )
        })
      }
    ))), /* @__PURE__ */ h(
      "p",
      {
        className: "po-hint" + (contextHint.warn ? " po-hint-warn" : ""),
        role: "status",
        "aria-live": "polite"
      },
      /* @__PURE__ */ h("span", { className: "po-hint-dot", "aria-hidden": "true" }),
      /* @__PURE__ */ h("span", null, t(contextHint.key, { values: contextHint.values }))
    ), /* @__PURE__ */ h("div", { className: "po-grid" }, /* @__PURE__ */ h("label", { className: "po-field" }, /* @__PURE__ */ h("span", null, t("apiProfile")), /* @__PURE__ */ h(
      "select",
      {
        value: profile ? prefs.apiProfile : "",
        disabled: !loaded || saving || Boolean(profilesStatus) || !profiles.length,
        onChange: (event) => {
          const selected = profiles.find(
            (item) => item.profileName === event.target.value
          );
          if (selected) {
            change({
              apiProfile: selected.profileName,
              model: selected.basicModel
            });
          }
        }
      },
      /* @__PURE__ */ h("option", { value: "", disabled: true }, t("profileRequired")),
      profiles.map((item) => /* @__PURE__ */ h("option", { key: item.profileName, value: item.profileName }, item.displayName))
    )), /* @__PURE__ */ h("label", { className: "po-field" }, /* @__PURE__ */ h("span", null, t("model")), /* @__PURE__ */ h(
      "select",
      {
        value: models.includes(prefs.model) ? prefs.model : "",
        disabled: !loaded || saving || Boolean(profilesStatus) || !models.length,
        onChange: (event) => {
          if (models.includes(event.target.value)) {
            change({ model: event.target.value });
          }
        }
      },
      /* @__PURE__ */ h("option", { value: "", disabled: true }, t("modelRequired")),
      models.map((model) => /* @__PURE__ */ h("option", { key: model, value: model }, model))
    ))), (profilesFeedback || modelStatus) && /* @__PURE__ */ h("div", { className: "po-status po-inline", role: "status", "aria-live": "polite" }, profilesFeedback && /* @__PURE__ */ h("p", null, t(profilesFeedback)), modelStatus && /* @__PURE__ */ h("p", null, t(modelStatus))), /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        className: "po-ghost",
        disabled: saving || profilesStatus === "profilesLoading",
        onClick: refreshProfiles
      },
      t(
        profilesStatus === "profilesLoading" ? "profilesLoading" : "profilesRetry"
      )
    )),
    /* @__PURE__ */ h("div", { className: "po-card" }, /* @__PURE__ */ h("div", { className: "po-card-head" }, /* @__PURE__ */ h("h3", null, t("fillTitle"))), /* @__PURE__ */ h("label", { className: "po-check" }, /* @__PURE__ */ h(
      "input",
      {
        type: "checkbox",
        checked: prefs.autoApply,
        disabled: !loaded || saving,
        onChange: (event) => change({ autoApply: event.target.checked })
      }
    ), /* @__PURE__ */ h("span", null, t("autoApply"))), /* @__PURE__ */ h("p", { className: "po-muted" }, t("autoApplyHelp"))),
    /* @__PURE__ */ h("details", { className: "po-details" }, /* @__PURE__ */ h("summary", null, t("workflowTitle")), /* @__PURE__ */ h("div", { className: "po-details-body" }, /* @__PURE__ */ h("p", null, t("workflow")), /* @__PURE__ */ h("p", null, t("autoApplyHelp")), /* @__PURE__ */ h("p", null, t("safety")))),
    /* @__PURE__ */ h("details", { className: "po-details" }, /* @__PURE__ */ h("summary", null, t("effectiveInstructions")), /* @__PURE__ */ h("div", { className: "po-details-body" }, /* @__PURE__ */ h("pre", { className: "po-preview" }, preview.text))),
    /* @__PURE__ */ h("div", { className: "po-card po-card-soft" }, /* @__PURE__ */ h("label", { className: "po-check" }, /* @__PURE__ */ h(
      "input",
      {
        type: "checkbox",
        checked: settingsVisible,
        disabled: !settingsLoaded || settingsSaving,
        onChange: (event) => {
          void toggleSettings(event.target.checked);
        }
      }
    ), /* @__PURE__ */ h("span", null, t("inputSettingsVisible"))), /* @__PURE__ */ h("p", { className: "po-muted" }, t("inputSettingsHelp")), settingsStatus && /* @__PURE__ */ h("div", { className: "po-status po-inline", role: "status" }, t(settingsStatus)), !settingsLoaded && settingsStatus === "inputSettingsError" && /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        className: "po-ghost",
        onClick: () => setSettingsRetry((value) => value + 1)
      },
      t("retry")
    )),
    /* @__PURE__ */ h("footer", { className: "po-savebar" }, resetPending ? /* @__PURE__ */ h("div", { className: "po-confirm", role: "alert" }, /* @__PURE__ */ h("p", null, t("resetWarning")), /* @__PURE__ */ h("div", { className: "po-actions" }, /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        className: "po-primary",
        disabled: saving || Boolean(modelStatus),
        onClick: () => void save({
          ...createDefaults(t),
          apiProfile: prefs.apiProfile,
          model: prefs.model
        })
      },
      t("confirmReset")
    ), /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        disabled: saving,
        onClick: () => setResetPending(false)
      },
      t("cancel")
    ))) : /* @__PURE__ */ h("div", { className: "po-savebar-body" }, /* @__PURE__ */ h("div", { className: "po-savebar-status", role: "status", "aria-live": "polite" }, /* @__PURE__ */ h("span", { className: dirty ? "po-dot po-dot-dirty" : "po-dot" }), /* @__PURE__ */ h("span", { className: "po-savebar-text" }, footerStatus, dirty && status !== "unsaved" ? ` · ${t("unsaved")}` : "")), /* @__PURE__ */ h("div", { className: "po-savebar-meta" }, /* @__PURE__ */ h("span", null, t("apiProfile"), "：", profile?.displayName ?? "—"), /* @__PURE__ */ h("span", null, t("model"), "：", models.includes(prefs.model) ? prefs.model : "—")), /* @__PURE__ */ h("div", { className: "po-actions" }, !loaded && status === "settingsError" && /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        onClick: () => setRetry((value) => value + 1)
      },
      t("retry")
    ), /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        className: "po-primary",
        disabled: !loaded || saving || Boolean(modelStatus),
        onClick: () => void save()
      },
      t(saving ? "saving" : "save")
    ), /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        disabled: !loaded || saving,
        onClick: () => setResetPending(true)
      },
      t("reset")
    ))))
  );
}
export {
  PromptOptimizerSettings as default,
  optimizeDraft
};
