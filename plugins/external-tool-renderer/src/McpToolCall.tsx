import { React } from "./runtime";
import { useApi, Globe, ExternalLink, FileText, CheckCircle2 } from "./api";
import type { ToolCallInfo, Translate } from "./types";
import type { Provider } from "./providers";
import { PAGE_SIZE, BINARY, HIDDEN, candidates, inlineImage, isRecord, parseJson, parseMcp, preview, safeText, safeUrl, searchGroups } from "./mcp";
import type { ContentBlock } from "./mcp";
import { exaParameters, exaView } from "./Exa";
import { parseSearchFeed } from "./searchFeeds";
import { providerSummary } from "./summaries";
import { checklistFromRecords, parseDiff, parseLogs, parseSnapshot, parseTree, progressFromRecords, treeFromRecords } from "./shapes";
import { ChecklistView, DiffView, LogView, ProgressView, SnapshotView, TreeView } from "./ShapeViews";
import {
  Pager,
  SafeLink,
  TextValue,
  Value,
  ParamTable,
  OutputSection,
  hostOf,
  shortStamp,
} from "./components";

// MCP text parts carry transport metadata beside the text (`_meta`, annotations).
// Show the text directly plus flat scalar metadata, so a raw block does not open
// with an extra "{ } · 2 项" fold. Structured metadata stays in the generic tree.
function textMeta(value: Record<string, unknown>): [string, string][] | null {
  const rows: [string, string][] = [];
  for (const [key, item] of Object.entries(value)) {
    if (key === "text") continue;
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      rows.push([key, preview(item, key)]);
      continue;
    }
    if (!isRecord(item)) return null;
    for (const [child, leaf] of Object.entries(item)) {
      if (typeof leaf !== "string" && typeof leaf !== "number" && typeof leaf !== "boolean") return null;
      rows.push([`${key}.${child}`, preview(leaf, child)]);
    }
  }
  return rows;
}

function BlockValue({ value }: { value: unknown }) {
  if (isRecord(value) && typeof value.text === "string") {
    const meta = textMeta(value);
    if (meta) {
      return <div className="mcp-text-part">
        <TextValue value={value.text} />
        {meta.length > 0 && <div className="mcp-text-meta">{meta.map(([label, text]) => <span key={label}><b>{label}</b>{text}</span>)}</div>}
      </div>;
    }
  }
  return <Value value={value} />;
}

function ImageBlock({ value }: { value: unknown }) {
  const { t } = useApi();
  // Consent belongs to this exact immutable block, not to a reused component slot.
  const [revealed, setRevealed] = React.useState<unknown>(null);
  const [failedValue, setFailedValue] = React.useState<unknown>(null);
  const shown = revealed === value;
  const broken = failedValue === value;
  const image = React.useMemo(() => inlineImage(value), [value]);
  const metadata = isRecord(value) ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "data")) : value;
  return <div className="mcp-image">
    <Value value={metadata} />
    {!image || broken ? <span className="mcp-muted">{t("toolCall.mcp.imageBlocked")}</span> : <>
      <button type="button" aria-expanded={shown} onClick={() => setRevealed(shown ? null : value)}>{t(shown ? "toolCall.mcp.hideImage" : "toolCall.mcp.showImage")} · {Math.ceil(image.bytes / 1024)} KiB</button>
      {shown && <img src={image.src} alt={t("toolCall.mcp.inlineImage")} loading="lazy" onError={() => setFailedValue(value)} onLoad={(event) => {
        const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
        if (!width || !height || width > 8192 || height > 8192 || width * height > 16000000) setFailedValue(value);
      }} />}
    </>}
  </div>;
}

