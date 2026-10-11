/**
 * File-record normalization and line counting.
 *
 * The host hands over frozen read-only records; this module turns them into the
 * exact list the card renders, keeping legacy records usable without inventing
 * identity or diff data the host never supplied.
 */

import { element } from "./dom";
import type { FileChangeRecord, FooterApi } from "./types";

/** Host record after validation; `filePath` is guaranteed to be a string. */
export type NormalizedFile = FileChangeRecord & { filePath: string };

export type LineStats = { additions: number; deletions: number };

export const keyFor = (record: FileChangeRecord & { filePath: string }): string =>
  typeof record.fileKey === "string" && record.fileKey
    ? record.fileKey
    : record.filePath;

/** Latest record per file identity, ordered by ascending timestamp. */
export const latestFiles = (raw: unknown[]): NormalizedFile[] => {
  const latest = new Map<string, NormalizedFile>();
  for (const record of raw as FileChangeRecord[]) {
    if (
      !record ||
      typeof record.filePath !== "string" ||
      !record.filePath.trim()
    ) {
      continue;
    }
    const file = record as NormalizedFile;
    const key = keyFor(file);
    const previous = latest.get(key);
    if (
      !previous ||
      (Number(record.timestamp) || 0) >= (Number(previous.timestamp) || 0)
    ) {
      latest.set(key, file);
    }
  }
  return [...latest.values()].sort(
    (left, right) =>
      (Number(left.timestamp) || 0) - (Number(right.timestamp) || 0),
  );
};

/**
 * Path shown on the card: relative to the collection root when the record is
 * safely contained in it, otherwise the original path.
 */
export const relativePath = (record: NormalizedFile): string => {
  if (typeof record.root !== "string" || !record.root) return record.filePath;
  const path = record.filePath.replaceAll("\\", "/");
  const prefix = `${record.root.replaceAll("\\", "/").replace(/\/+$/, "")}/`;
  const windows = /^[A-Za-z]:\//.test(path) || path.startsWith("//");
  const contained = windows
    ? path.toLowerCase().startsWith(prefix.toLowerCase())
    : path.startsWith(prefix);
  const relative = path.slice(prefix.length);
  return contained &&
    relative &&
    !relative.split("/").some((part) => part === "." || part === "..")
    ? relative
    : record.filePath;
};

/**
 * Countable diff lines, or `null` when the record has no usable text diff.
 * Terminal records, binary diffs and missing patches stay "not collected"
 * instead of being reported as zero.
 */
export const linesFor = (record: NormalizedFile): LineStats | null => {
  if (
    record.source === "terminal" ||
    record.diff?.isBinary ||
    typeof record.diff?.patch !== "string" ||
    !record.diff.patch
  ) {
    return null;
  }
  let additions = 0;
  let deletions = 0;
  for (const line of record.diff.patch.split("\n").slice(2)) {
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
};

export const signedLines = (api: FooterApi, stats: LineStats): HTMLElement => {
  const row = element("span", "sfc-inline-lines");
  row.append(
    element(
      "span",
      "sfc-inline-add",
      `+${stats.additions.toLocaleString(api.locale)}`,
    ),
    element(
      "span",
      "sfc-inline-delete",
      `−${stats.deletions.toLocaleString(api.locale)}`,
    ),
  );
  return row;
};
