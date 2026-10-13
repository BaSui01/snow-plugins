import { React } from "./runtime";
import { useApi } from "./api";
import type { ToolCallInfo } from "./types";
import type { Provider } from "./providers";
import { PAGE_SIZE, TEXT_PAGE_SIZE, BINARY, HIDDEN, candidates, hiddenKey, inlineImage, isRecord, parseJson, parseMcp, preview, safeText, safeUrl, searchGroups } from "./mcp";
import type { ContentBlock } from "./mcp";
import { exaParameters, exaSummary, exaView } from "./Exa";
import { parseSearchFeed, searchProviderSummary } from "./searchFeeds";

function Pager({ total, page, onPage, size = PAGE_SIZE }: { total: number; page: number; onPage: (page: number) => void; size?: number }) {
  const { t } = useApi();
  if (total <= size) return null;
  const last = Math.max(0, Math.ceil(total / size) - 1);
  return <div className="mcp-pager">
    <button type="button" disabled={page === 0} onClick={() => onPage(Math.max(0, page - 1))}>{t("toolCall.mcp.previous")}</button>
    <span>{t("toolCall.mcp.range", { values: { start: page * size + 1, end: Math.min(total, (page + 1) * size), total } })}</span>
    <button type="button" disabled={page >= last} onClick={() => onPage(Math.min(last, page + 1))}>{t("toolCall.mcp.next")}</button>
  </div>;
}

function SafeLink({ value, label }: { value: unknown; label?: string }) {
  const api = useApi();
  const url = safeUrl(value);
  if (!url) return null;
  return <button className="mcp-link" type="button" title={url} onClick={() => api.links.open(url, "browser")}>{safeText(label || url).slice(0, 180)}</button>;
}

function TextValue({ value }: { value: string }) {
  const { t } = useApi();
  const text = React.useMemo(() => safeText(value), [value]);
  const [expanded, setExpanded] = React.useState(false);
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(text.length / TEXT_PAGE_SIZE) - 1));
  return <div className="mcp-text">
    <pre>{expanded ? text.slice(page * TEXT_PAGE_SIZE, (page + 1) * TEXT_PAGE_SIZE) : text.slice(0, 600)}</pre>
    {text.length > 600 && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{t(expanded ? "toolCall.mcp.collapse" : "toolCall.mcp.fullText")} · {text.length}</button>}
    {expanded && <Pager total={text.length} page={page} size={TEXT_PAGE_SIZE} onPage={setPage} />}
    <SafeLink value={value} />
  </div>;
}

// Lazy, paginated tree: no unbounded stringify, no markup execution, no raw binary dump.
function Value({ value, field = "", parameters = false, depth = 0 }: { value: unknown; field?: string; parameters?: boolean; depth?: number }) {
  const { t } = useApi();
  const [open, setOpen] = React.useState(false);
  const [continueDeep, setContinueDeep] = React.useState(false);
  const [requested, setPage] = React.useState(0);
  if (hiddenKey(field, parameters)) return <code className="mcp-muted">{t("toolCall.mcp.redacted")}</code>;
  if (field === "blob" || field === "base64" || (field === "data" && typeof value === "string" && value.length > 128 && /^[a-z0-9+/]+=*$/i.test(value))) return <code className="mcp-muted">{BINARY}</code>;
  if (typeof value === "string") return <TextValue value={value} />;
  if (!Array.isArray(value) && !isRecord(value)) return <code>{String(value)}</code>;
  const keys = Array.isArray(value) ? null : Object.keys(value);
  const total = keys ? keys.length : (value as unknown[]).length;
  const page = Math.min(requested, Math.max(0, Math.ceil(total / PAGE_SIZE) - 1));
  const start = page * PAGE_SIZE;
  return <div className="mcp-tree">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "▾" : "▸"} {Array.isArray(value) ? "[ ]" : "{ }"} · {total} {t("toolCall.mcp.items")}</button>
    {open && depth >= 32 && <div><button type="button" aria-expanded={continueDeep} onClick={() => setContinueDeep(!continueDeep)}>{t("toolCall.mcp.continueDepth")}</button>{continueDeep && <Value value={value} field={field} parameters={parameters} />}</div>}
    {open && depth < 32 && <>
      <div className="mcp-fields">{Array.from({ length: Math.min(PAGE_SIZE, total - start) }, (_, offset) => {
        const index = start + offset;
        const key = keys ? keys[index] : String(index);
        const child = keys ? (value as Record<string, unknown>)[key] : (value as unknown[])[index];
        return <div className="mcp-field" key={key}><span className="mcp-key">{safeText(key).slice(0, 100)}</span><Value value={child} field={key} parameters={parameters} depth={depth + 1} /></div>;
      })}</div>
      <Pager total={total} page={page} onPage={setPage} />
    </>}
  </div>;
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

