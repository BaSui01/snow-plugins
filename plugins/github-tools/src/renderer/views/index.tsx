import { React } from "../runtime";
import type { ToolCallApi } from "../types";
import { WRITE_KINDS } from "../config";
import type { ToolKind } from "../config";
import { isRecord } from "../parsing";
import type { Payload } from "../parsing";
import { Pagination, RawBlock } from "../presentation";
import { RepoList, RepoDetails } from "./repositories";
import { IssueDetails, IssueList } from "./issues";
import { CommitDetails, CommitList } from "./commits";
import { DirectoryList, FileView, CodeList } from "./files";
import { PullRequestDetails, PullRequestList } from "./pull-requests";
import { ArtifactDownload, ArtifactList, WorkflowRunDetails, WorkflowRunList } from "./actions";
import { WriteResult } from "./writes";

export function ResultView({
  api,
  kind,
  payload,
}: {
  api: ToolCallApi;
  kind: ToolKind;
  payload: Payload;
}): React.JSX.Element | null {
  const { t } = api;
  if (payload === null) return null;
  if (WRITE_KINDS.has(kind)) return <WriteResult api={api} kind={kind} payload={payload} />;

  const items = isRecord(payload) && Array.isArray(payload.items)
    ? payload.items.filter(isRecord)
    : null;
  const pagination = isRecord(payload) ? <Pagination t={t} payload={payload} /> : null;

  if (kind === "searchRepositories" && isRecord(payload)) {
    return <><RepoList api={api} payload={payload} />{pagination}</>;
  }
  if (kind === "getRepository" && isRecord(payload)) {
    return <RepoDetails api={api} repo={payload} />;
  }
  if (kind === "listIssues" && items) {
    return <><IssueList api={api} items={items} />{pagination}</>;
  }
  if (kind === "getIssue" && isRecord(payload)) {
    return <IssueDetails api={api} issue={payload} />;
  }
  if (kind === "listCommits" && items) {
    return <><CommitList api={api} items={items} />{pagination}</>;
  }
  if (kind === "getCommit" && isRecord(payload)) {
    return <CommitDetails api={api} commit={payload} />;
  }
  if (kind === "listPullRequests" && items) {
    return <><PullRequestList api={api} items={items} />{pagination}</>;
  }
  if (kind === "getPullRequest" && isRecord(payload)) {
    return <PullRequestDetails api={api} pullRequest={payload} />;
  }
  if (kind === "getFile") {
    if (Array.isArray(payload)) return <DirectoryList api={api} items={payload.filter(isRecord)} />;
    if (isRecord(payload) && typeof payload.text === "string") return <FileView api={api} payload={payload} />;
    return <RawBlock t={t} payload={payload} />;
  }
  if (kind === "searchCode" && isRecord(payload)) {
    return <><CodeList api={api} payload={payload} />{pagination}</>;
  }
  if (kind === "listWorkflowRuns" && items) {
    return <><WorkflowRunList api={api} items={items} />{pagination}</>;
  }
  if (kind === "getWorkflowRun" && isRecord(payload)) {
    return <WorkflowRunDetails api={api} run={payload} />;
  }
  if (kind === "listWorkflowRunArtifacts" && items) {
    return <><ArtifactList api={api} items={items} />{pagination}</>;
  }
  if (kind === "downloadWorkflowArtifact" && isRecord(payload)) {
    return <ArtifactDownload api={api} payload={payload} />;
  }
  return <RawBlock t={t} payload={payload} />;
}
