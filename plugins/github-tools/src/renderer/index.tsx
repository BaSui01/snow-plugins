import { React, useMemo } from "./runtime";
import type { ToolCallApi, ToolCallContext, ToolCallInfo } from "./types";
import { TOOL_KINDS, TOOL_CATEGORIES, summarize } from "./config";
import type { ToolKind } from "./config";
import { asNumber, errorText, isRecord, parseArgs, parseJson, unwrapResult } from "./parsing";
import { HostIcon, Params, SectionTitle } from "./presentation";
import { ResultView } from "./views";

/** 使用宿主 ToolCallNode 与 React，按领域渲染当前工具调用快照。 */
function GitHubCard({
  api,
  toolCall,
  kind,
}: {
  api: ToolCallApi;
  toolCall: ToolCallInfo;
  kind: ToolKind;
}): React.JSX.Element {
  const { t } = api;
  const { ToolCallNode, localizeToolError } = api.ui;
  const args = useMemo(() => parseArgs(toolCall.arguments), [toolCall.arguments]);
  const rawResult = useMemo(() => parseJson(toolCall.result), [toolCall.result]);
  const payload = useMemo(() => unwrapResult(rawResult), [rawResult]);
  const failed =
    toolCall.status === "error" ||
    (isRecord(rawResult) && rawResult.isError === true);
  const rejectedMerge =
    kind === "mergePullRequest" &&
    isRecord(payload) &&
    payload.merged === false;
  const message = failed ? localizeToolError(t, errorText(payload)) : "";
  const total = isRecord(payload) ? asNumber(payload.total_count) : null;
  const count =
    total ??
    (Array.isArray(payload)
      ? payload.length
      : isRecord(payload) && Array.isArray(payload.items)
        ? payload.items.length
        : undefined);
  const summary = summarize(t, kind, args);

  return (
    <ToolCallNode
      toolName={toolCall.name}
      badgeName={t(`github.tool.${kind}`)}
      category={TOOL_CATEGORIES[kind]}
      status={failed || rejectedMerge ? "error" : toolCall.status}
      displayName={summary}
      displayNameTitle={summary}
      meta={
        count !== undefined ? (
          <span className="gh-count gh-head-count">
            {t("github.result.count", { values: { count } })}
          </span>
        ) : null
      }
      className="gh-tool-card"
      lazyBody
    >
      <div className="gh-body">
        <Params t={t} kind={kind} args={args} />
        {failed ? (
          <div className="gh-error">
            <HostIcon api={api} name="AlertCircle" size={12} />
            <span>{message || t("github.error")}</span>
          </div>
        ) : payload === null ? (
          <div className={`gh-empty${toolCall.status === "running" ? " gh-running" : ""}`}>
            <HostIcon
              api={api}
              name={toolCall.status === "running" ? "LoaderCircle" : "Clock"}
              size={14}
            />
            <span>
              {toolCall.status === "running"
                ? t("github.result.running")
                : toolCall.status === "pending"
                  ? t("github.result.pending")
                  : t("github.result.empty")}
            </span>
          </div>
        ) : (
          <section className="gh-results" aria-label={t("github.result.title")}>
            <SectionTitle>{t("github.result.title")}</SectionTitle>
            <ResultView api={api} kind={kind} payload={payload} />
          </section>
        )}
      </div>
    </ToolCallNode>
  );
}

/** 同步工厂：返回组件子树，钩子留在宿主 React 上下文内。 */
export function renderGitHubTool(
  api: ToolCallApi,
  context: ToolCallContext,
): React.ReactNode | null {
  if (
    api.signal.aborted ||
    api.ui.toolCallRendererVersion !== 1 ||
    api.ui.React !== React ||
    context.slot !== "tool-call"
  )
    return null;
  const originalToolName = context.toolCall.originalToolName;
  const kind = originalToolName ? TOOL_KINDS[originalToolName] : undefined;
  if (!kind) return null;
  return <GitHubCard api={api} toolCall={context.toolCall} kind={kind} />;
}