const SearchResults = React.memo(function SearchResults({ groups, showPublished = false }: { groups: ReturnType<typeof searchGroups>; showPublished?: boolean }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  // Flatten references only, never fetch thumbnails or image URLs.
  const items = React.useMemo(() => groups.flatMap((group) => group.items.map((item) => ({ group: group.name, item }))), [groups]);
  const page = Math.min(requested, Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1));
  const pageItems = React.useMemo(() => items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [items, page]);

  return <section className="mcp-search">
    <h4>{t("toolCall.mcp.searchResults")} · {items.length}</h4>
    {pageItems.map(({ group, item }, index) => <article key={page * PAGE_SIZE + index}>
      <span className="mcp-muted">{t(`toolCall.mcp.group.${group}`, { defaultValue: group })}</span>
      {isRecord(item) ? <>
        <strong>{preview(item.title ?? item.name ?? item.url ?? "", "title")}</strong>
        <SafeLink value={item.url ?? item.link} />
        {showPublished && typeof item.publishedDate === "string" && <span className="mcp-muted">{t("toolCall.exa.published")}: {preview(item.publishedDate).slice(0, 80)}</span>}
        <p>{preview(item.description ?? item.snippet ?? item.text ?? "")}</p>
        <Value value={item} />
      </> : <Value value={item} />}
    </article>)}
    <Pager total={items.length} page={page} onPage={setPage} />
  </section>;
});

const RecordTable = React.memo(function RecordTable({ rows, label }: { rows: unknown[]; label: string }) {
  const api = useApi();
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
  const visible = React.useMemo(() => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [rows, page]);
  const columns = React.useMemo(() => [...new Set(visible.flatMap((row) => isRecord(row) ? Object.keys(row) : ["value"]))].slice(0, 12), [visible]);
  const tableColumns = React.useMemo(() => columns.map((key) => safeText(key).slice(0, 100)), [columns]);
  const tableRows = React.useMemo(() => visible.map((row) => columns.map((key) => preview(isRecord(row) ? row[key] : row, key))), [visible, columns]);

  const Table = api.ui.DataTableViewer;
  return <section className="mcp-table">
    <h4>{label} · {rows.length}</h4>
    <Table columns={tableColumns} rows={tableRows} maxInitialRows={PAGE_SIZE} enableExport={false} enableSearch={false} />
    <Pager total={rows.length} page={page} onPage={setPage} />
    <span className="mcp-muted">{api.t("toolCall.mcp.tablePreview")}</span>
  </section>;
});

