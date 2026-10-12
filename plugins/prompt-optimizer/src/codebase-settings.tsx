import { h, bindReact } from "./jsx";
import {
  PROJECT_CONTEXT_KEY,
  normalizeCodebaseContext,
  normalizeProjectContexts,
  validRelativePath,
} from "./preferences";
import type {
  PluginApi,
  PromptCodebaseContextOptions,
  ProjectContextStatus,
} from "./types";

type Props = {
  api: PluginApi;
  value: PromptCodebaseContextOptions;
  change: (value: PromptCodebaseContextOptions) => void;
  disabled: boolean;
  apiProfile: string;
  model: string;
  validity: (valid: boolean) => void;
};

/** Read-only binding/status discovery; requests here never authorize, index or search. */
export default function CodebaseSettings({
  api,
  value,
  change,
  disabled,
  apiProfile,
  model,
  validity,
}: Props) {
  const { useState, useEffect, useRef } = bindReact(api.ui.React);
  const t = (key: string) => api.t(key);
  const [binding, setBinding] = useState<ProjectContextStatus | null>(null);
  const [projectId, setProjectId] = useState("");
  const [projectScope, setProjectScope] = useState(false);
  const [override, setOverride] = useState<PromptCodebaseContextOptions | null>(
    null,
  );
  const [savedOverride, setSavedOverride] =
    useState<PromptCodebaseContextOptions | null>(null);
  const observedBinding = useRef("");
  const [overrideLoaded, setOverrideLoaded] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [revision, setRevision] = useState(0);
  const [bindingRevision, setBindingRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [paths, setPaths] = useState({ include: "", exclude: "" });
  const epoch = useRef(0);
  const lock = useRef(false);
  const effective = projectScope ? (override ?? value) : value;
  const supported =
    api.ai?.capabilities?.promptOptimization?.projectContext === 1 &&
    typeof api.ai?.getProjectContext === "function";

  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    // Runtime notifies switches, but no inputText or messages are read.
    api.metadata
      .subscribe("runtime", (response) => {
        if (!alive) return;
        const runtime = response.domains?.runtime as
          | {
              activeDirectory?: { directoryId?: string };
              chatInput?: {
                projectId?: string;
                conversationId?: string | null;
              };
            }
          | undefined;
        const id =
          runtime?.chatInput?.projectId ??
          runtime?.activeDirectory?.directoryId ??
          "";
        const stamp = JSON.stringify([id, runtime?.chatInput?.conversationId]);
        if (observedBinding.current !== stamp) {
          observedBinding.current = stamp;
          epoch.current++;
          setBinding(null);
          setOverrideLoaded(false);
          setProjectScope(false);
          setFeedback("");
          setRevision((previous) => previous + 1);
        }
      })
      .then((subscription) => {
        if (alive) unsubscribe = subscription.unsubscribe;
        else subscription.unsubscribe();
      })
      .catch(() => {});
    return () => {
      alive = false;
      epoch.current++;
      unsubscribe?.();
    };
  }, [api]);

  useEffect(() => {
    let alive = true;
    setOverrideLoaded(false);
    api.storage
      .getJson(PROJECT_CONTEXT_KEY, {})
      .then((raw) => {
        if (!alive) return;
        const saved = normalizeProjectContexts(raw)[projectId] ?? null;
        setOverride(saved);
        setSavedOverride(saved);
        setOverrideLoaded(true);
      })
      .catch(() => {
        if (alive) setFeedback("settingsError");
      });
    return () => {
      alive = false;
    };
  }, [api, projectId, revision]);

  useEffect(() => {
    let alive = true;
    const requestEpoch = ++epoch.current;
    setBinding(null);
    if (supported)
      api.ai!.getProjectContext!({
        apiProfile,
        model,
        codebaseContext: effective,
      })
        .then((result) => {
          if (alive && epoch.current === requestEpoch) {
            setBinding(result);
            setProjectId(result.projectId);
            setFeedback((previous) =>
              previous === "contextReason.error" ? "" : previous,
            );
          }
        })
        .catch(() => {
          if (alive && epoch.current === requestEpoch)
            setFeedback("contextReason.error");
        });
    return () => {
      alive = false;
    };
  }, [
    api,
    supported,
    projectId,
    effective,
    revision,
    bindingRevision,
    apiProfile,
    model,
  ]);

  useEffect(() => {
    setPaths((previous) => {
      const include = (effective.includePaths ?? []).join("\n");
      const exclude = (effective.excludePaths ?? []).join("\n");
      return {
        include:
          parse(previous.include).join("\n") === include
            ? previous.include
            : include,
        exclude:
          parse(previous.exclude).join("\n") === exclude
            ? previous.exclude
            : exclude,
      };
    });
  }, [effective, projectScope, projectId]);

  const update = (patch: Partial<PromptCodebaseContextOptions>) => {
    const next = { ...effective, ...patch };
    if (projectScope) {
      setOverride(next);
      setFeedback("unsaved");
    } else change(next);
  };
  const parse = (text: string) =>
    text
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean);
  const pathsValid = [...parse(paths.include), ...parse(paths.exclude)].every(
    validRelativePath,
  );
  useEffect(() => {
    validity(projectScope || pathsValid);
    return () => validity(true);
  }, [projectScope, pathsValid]);
  const updatePaths = (key: "include" | "exclude", text: string) => {
    const next = { ...paths, [key]: text };
    setPaths(next);
    if (
      [...parse(next.include), ...parse(next.exclude)].every(validRelativePath)
    ) {
      update({
        includePaths: parse(next.include),
        excludePaths: parse(next.exclude),
      });
    }
  };
  const saveProject = async (inherit = false) => {
    if (
      !projectId ||
      binding?.projectId !== projectId ||
      !overrideLoaded ||
      lock.current ||
      !pathsValid
    )
      return;
    lock.current = true;
    setBusy(true);
    const id = projectId,
      requestEpoch = epoch.current;
    try {
      const map = normalizeProjectContexts(
        await api.storage.getJson(PROJECT_CONTEXT_KEY, {}),
      );
      if (epoch.current !== requestEpoch) return;
      if (inherit) delete map[id];
      else
        map[id] = normalizeCodebaseContext({
          ...effective,
          includePaths: parse(paths.include),
          excludePaths: parse(paths.exclude),
        });
      await api.storage.setJson(PROJECT_CONTEXT_KEY, map);
      if (epoch.current === requestEpoch) {
        setFeedback("saved");
        setRevision((previous) => previous + 1);
      }
    } catch {
      if (epoch.current === requestEpoch) setFeedback("settingsError");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const revoke = async () => {
    if (lock.current || !api.ai?.revokeProjectContextAccess) return;
    lock.current = true;
    setBusy(true);
    const requestEpoch = epoch.current;
    try {
      const revoked = await api.ai.revokeProjectContextAccess({
        apiProfile,
        model,
        codebaseContext: effective,
      });
      if (requestEpoch === epoch.current) {
        setFeedback(revoked ? "codebaseRevoked" : "contextReason.error");
        setBindingRevision((previous) => previous + 1);
      }
    } catch {
      if (requestEpoch === epoch.current) setFeedback("contextReason.error");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const unavailable =
    disabled ||
    busy ||
    (projectScope && (!overrideLoaded || binding?.projectId !== projectId));
  return (
    <div className="po-card">
      <h3>{t("codebaseTitle")}</h3>
      <p className="po-disclosure">{t("codebasePrivacy")}</p>
      {!supported && (
        <p className="po-status po-warning">{t("codebaseUnsupported")}</p>
      )}
      <p className="po-muted">
        {binding
          ? `${binding.projectName ?? binding.projectId ?? "—"} · ${t(`contextReason.${binding.status}`)} · ${t(binding.authorized ? "codebaseAuthorized" : "codebaseUnauthorized")}`
          : t("codebaseStatusUnknown")}
      </p>
      {binding?.services.map((service) => (
        <p className="po-muted" key={service.kind}>
          {t(`service.${service.kind}`)}: {service.label}
        </p>
      ))}
      <label className="po-field">
        <span>{t("codebaseScope")}</span>
        <select
          value={projectScope ? "project" : "global"}
          disabled={disabled || busy}
          onChange={(event: { target: { value: string } }) => {
            setOverride(savedOverride);
            setProjectScope(event.target.value === "project");
            setFeedback("");
          }}
        >
          <option value="global">{t("codebaseGlobal")}</option>
          <option
            value="project"
            disabled={
              !projectId || binding?.projectId !== projectId || !overrideLoaded
            }
          >
            {t("codebaseProject")}
          </option>
        </select>
      </label>
      <p className="po-muted">{t("codebaseScopeHelp")}</p>
      <div className="po-grid">
        {(["mode", "budget", "planner"] as const).map((key) => (
          <label className="po-field" key={key}>
            <span>{t(`codebase.${key}`)}</span>
            <select
              value={effective[key]}
              disabled={unavailable}
              onChange={(event: { target: { value: string } }) =>
                update({
                  [key]: event.target.value,
                } as Partial<PromptCodebaseContextOptions>)
              }
            >
              {(key === "mode"
                ? ["off", "auto", "always"]
                : key === "budget"
                  ? ["fast", "balanced"]
                  : ["local", "model"]
              ).map((option) => (
                <option key={option} value={option}>
                  {t(`codebase.${key}.${option}`)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="po-muted">{t("codebaseModeHelp")}</p>
      {(["rerank", "reviewSources"] as const).map((key) => (
        <label className="po-check" key={key}>
          <input
            type="checkbox"
            checked={effective[key]}
            disabled={unavailable}
            onChange={(event: { target: { checked: boolean } }) =>
              update({ [key]: event.target.checked })
            }
          />
          <span>{t(`codebase.${key}`)}</span>
        </label>
      ))}
      <p className="po-muted">{t("codebaseReviewHelp")}</p>
      {(["include", "exclude"] as const).map((key) => (
        <label className="po-field" key={key}>
          <span>{t(`codebase.${key}Paths`)}</span>
          <textarea
            rows={3}
            value={paths[key]}
            disabled={unavailable}
            spellCheck={false}
            aria-invalid={!pathsValid}
            onChange={(event: { target: { value: string } }) =>
              updatePaths(key, event.target.value)
            }
          />
        </label>
      ))}
      <p className={pathsValid ? "po-muted" : "po-status po-warning"}>
        {t(pathsValid ? "codebasePathsHelp" : "codebasePathsInvalid")}
      </p>
      {projectScope && (
        <div className="po-actions">
          <button
            disabled={unavailable || !pathsValid}
            onClick={() => void saveProject()}
          >
            {t("codebaseSaveProject")}
          </button>
          <button disabled={unavailable} onClick={() => void saveProject(true)}>
            {t("codebaseInherit")}
          </button>
        </div>
      )}
      <button
        type="button"
        disabled={busy || !supported}
        onClick={() => setBindingRevision((previous) => previous + 1)}
      >
        {t("codebaseRefresh")}
      </button>
      <button
        type="button"
        disabled={
          busy || !binding?.projectId || !api.ai?.revokeProjectContextAccess
        }
        onClick={() => void revoke()}
      >
        {t("codebaseRevoke")}
      </button>
      {!binding?.projectId && (
        <p className="po-muted">{t("codebaseRevokeUnavailable")}</p>
      )}
      {feedback && (
        <p className="po-status" role="status">
          {t(feedback)}
        </p>
      )}
    </div>
  );
}