const SearchResults = React.memo(function SearchResults({
  groups,
  showPublished = false,
}: {
  groups: ReturnType<typeof searchGroups>;
  showPublished?: boolean;
}) {
  const api = useApi();
  const { t } = api;
  const [requested, setPage] = React.useState(0);
  const items = React.useMemo(
    () => groups.flatMap((group) => group.items.map((item) => ({ group: group.name, item }))),
    [groups],
  );
  const page = Math.min(requested, Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1));
  const pageItems = React.useMemo(
    () => items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [items, page],
  );

  const openInApp = (url: string) => api.links.open(url, "browser");
  const openExternal = (url: string) => api.links.open(url, "external");

  return (
    <section className="mcp-search-section">
      <div className="tool-call-websearch-results">
        {pageItems.map(({ group, item }, index) => {
          const itemIndex = page * PAGE_SIZE + index + 1;
          if (!isRecord(item)) {
            return (
              <article key={itemIndex} className="tool-call-websearch-result">
                <Value value={item} />
              </article>
            );
          }
          const rawTitle = typeof item.title === "string" ? item.title : typeof item.name === "string" ? item.name : "";
          const rawUrl = typeof item.url === "string" ? item.url : typeof item.link === "string" ? item.link : typeof item.source_url === "string" ? item.source_url : "";
          const url = safeUrl(rawUrl);
          const host = url ? (() => { try { return new URL(url).hostname; } catch { return ""; } })() : "";
          const title = rawTitle.trim() || host || rawUrl || "Untitled";
          const snippet = typeof item.snippet === "string" ? item.snippet : typeof item.text === "string" ? item.text : typeof item.description === "string" ? item.description : typeof item.content === "string" ? item.content : "";
          const published = typeof item.publishedDate === "string" ? item.publishedDate : typeof item.published === "string" ? item.published : typeof item.date === "string" ? item.date : "";
          const showDate = showPublished && published && published !== "N/A" && published.trim() !== "";

          const authors = Array.isArray(item.authors) ? item.authors.join(", ") : typeof item.author === "string" ? item.author : typeof item.authors === "string" ? item.authors : "";
          const pdfUrl = safeUrl(item.pdf_url ?? item.pdf);

          return (
            <article key={itemIndex} className="tool-call-websearch-result">
              <div className="tool-call-websearch-result-head">
                <span className="tool-call-websearch-result-index" aria-hidden="true">
                  {itemIndex}
                </span>
                {url ? (
                  <button
                    type="button"
                    className="tool-call-websearch-result-title"
                    onClick={() => openInApp(url)}
                    title={`${url}\n${t("toolCall.mcp.openInBrowser", { defaultValue: "在应用内浏览器打开" })}`}
                  >
                    <span className="tool-call-websearch-result-title-text">
                      {title}
                    </span>
                  </button>
                ) : (
                  <strong className="tool-call-websearch-result-title-text" style={{ fontSize: "12.5px" }}>
                    {title}
                  </strong>
                )}
                {pdfUrl && (
                  <button
                    type="button"
                    className="mcp-pdf-tag"
                    onClick={() => openInApp(pdfUrl)}
                    title={pdfUrl}
                  >
                    PDF
                  </button>
                )}
                {url && (
                  <button
                    type="button"
                    className="tool-call-websearch-external"
                    onClick={() => openExternal(url)}
                    title={t("toolCall.mcp.openExternal", { defaultValue: "在系统默认浏览器打开" })}
                    aria-label={t("toolCall.mcp.openExternal", { defaultValue: "在系统默认浏览器打开" })}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </button>
                )}
              </div>

              {url && (
                <div className="tool-call-websearch-result-url">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <span>{host || url}</span>
                  {showDate && (
                    <span className="mcp-date-tag">
                      {preview(published).slice(0, 30)}
                    </span>
                  )}
                  {authors && (
                    <span className="mcp-author-tag" title={authors}>
                      {preview(authors).slice(0, 40)}
                    </span>
                  )}
                  {group && group !== "results" && (
                    <span className="mcp-group-tag">
                      {t(`toolCall.mcp.group.${group}`, { defaultValue: group })}
                    </span>
                  )}
                </div>
              )}

              {snippet ? (
                <p className="tool-call-websearch-result-snippet">
                  {preview(snippet).slice(0, 600)}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
      <Pager total={items.length} page={page} onPage={setPage} />
    </section>
  );
});

function searchTerms(args: Record<string, unknown>) {
  const query = typeof args.query === "string" ? args.query : typeof args.q === "string" ? args.q : typeof args.search_query === "string" ? args.search_query : undefined;
  const numResults = typeof args.numResults === "number" ? args.numResults : typeof args.max_results === "number" ? args.max_results : typeof args.count === "number" ? args.count : typeof args.limit === "number" ? args.limit : undefined;
  const url = typeof args.url === "string" ? args.url : undefined;
  const depth = typeof args.search_depth === "string" ? args.search_depth : typeof args.depth === "string" ? args.depth : undefined;
  return { query, numResults, url, depth };
}

// Search cards follow the native host shape: the card title is the query (or
// target URL), while the provider badge already names the service.
function titleSubject(args: Record<string, unknown>): string {
  const { query, url } = searchTerms(args);
  const urls = Array.isArray(args.urls) && typeof args.urls[0] === "string" ? args.urls[0] : undefined;
  const value = query ?? url ?? urls;
  if (!value) return "";
  const text = preview(value, "query", true);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

function SearchParamsBar({ args }: { args: Record<string, unknown> }) {
  const { t } = useApi();
  const { query, numResults, url, depth } = searchTerms(args);

  if (!query && !numResults && !url) return null;

  return (
    <div className="tool-call-websearch-params mcp-search-params-bar">
      {query && (
        <div className="tool-call-websearch-param-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="tool-call-websearch-param-label">{t("toolCall.search.query", { defaultValue: "查询" })}</span>
          <code className="tool-call-websearch-param-value">{preview(query, "query", true)}</code>
        </div>
      )}
      {url && (
        <div className="tool-call-websearch-param-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span className="tool-call-websearch-param-label">{t("toolCall.anysearch.url", { defaultValue: "网址" })}</span>
          <code className="tool-call-websearch-param-value">{preview(url, "url", true)}</code>
        </div>
      )}
      <div className="tool-call-websearch-param-tags">
        {numResults !== undefined && (
          <span className="tool-call-websearch-param-tag">
            {t("toolCall.anysearch.maxResults", { defaultValue: "上限" })}: {numResults}
          </span>
        )}
        {depth && (
          <span className="tool-call-websearch-param-tag">
            {depth}
          </span>
        )}
      </div>
    </div>
  );
}

type EntityItem = {
  id: string;
  title: string;
  subtitle?: string;
  state?: string;
  stateType?: "success" | "warning" | "error" | "neutral" | "purple";
  url?: string;
};

function detectEntities(rows: unknown[]): EntityItem[] | null {
  if (!Array.isArray(rows) || rows.length === 0 || !isRecord(rows[0])) return null;
  const first = rows[0] as Record<string, unknown>;

  // 1. GitHub / GitLab / Linear Issue 或 PR
  const hasIssueLike =
    (first.title !== undefined || first.message !== undefined) &&
    (first.number !== undefined || first.iid !== undefined || first.identifier !== undefined || first.id !== undefined) &&
    (first.state !== undefined || first.status !== undefined);
  if (hasIssueLike) {
    return rows.slice(0, 100).filter(isRecord).map((r) => {
      const id = String(r.number ? `#${r.number}` : r.iid ? `#${r.iid}` : r.identifier ? r.identifier : r.id ?? "");
      const title = String(r.title ?? r.message ?? "Untitled");
      const state = String(r.state ?? r.status ?? "").toLowerCase();
      let stateType: EntityItem["stateType"] = "neutral";
      if (["open", "opened", "active", "running", "success"].includes(state)) stateType = "success";
      else if (["closed", "failed", "error", "canceled"].includes(state)) stateType = "error";
      else if (["merged"].includes(state)) stateType = "purple";
      else if (["pending", "in_progress", "todo"].includes(state)) stateType = "warning";
      const url = safeUrl(r.html_url ?? r.web_url ?? r.url);
      const user = isRecord(r.user) ? String(r.user.login ?? "") : typeof r.author === "string" ? r.author : "";
      return { id, title, state: state.toUpperCase(), stateType, url: url || undefined, subtitle: user ? `@${user}` : undefined };
    });
  }

  // 2. Commit 列表
  const hasCommitLike =
    (first.sha !== undefined || (first.id !== undefined && typeof first.id === "string" && first.id.length >= 8)) &&
    (first.message !== undefined || first.title !== undefined);
  if (hasCommitLike) {
    return rows.slice(0, 100).filter(isRecord).map((r) => {
      const rawSha = String(r.sha ?? r.id ?? "");
      const id = rawSha.slice(0, 8);
      const title = String(r.message ?? r.title ?? "").split("\n")[0];
      const author = isRecord(r.author) ? String(r.author.name ?? r.author.login ?? "") : typeof r.author_name === "string" ? r.author_name : "";
      const url = safeUrl(r.html_url ?? r.web_url ?? r.url);
      return { id, title, subtitle: author, state: "COMMIT", stateType: "neutral", url: url || undefined };
    });
  }

  // 3. Sentry Issue / 异常
  const hasSentryLike = (first.culprit !== undefined || first.shortId !== undefined) && first.level !== undefined;
  if (hasSentryLike) {
    return rows.slice(0, 100).filter(isRecord).map((r) => {
      const id = String(r.shortId ?? r.id ?? "");
      const title = String(r.title ?? r.culprit ?? "Error");
      const level = String(r.level ?? "error").toLowerCase();
      let stateType: EntityItem["stateType"] = "error";
      if (level === "warning") stateType = "warning";
      else if (level === "info") stateType = "neutral";
      const count = r.count !== undefined ? `${r.count} events` : undefined;
      return { id, title, state: level.toUpperCase(), stateType, subtitle: count };
    });
  }

  // 4. Docker 容器 / Kubernetes Pod / Node
  const hasContainerLike =
    (first.Names !== undefined || first.name !== undefined) &&
    (first.State !== undefined || first.status !== undefined || first.phase !== undefined);
  if (hasContainerLike) {
    return rows.slice(0, 100).filter(isRecord).map((r) => {
      const name = String(Array.isArray(r.Names) ? r.Names[0] : r.name ?? r.id ?? "");
      const title = name.replace(/^\//, "");
      const status = String(r.State ?? r.status ?? r.phase ?? "").toLowerCase();
      let stateType: EntityItem["stateType"] = "neutral";
      if (["running", "ready", "active"].includes(status)) stateType = "success";
      else if (["exited", "failed", "crashloopbackoff", "error"].includes(status)) stateType = "error";
      else if (["waiting", "pending", "containercreating"].includes(status)) stateType = "warning";
      const image = String(r.Image ?? r.image ?? "");
      return { id: "POD/CTR", title, state: status.toUpperCase(), stateType, subtitle: image || undefined };
    });
  }

  // 5. 仓库列表 (GitHub / GitLab / Supabase Projects)
  const hasRepoLike = (first.full_name !== undefined || (first.name !== undefined && (first.owner !== undefined || first.stargazers_count !== undefined || first.star_count !== undefined)));
  if (hasRepoLike) {
    return rows.slice(0, 100).filter(isRecord).map((r) => {
      const name = String(r.full_name ?? r.name ?? "repo");
      const stars = r.stargazers_count ?? r.star_count;
      const lang = typeof r.language === "string" ? r.language : undefined;
      const subtitle = [
        stars !== undefined ? `★ ${stars}` : null,
        lang,
        typeof r.description === "string" ? r.description.slice(0, 70) : null,
      ].filter(Boolean).join(" · ");
      const url = safeUrl(r.html_url ?? r.web_url ?? r.url);
      return { id: "REPO", title: name, state: "REPO", stateType: "purple", subtitle: subtitle || undefined, url: url || undefined };
    });
  }

  // 6. API 接口与请求 (Postman / Swagger)
  const hasRequestLike = first.method !== undefined && (first.url !== undefined || first.name !== undefined);
  if (hasRequestLike) {
    return rows.slice(0, 100).filter(isRecord).map((r) => {
      const method = String(r.method ?? "GET").toUpperCase();
      let stateType: EntityItem["stateType"] = "neutral";
      if (method === "GET") stateType = "success";
      else if (method === "POST") stateType = "purple";
      else if (method === "PUT" || method === "PATCH") stateType = "warning";
      else if (method === "DELETE") stateType = "error";
      const rawUrl = typeof r.url === "string" ? r.url : isRecord(r.url) && typeof r.url.raw === "string" ? r.url.raw : "";
      const title = String(r.name ?? (rawUrl || "API Request"));
      const url = safeUrl(rawUrl);
      const statusCode = r.responseCode ?? r.status;
      const subtitle = [statusCode ? `HTTP ${statusCode}` : null, rawUrl && rawUrl !== title ? rawUrl : null].filter(Boolean).join(" · ");
      return { id: method, title, state: method, stateType, subtitle: subtitle || undefined, url: url || undefined };
    });
  }

  // 7. Notion 页面与数据库
  const hasNotionLike = first.object === "page" || first.object === "database" || (first.parent !== undefined && first.properties !== undefined);
  if (hasNotionLike) {
    return rows.slice(0, 100).filter(isRecord).map((r) => {
      const type = String(r.object ?? "page").toUpperCase();
      let title = "Untitled";
      if (isRecord(r.properties)) {
        for (const val of Object.values(r.properties)) {
          if (isRecord(val) && val.type === "title" && Array.isArray(val.title) && val.title.length > 0) {
            const t = val.title[0];
            if (isRecord(t) && typeof t.plain_text === "string") title = t.plain_text;
          }
        }
      }
      const url = safeUrl(r.url);
      const subtitle = typeof r.last_edited_time === "string" ? `Updated ${r.last_edited_time.slice(0, 10)}` : undefined;
      return { id: type, title, state: type, stateType: "neutral", subtitle, url: url || undefined };
    });
  }

  return null;
}

const EntityListView = React.memo(function EntityListView({ entities, label }: { entities: EntityItem[]; label: string }) {
  const api = useApi();
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(entities.length / PAGE_SIZE) - 1));
  const visible = React.useMemo(() => entities.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [entities, page]);

  return (
    <section className="mcp-entity-section">
      <h4>{label} · {entities.length}</h4>
      <div className="mcp-entity-list">
        {visible.map((item, idx) => (
          <div key={`${item.id}-${idx}`} className="mcp-entity-card">
            <div className="mcp-entity-head">
              {item.state && (
                <span className={`mcp-status-badge mcp-status-${item.stateType || "neutral"}`}>
                  {item.state}
                </span>
              )}
              <span className="mcp-entity-id">{item.id}</span>
              {item.url ? (
                <button
                  type="button"
                  className="mcp-entity-title-btn"
                  onClick={() => api.links.open(item.url!, "browser")}
                  title={item.url}
                >
                  {item.title}
                </button>
              ) : (
                <span className="mcp-entity-title">{item.title}</span>
              )}
            </div>
            {item.subtitle && (
              <div className="mcp-entity-sub">
                <span>{item.subtitle}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <Pager total={entities.length} page={page} onPage={setPage} />
    </section>
  );
});

function extractScrapeInfo(
  blocks: readonly ContentBlock[],
  records: readonly Record<string, unknown>[],
): { title?: string; url?: string; content: string; image?: { src: string; bytes: number } } | null {
  for (const rec of records) {
    const rawUrl = rec.url ?? rec.sourceUrl ?? rec.link;
    const url = safeUrl(rawUrl);
    const screenshot = rec.screenshot ?? rec.image ?? rec.base64;
    const inlineImg = inlineImage(screenshot);
    const content =
      typeof rec.markdown === "string" ? rec.markdown :
      typeof rec.content === "string" ? rec.content :
      typeof rec.text === "string" ? rec.text :
      typeof rec.html === "string" ? rec.html : undefined;
    if (inlineImg || (content && content.length > 50)) {
      const title = typeof rec.title === "string" ? rec.title : undefined;
      return { title, url: url || undefined, content: content || "", image: inlineImg || undefined };
    }
  }
  for (const b of blocks) {
    if (b.kind === "image") {
      const img = inlineImage(b.value);
      if (img) return { content: "", image: img };
    }
    if (typeof b.value === "string" && b.value.length > 50) {
      if (/^data:image\//.test(b.value)) {
        const comma = b.value.indexOf(",");
        if (comma > 0) {
          const mime = b.value.slice(5, comma).split(";")[0];
          const data = b.value.slice(comma + 1);
          const img = inlineImage({ mimeType: mime, data });
          if (img) return { content: "", image: img };
        }
      }
      if (/^#\s+/m.test(b.value) || b.value.length > 200) {
        return { content: b.value };
      }
    }
  }
  return null;
}

const ScrapeView = React.memo(function ScrapeView({ data }: { data: { title?: string; url?: string; content: string; image?: { src: string; bytes: number } } }) {
  const api = useApi();
  const { t } = api;
  const [expanded, setExpanded] = React.useState(false);
  const host = data.url ? (() => { try { return new URL(data.url).hostname; } catch { return ""; } })() : "";

  return (
    <section className="mcp-scrape-section">
      <div className="tool-call-websearch-page mcp-scrape-card">
        <div className="tool-call-websearch-page-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span className="tool-call-websearch-page-title-text" title={data.title || data.url}>
            {data.title || host || data.url || "Document"}
          </span>
        </div>
        {data.url && (
          <div className="tool-call-websearch-page-link-row">
            <button
              type="button"
              className="tool-call-websearch-page-link"
              onClick={() => api.links.open(data.url!, "browser")}
              title={data.url}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span>{host || data.url}</span>
            </button>
            <button
              type="button"
              className="tool-call-websearch-external"
              onClick={() => api.links.open(data.url!, "external")}
              title={t("toolCall.mcp.openExternal", { defaultValue: "在系统默认浏览器打开" })}
              aria-label={t("toolCall.mcp.openExternal", { defaultValue: "在系统默认浏览器打开" })}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          </div>
        )}
        {data.image && (
          <div className="mcp-image-preview">
            <img src={data.image.src} alt="Screenshot / Image preview" style={{ maxWidth: "100%", maxHeight: "380px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", objectFit: "contain" }} />
          </div>
        )}
        {data.content && (
          <div className="tool-call-websearch-preview-wrap">
            <pre className={`tool-call-websearch-preview ${expanded ? "is-expanded" : ""}`}>
              {expanded ? data.content : data.content.slice(0, 1000)}
            </pre>
            {data.content.length > 1000 && (
              <button
                type="button"
                className="mcp-expand-btn"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? t("toolCall.mcp.collapse", { defaultValue: "收起全文" }) : `${t("toolCall.anysearch.fullContent", { defaultValue: "展开全文" })} (${data.content.length} 字符)`}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
});

function extractUrlList(
  records: readonly Record<string, unknown>[],
  blocks: readonly ContentBlock[],
): string[] | null {
  for (const rec of records) {
    if (Array.isArray(rec.urls) && rec.urls.length > 0 && typeof rec.urls[0] === "string") {
      const valid = rec.urls.map(String).filter((u) => safeUrl(u));
      if (valid.length > 0) return valid;
    }
  }
  for (const b of blocks) {
    if (Array.isArray(b.value) && b.value.length > 0 && typeof b.value[0] === "string" && safeUrl(b.value[0])) {
      const valid = b.value.map(String).filter((u) => safeUrl(u));
      if (valid.length > 0) return valid;
    }
  }
  return null;
}

const UrlListView = React.memo(function UrlListView({ urls, label }: { urls: string[]; label: string }) {
  const api = useApi();
  const { t } = api;
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(urls.length / PAGE_SIZE) - 1));
  const visible = React.useMemo(() => urls.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [urls, page]);

  return (
    <section className="mcp-url-list-section">
      <h4>{label} · {urls.length}</h4>
      <div className="mcp-url-list">
        {visible.map((url, idx) => {
          return (
            <div key={`${url}-${idx}`} className="mcp-url-item">
              <span className="mcp-url-index">{page * PAGE_SIZE + idx + 1}</span>
              <button
                type="button"
                className="mcp-url-link-btn"
                onClick={() => api.links.open(url, "browser")}
                title={url}
              >
                <Globe size={11} aria-hidden="true" />
                <span className="mcp-url-text">{url}</span>
              </button>
              <button
                type="button"
                className="tool-call-websearch-external"
                onClick={() => api.links.open(url, "external")}
                title={t("toolCall.mcp.openExternal", { defaultValue: "在系统默认浏览器打开" })}
              >
                <ExternalLink size={10} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      <Pager total={urls.length} page={page} onPage={setPage} />
    </section>
  );
});

const KEY_FIELDS = ["name", "title", "identifier", "number", "id", "key", "schema", "status", "state", "type", "kind", "level", "priority", "language", "author", "assignee", "rows", "rls_enabled", "comments", "size", "count", "total", "path", "file", "url", "html_url", "web_url", "description", "created_at", "updated_at", "createdAt", "updatedAt", "date", "time"];
const MAX_COLUMNS = 6;

function RecordCell({ field, value }: { field: string; value: unknown }) {
  const api = useApi();
  if (value === null || value === undefined || value === "") return <span className="mcp-muted">—</span>;
  if (typeof value === "boolean") return <code className="mcp-param-code">{String(value)}</code>;
  if (typeof value === "number") return <code className="mcp-param-code">{value}</code>;
  if (typeof value === "string") {
    const url = safeUrl(value);
    if (url) return <button type="button" className="mcp-cell-link" title={url} onClick={() => api.links.open(url, "browser")}>{hostOf(url)}</button>;
    const text = field.endsWith("_at") || field === "date" ? shortStamp(value) : value;
    return <span className="mcp-cell-text" title={value}>{safeText(text)}</span>;
  }
  if (Array.isArray(value)) return <span className="mcp-param-count">[{value.length}]</span>;
  return <span className="mcp-param-count">{`{${Object.keys(value).length}}`}</span>;
}

// Records table: key columns first, typed cells, one row open at a time for the
// full record. Replaces the flat host table so every provider gets the same
// readable layout.
const RecordTable = React.memo(function RecordTable({ rows, label }: { rows: unknown[]; label: string }) {
  const api = useApi();
  const { t } = api;
  const [requested, setPage] = React.useState(0);
  const [openRow, setOpenRow] = React.useState<string | null>(null);
  const page = Math.min(requested, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
  const visible = React.useMemo(() => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [rows, page]);
  const columns = React.useMemo(() => {
    const present = new Set<string>();
    for (const row of visible) {
      if (!isRecord(row)) continue;
      for (const [key, value] of Object.entries(row)) {
        if (value !== null && value !== undefined && value !== "") present.add(key);
      }
    }
    const ordered = [...KEY_FIELDS.filter((key) => present.has(key)), ...[...present].filter((key) => !KEY_FIELDS.includes(key)).sort()];
    return ordered.slice(0, MAX_COLUMNS);
  }, [visible]);
  const hasRecords = visible.some(isRecord);

  return <section className="mcp-table">
    <h4>{label} · {rows.length}</h4>
    <div className="mcp-record-wrap">
      <table className="mcp-record-table">
        <thead><tr><th className="mcp-record-expander" aria-hidden="true" />{hasRecords ? columns.map((key) => <th key={key}>{t(`toolCall.field.${key}`, { defaultValue: key })}</th>) : <th>{t("toolCall.mcp.value")}</th>}</tr></thead>
        <tbody>{visible.map((row, index) => {
          const key = `${page}:${index}`;
          const record = isRecord(row);
          const open = openRow === key;
          return <React.Fragment key={key}>
            <tr className="mcp-record-row">
              <td className="mcp-record-expander">
                <button type="button" aria-expanded={open} title={t("toolCall.mcp.details")} onClick={() => setOpenRow(open ? null : key)}>{open ? "▾" : "▸"}</button>
              </td>
              {record ? columns.map((field) => <td key={field}><RecordCell field={field} value={(row as Record<string, unknown>)[field]} /></td>) : <td><RecordCell field="" value={row} /></td>}
            </tr>
            {open && <tr className="mcp-record-detail"><td /><td colSpan={record ? Math.max(1, columns.length) : 1}>{record ? <ParamTable providerId="" args={row as Record<string, unknown>} /> : <Value value={row} />}</td></tr>}
          </React.Fragment>;
        })}</tbody>
      </table>
    </div>
    <Pager total={rows.length} page={page} onPage={setPage} />
  </section>;
});

function BrowserView({ records, collections, blocks }: { records: Record<string, unknown>[]; collections: readonly string[]; blocks: ContentBlock[] }) {
  const { t } = useApi();
  const tables: { label: string; rows: unknown[] }[] = [];
  const seen = new Set<unknown>();
  for (const record of records) for (const key of collections) {
    const rows = record[key];
    if (Array.isArray(rows) && !seen.has(rows)) { seen.add(rows); tables.push({ label: key, rows }); }
  }
  // DevTools list_pages and browser snapshots are often plain text, not JSON.
  if (!tables.length) {
    for (const block of blocks.slice(0, 20)) {
      if (typeof block.value !== "string" || block.value.length > 200000) continue;
      const text = block.value;
      if (/^\s*(?:[-*]\s*)?\d+:\s*(?:https?:\/\/|\[|\(current\))/m.test(text)) {
        const rows = text.split(/\r?\n/).filter((line) => /^\s*(?:[-*]\s*)?\d+:/.test(line)).map((line) => {
          const match = line.match(/^\s*(?:[-*]\s*)?(\d+):\s*(.*)$/);
          return { pageId: match?.[1] ?? "", url: line.match(/https?:\/\/[^\s)]+/)?.[0] ?? "", page: line.trim() };
        });
        if (rows.length) tables.push({ label: t("toolCall.mcp.pages"), rows });
      }
      const requestLines = text.split(/\r?\n/).filter((line) => /(?:reqid|msgid)=\d+/.test(line));
      if (requestLines.length) tables.push({ label: "console / network", rows: requestLines.map((line) => ({ id: line.match(/(?:reqid|msgid)=(\d+)/)?.[1] ?? "", record: line.trim() })) });
    }
  }
  return <>{tables.slice(0, 8).map((table, index) => <RecordTable key={index} {...table} />)}</>;
}

type RecordsView = { label: string; rows: unknown[]; entities: EntityItem[] | null };

// Shared collection extraction for generic providers. Verified collection keys
// win; any other non-empty object array is shown as a records table.
function collectionItems(
  records: Record<string, unknown>[],
  collections: readonly string[],
  blocks: ContentBlock[],
  t: Translate,
): RecordsView[] {
  const items: RecordsView[] = [];
  const seen = new Set<unknown>();
  for (const block of blocks.slice(0, 20)) {
    if (Array.isArray(block.value) && !seen.has(block.value)) {
      seen.add(block.value);
      items.push({ label: t("toolCall.mcp.records"), rows: block.value, entities: detectEntities(block.value) });
    }
  }
  for (const record of records) for (const key of collections) {
    const rows = record[key];
    if (Array.isArray(rows) && !seen.has(rows)) {
      seen.add(rows);
      items.push({ label: t(`toolCall.mcp.collection.${key}`, { defaultValue: key }), rows, entities: detectEntities(rows) });
    }
  }
  if (!items.length) {
    for (const record of records) for (const [key, value] of Object.entries(record)) {
      if (!Array.isArray(value) || value.length === 0 || seen.has(value) || !value.some(isRecord)) continue;
      seen.add(value);
      items.push({ label: t(`toolCall.mcp.collection.${key}`, { defaultValue: safeText(key).slice(0, 60) }), rows: value, entities: detectEntities(value) });
    }
  }
  return items;
}

const GenericView = React.memo(function GenericView({ items, records }: { items: RecordsView[]; records: Record<string, unknown>[] }) {
  if (items.length) {
    return <>
      {items.slice(0, 6).map((item, index) =>
        item.entities && item.entities.length > 0 ? (
          <EntityListView key={index} entities={item.entities} label={item.label} />
        ) : (
          <RecordTable key={index} label={item.label} rows={item.rows} />
        ),
      )}
    </>;
  }
  // Record-shaped fallbacks only when no collection table exists, so the same
  // rows are never rendered twice.
  const checklist = checklistFromRecords(records);
  if (checklist) return <ChecklistView shape={checklist} />;
  const progress = progressFromRecords(records);
  if (progress) return <ProgressView shape={progress} />;
  return null;
});

const Metrics = React.memo(function Metrics({ records }: { records: Record<string, unknown>[] }) {
  const { t } = useApi();
  const fields = React.useMemo(() => ["id", "status", "progress", "completed", "total", "totalPages", "creditsUsed", "duration", "durationMs"], []);
  const selected = React.useMemo(() => {
    const map = new Map<string, unknown>();
    for (const record of records) {
      for (const key of fields) {
        const value = record[key];
        if (!map.has(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
          map.set(key, value);
        }
      }
    }
    return map;
  }, [records, fields]);

  if (!selected.size) return null;
  return <dl className="mcp-metrics">{[...selected].map(([key, value]) => <div key={key}><dt>{t(`toolCall.mcp.metric.${key}`, { defaultValue: key })}</dt><dd>{preview(value, key)}</dd></div>)}</dl>;
});

const Blocks = React.memo(function Blocks({ blocks, compact = false }: { blocks: ContentBlock[]; compact?: boolean }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(blocks.length / 5) - 1));
  const currentBlocks = React.useMemo(() => blocks.slice(page * 5, (page + 1) * 5), [blocks, page]);

  return <section className="mcp-blocks">
    {!compact && <h4>{t("toolCall.mcp.contentBlocks")} · {blocks.length}</h4>}
    {currentBlocks.map((block, index) => <div className="mcp-block" key={`${page}:${index}`}>
      <h5>{block.label}</h5>
      {block.kind === "image" ? <ImageBlock value={block.value} /> : <BlockValue value={block.value} />}
    </div>)}
    <Pager total={blocks.length} page={page} size={5} onPage={setPage} />
  </section>;
});

function computeMeta({
  status,
  provider,
  groups,
  records,
  blocks,
  api,
}: {
  status: "pending" | "running" | "completed" | "error";
  provider: Provider;
  groups: ReturnType<typeof searchGroups>;
  records: Record<string, unknown>[];
  blocks: ContentBlock[];
  api: ReturnType<typeof useApi>;
}): React.JSX.Element {
  if (status === "error") {
    return <span className="mcp-meta-badge mcp-meta-error">{api.t("toolCall.mcp.failed", { defaultValue: "Failed" })}</span>;
  }
  if (status === "running") {
    return <span className="mcp-meta-badge mcp-meta-running">{api.t("toolCall.mcp.status.running", { defaultValue: "Running" })}</span>;
  }
  if (status === "pending") {
    return <span className="mcp-meta-badge mcp-meta-pending">{api.t("toolCall.mcp.status.pending", { defaultValue: "Pending" })}</span>;
  }

  // 1. 搜索类（kind: "search" 或解析出了 groups）优先展示结果数
  if (provider.kind === "search" || groups.length > 0) {
    const totalResults = groups.reduce((acc, g) => acc + (Array.isArray(g.items) ? g.items.length : 0), 0);
    if (totalResults > 0) {
      return (
        <span className="mcp-meta-badge mcp-meta-active">
          {api.t("toolCall.mcp.resultCount", {
            defaultValue: "{{count}} 条结果",
            values: { count: totalResults },
          })}
        </span>
      );
    }
    return (
      <span className="mcp-meta-badge mcp-meta-muted">
        {api.t("toolCall.mcp.noResults", { defaultValue: "无结果" })}
      </span>
    );
  }

  // 2. 结构化记录与表格集合
  if (records.length > 0) {
    let collectionCount = 0;
    for (const record of records) {
      for (const col of provider.collections) {
        const val = record[col];
        if (Array.isArray(val) && val.length > 0) {
          collectionCount = Math.max(collectionCount, val.length);
        }
      }
    }
    const count = collectionCount || records.length;
    if (count > 0) {
      return (
        <span className="mcp-meta-badge mcp-meta-active">
          {api.t("toolCall.mcp.rowCount", {
            defaultValue: "{{count}} 条记录",
            values: { count },
          })}
        </span>
      );
    }
  }

  // 3. 抓取与文本类：若有较长文本内容，显示字符数
  if (blocks.length === 1 && typeof blocks[0].value === "string" && blocks[0].value.length > 100) {
    const len = blocks[0].value.length;
    const formatted = len >= 1000 ? `${(len / 1000).toFixed(1)}k` : String(len);
    return (
      <span className="mcp-meta-badge mcp-meta-muted">
        {api.t("toolCall.mcp.charCount", {
          defaultValue: "{{count}} 字符",
          values: { count: formatted },
        })}
      </span>
    );
  }

  // 4. 兜底内容块数
  if (blocks.length > 0) {
    return (
      <span className="mcp-meta-badge">
        {api.t("toolCall.mcp.blockCount", { values: { count: blocks.length } })}
      </span>
    );
  }

  return (
    <span className="mcp-meta-badge">
      {api.t(`toolCall.mcp.status.${status}`, { defaultValue: status })}
    </span>
  );
}

export function McpToolCall({ toolCall, provider, operation }: { toolCall: ToolCallInfo; provider: Provider; operation: string }) {
  const api = useApi();
  const parsed = React.useMemo(() => parseMcp(toolCall.result), [toolCall.result]);
  const records = React.useMemo(() => candidates(parsed.blocks), [parsed.blocks]);
  const args = React.useMemo(() => parseJson(toolCall.arguments), [toolCall.arguments]);
  const exa = React.useMemo(() => provider.id === "exa" ? exaView(parsed.blocks, records, operation) : null, [provider.id, parsed.blocks, records, operation]);
  const feed = React.useMemo(() => (provider.kind === "search" && provider.id !== "exa" && provider.id !== "firecrawl") ? parseSearchFeed(provider.id, parsed.blocks, records) : null, [provider.kind, provider.id, parsed.blocks, records]);
  const groups = React.useMemo(() => exa ? exa.groups : feed ? feed.groups : provider.kind === "search" ? searchGroups(records) : [], [exa, feed, provider.kind, records]);
  const [parametersOpen, setParametersOpen] = React.useState(false);
  const status = toolCall.status === "error" || parsed.failed || exa?.partialError ? "error" : toolCall.status;
  const ToolCallNode = api.ui.ToolCallNode;
  const op = api.t(`toolCall.mcp.op.${operation}`, { defaultValue: operation });
  const isSearchTool = provider.kind === "search";
  // Search cards title the call with its subject (native host behavior); the
  // provider summary only surfaces on cards without a parameter bar.
  const subject = React.useMemo(() => (isSearchTool && isRecord(args) ? titleSubject(args) : ""), [isSearchTool, args]);
  // Provider-aware summary: real schema field names first, everything else
  // stays reachable in the expanded parameter tree.
  const summary = React.useMemo(() => {
    if (!isRecord(args) || isSearchTool) return "";
    return providerSummary(provider.id, args, api.t);
  }, [provider.id, isSearchTool, args, api.t]);
  // Shape sniffing runs on the raw text blocks + records, independent of which
  // tool produced them: a diff looks like a diff whoever returns it. When no
  // shape matches, `shape` stays null and the generic views render as before.
  const shape = React.useMemo(() => {
    const texts: string[] = [];
    for (const block of parsed.blocks) {
      if (typeof block.value === "string") texts.push(block.value);
      else if (isRecord(block.value) && typeof block.value.text === "string") texts.push(block.value.text);
    }
    const joined = texts.join("\n");
    if (joined.length <= 400000) {
      const diff = parseDiff(joined);
      if (diff) return <DiffView shape={diff} />;
      const snapshot = parseSnapshot(joined);
      if (snapshot) return <SnapshotView shape={snapshot} />;
      const tree = parseTree(joined) ?? treeFromRecords(records);
      if (tree) return <TreeView shape={tree} />;
      const log = parseLogs(joined);
      if (log) return <LogView shape={log} />;
    }
    return null;
  }, [parsed.blocks, records]);
  const scrapeData = React.useMemo(() => {
    if (groups.length > 0) return null;
    if (provider.kind !== "search" && provider.kind !== "browser" && operation !== "web-fetch") return null;
    return extractScrapeInfo(parsed.blocks, records);
  }, [groups.length, provider.kind, operation, parsed.blocks, records]);
  const urlListData = React.useMemo(() => {
    if (groups.length > 0 || scrapeData !== null) return null;
    return extractUrlList(records, parsed.blocks);
  }, [groups.length, scrapeData, records, parsed.blocks]);
  const recordItems = React.useMemo(
    () => (provider.kind === "generic" ? collectionItems(records, provider.collections, parsed.blocks, api.t) : []),
    [provider.kind, provider.collections, records, parsed.blocks, api.t],
  );
  const hasSpecializedView = groups.length > 0 || shape !== null || scrapeData !== null || urlListData !== null || recordItems.length > 0;

  const meta = React.useMemo(() => computeMeta({
    status,
    provider,
    groups,
    records,
    blocks: parsed.blocks,
    api,
  }), [status, provider, groups, records, parsed.blocks, api]);
  return <ToolCallNode toolName={toolCall.name} status={status} lazyBody category={provider.category} badgeName={provider.name} displayName={subject || (summary ? `${op} · ${summary}` : op)} displayNameTitle={subject || toolCall.name} className={`snow-external-tool-renderer tool-call-gallery ${isSearchTool ? "tool-call-websearch" : ""}`} meta={meta}>
    <div className="mcp-card">
      {isRecord(args) && isSearchTool && <SearchParamsBar args={args} />}
      {status === "error" && <p role="status" className="mcp-error">{api.t("toolCall.mcp.failed")}</p>}
      <button type="button" aria-expanded={parametersOpen} onClick={() => setParametersOpen(!parametersOpen)}>{api.t("toolCall.mcp.parameters")}</button>
      {parametersOpen && <section className="mcp-params-section"><p className="mcp-muted">{api.t("toolCall.mcp.parameterPrivacy")}</p>{isRecord(args) ? <><ParamTable providerId={provider.id} args={provider.id === "exa" ? exaParameters(args) : args} /><details className="mcp-param-details mcp-params-raw"><summary>{api.t("toolCall.mcp.rawParameters")}</summary><Value value={provider.id === "exa" ? exaParameters(args) : args} parameters /></details></> : <span className="mcp-muted">{HIDDEN}</span>}</section>}
      <Metrics records={records} />
      {feed?.answer && <div className="mcp-answer"><strong>{api.t("toolCall.search.answer")}:</strong><p>{preview(feed.answer)}</p></div>}
      {feed?.sources && feed.sources.length > 0 && <div className="mcp-sources"><strong>{api.t("toolCall.search.sources")} · {feed.sources.length}</strong><ul>{feed.sources.slice(0, 20).map((url, index) => <li key={`${url}-${index}`}><SafeLink value={url} /></li>)}</ul></div>}
      {exa?.textPreview && <div className="mcp-hint-banner"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg><span>{api.t("toolCall.exa.previewOnly")}</span></div>}
      {feed?.textPreview && <div className="mcp-hint-banner"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg><span>{api.t("toolCall.search.textPreview")}</span></div>}
      {groups.length > 0 && <SearchResults groups={groups} showPublished={provider.id === "exa" || provider.id === "brave"} />}
      {scrapeData && <ScrapeView data={scrapeData} />}
      {urlListData && <UrlListView urls={urlListData} label={api.t("toolCall.mcp.op.tavily-map", { defaultValue: "站点链接清单" })} />}
      {shape}
      {provider.kind === "browser" && <BrowserView records={records} collections={provider.collections} blocks={parsed.blocks} />}
      {provider.kind === "generic" && <GenericView items={recordItems} records={records} />}
      {parsed.bounded && <p className="mcp-muted">{api.t("toolCall.mcp.parseLimit")}</p>}
      {parsed.blocks.length > 0 ? (
        hasSpecializedView ? (
          <details className="mcp-raw-blocks-toggle">
            <summary>{api.t("toolCall.mcp.viewRawBlocks", { defaultValue: "查看原始响应数据" })} · {parsed.blocks.length}</summary>
            <Blocks blocks={parsed.blocks} compact />
          </details>
        ) : (
          <Blocks blocks={parsed.blocks} />
        )
      ) : (
        <span className="mcp-muted">{api.t(`toolCall.mcp.status.${status}`)}</span>
      )}
      {toolCall.streamingStdout && <OutputSection label="stdout" value={toolCall.streamingStdout} />}
      {toolCall.streamingStderr && <OutputSection label="stderr" value={toolCall.streamingStderr} />}
    </div>
  </ToolCallNode>;
}