function BrowserView({ records, blocks }: { records: Record<string, unknown>[]; blocks: ContentBlock[] }) {
  const { t } = useApi();
  const tables: { label: string; rows: unknown[] }[] = [];
  const seen = new Set<unknown>();
  for (const record of records) for (const key of ["pages", "messages", "requests", "entries", "insights", "metrics"]) {
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

function GenericView({ records, blocks }: { records: Record<string, unknown>[]; blocks: ContentBlock[] }) {
  const { t } = useApi();
  const tables: { label: string; rows: unknown[] }[] = [];
  const seen = new Set<unknown>();
  for (const block of blocks.slice(0, 20)) {
    if (Array.isArray(block.value) && !seen.has(block.value)) {
      seen.add(block.value); tables.push({ label: t("toolCall.mcp.records"), rows: block.value });
    }
  }
  for (const record of records) for (const key of [
    "libraries", "repositories", "items", "files", "commits", "results",
    "collections", "environments", "requests", "responses",
    "issues", "projects", "comments", "users", "teams", "events", "traces",
    "containers", "images", "volumes", "pods", "services", "deployments",
    "schemas", "tables", "columns", "pages", "databases", "blocks"
  ]) {
    const rows = record[key];
    if (Array.isArray(rows) && !seen.has(rows)) {
      seen.add(rows); tables.push({ label: t(`toolCall.mcp.collection.${key}`, { defaultValue: key }), rows });
    }
  }
  // Specialized previews are bounded; every collection remains in the complete tree below.
  return <>{tables.slice(0, 6).map((table, index) => <RecordTable key={index} {...table} />)}</>;
}

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

const Blocks = React.memo(function Blocks({ blocks }: { blocks: ContentBlock[] }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(blocks.length / 5) - 1));
  const currentBlocks = React.useMemo(() => blocks.slice(page * 5, (page + 1) * 5), [blocks, page]);

  return <section className="mcp-blocks">
    <h4>{t("toolCall.mcp.contentBlocks")} · {blocks.length}</h4>
    {currentBlocks.map((block, index) => <div className="mcp-block" key={`${page}:${index}`}>
      <h5>{block.label}</h5>
      {block.kind === "image" ? <ImageBlock value={block.value} /> : <Value value={block.value} />}
    </div>)}
    <Pager total={blocks.length} page={page} size={5} onPage={setPage} />
  </section>;
});

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
  const summaryKeys = React.useMemo(() => provider.kind === "browser"
    ? ["url", "pageId", "uid", "target", "ref", "index", "part", "key", "action", "type", "filename", "format", "fullPage"]
    : ["query", "url", "libraryName", "libraryId", "language", "owner", "repo", "project", "issue", "issue_id", "issueId", "collection", "container", "pod", "namespace", "database", "table", "method", "status", "action", "id", "formats", "limit"], [provider.kind]);
  const parts = React.useMemo(() => {
    if (!isRecord(args)) return [];
    const list = summaryKeys.filter((key) => args[key] !== undefined && !hiddenKey(key, true)).map((key) => `${key}: ${preview(args[key], key, true)}`);
    for (const key of ["elements", "fields", "text", "value", "function", "script", "prompt", "code", "paths", "data"]) {
      const value = args[key];
      if (Array.isArray(value)) list.push(`${key}.count: ${value.length}`);
      else if (typeof value === "string") list.push(`${key}.length: ${value.length}`);
      else if (isRecord(value)) list.push(`${key}.count: ${Object.keys(value).length}`);
    }
    return list;
  }, [args, summaryKeys]);
  const summary = React.useMemo(() => {
    if (provider.id === "exa" && isRecord(args)) {
      return exaSummary(args, api.t);
    }
    if (feed && isRecord(args)) {
      return searchProviderSummary(provider.id, args, api.t);
    }
    return parts.join(" · ").slice(0, 400);
  }, [provider.id, feed, args, api.t, parts]);
  return <ToolCallNode toolName={toolCall.name} status={status} lazyBody category={provider.category} badgeName={provider.name} displayName={summary ? `${op} · ${summary}` : op} displayNameTitle={toolCall.name} className="snow-external-tool-renderer" meta={<span>{parsed.blocks.length ? api.t("toolCall.mcp.blockCount", { values: { count: parsed.blocks.length } }) : api.t(`toolCall.mcp.status.${status}`)}</span>}>
    <div className="mcp-card">
      {summary && <p className="mcp-summary">{summary}</p>}
      {status === "error" && <p role="status" className="mcp-error">{api.t("toolCall.mcp.failed")}</p>}
      <button type="button" aria-expanded={parametersOpen} onClick={() => setParametersOpen(!parametersOpen)}>{api.t("toolCall.mcp.parameters")}</button>
      {parametersOpen && <section><p className="mcp-muted">{api.t("toolCall.mcp.parameterPrivacy")}</p>{isRecord(args) ? <Value value={provider.id === "exa" ? exaParameters(args) : args} parameters /> : <span className="mcp-muted">{HIDDEN}</span>}</section>}
      <Metrics records={records} />
      {feed?.answer && <div className="mcp-answer"><strong>{api.t("toolCall.search.answer")}:</strong><p>{preview(feed.answer)}</p></div>}
      {exa?.textPreview && <p className="mcp-muted">{api.t("toolCall.exa.previewOnly")}</p>}
      {feed?.textPreview && <p className="mcp-muted">{api.t("toolCall.search.textPreview")}</p>}
      {groups.length > 0 && <SearchResults groups={groups} showPublished={provider.id === "exa" || provider.id === "brave"} />}
      {provider.kind === "browser" && <BrowserView records={records} blocks={parsed.blocks} />}
      {provider.kind === "generic" && <GenericView records={records} blocks={parsed.blocks} />}
      {parsed.bounded && <p className="mcp-muted">{api.t("toolCall.mcp.parseLimit")}</p>}
      {parsed.blocks.length > 0 ? <Blocks blocks={parsed.blocks} /> : <span className="mcp-muted">{api.t(`toolCall.mcp.status.${status}`)}</span>}
      {toolCall.streamingStdout && <section><h4>stdout</h4><TextValue value={toolCall.streamingStdout} /></section>}
      {toolCall.streamingStderr && <section><h4>stderr</h4><TextValue value={toolCall.streamingStderr} /></section>}
    </div>
  </ToolCallNode>;
}
