/**
 * Inline side-by-side diff rendering.
 *
 * Only the supplied snapshot is rendered: hunk headers provide line numbers and
 * no file content is read back. Every line goes through `textContent`, so patch
 * text can never be interpreted as markup.
 */

import { element } from "./dom";
import { relativePath, type NormalizedFile } from "./files";
import type { Translate } from "./types";

type PendingLine = { lineNum: number | ""; text: string; isEof?: boolean };

type Hunk = {
  oldLine: number;
  newLine: number;
  oldRemaining: number;
  newRemaining: number;
};

const PATCH_LINE_LIMIT = 1000;

export const renderDiff = (
  panel: HTMLElement,
  file: NormalizedFile,
  t: Translate,
): void => {
  const patch = file.diff?.patch;
  if (file.diff?.isBinary || typeof patch !== "string" || !patch.trim()) {
    panel.append(
      element(
        "p",
        "sfc-inline-note",
        t(file.diff?.isBinary ? "footer.diffBinary" : "footer.diffUnavailable"),
      ),
    );
    return;
  }
  const scroll = element("div", "sfc-inline-diff-scroll");
  scroll.tabIndex = 0;
  scroll.setAttribute("role", "region");
  scroll.setAttribute(
    "aria-label",
    `${relativePath(file)}: ${t("footer.viewDiff")}`,
  );
  scroll.title = t("footer.diffSnapshot");
  const table = element("table", "sfc-inline-diff-table sfc-split-diff-table");
  const head = element("thead");
  const labels = element("tr");
  const thOldNum = element("th", "sfc-split-th-num", t("footer.oldLine"));
  thOldNum.scope = "col";
  const thOldCode = element(
    "th",
    "sfc-split-th-code sfc-split-divider",
    t("footer.diffBefore"),
  );
  thOldCode.scope = "col";
  const thNewNum = element("th", "sfc-split-th-num", t("footer.newLine"));
  thNewNum.scope = "col";
  const thNewCode = element("th", "sfc-split-th-code", t("footer.diffAfter"));
  thNewCode.scope = "col";
  labels.append(thOldNum, thOldCode, thNewNum, thNewCode);
  head.append(labels);
  const body = element("tbody");
  const lines = patch.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  let hunk: Hunk | null = null;
  let incomplete = false;
  let sawHunk = false;
  const unfinished = (): boolean =>
    hunk !== null && (hunk.oldRemaining !== 0 || hunk.newRemaining !== 0);

  let deletedBatch: PendingLine[] = [];
  let addedBatch: PendingLine[] = [];

  const flushBatch = (): void => {
    const count = Math.max(deletedBatch.length, addedBatch.length);
    for (let i = 0; i < count; i++) {
      const del = deletedBatch[i] ?? null;
      const add = addedBatch[i] ?? null;
      const row = element("tr", "sfc-split-row");
      const leftNum = element(
        "td",
        "sfc-inline-diff-number sfc-split-num" +
          (del
            ? del.isEof
              ? " sfc-diff-eof"
              : " sfc-diff-del"
            : " sfc-diff-empty"),
        del ? String(del.lineNum) : "",
      );
      const leftCode = element(
        "td",
        "sfc-inline-diff-code sfc-split-code sfc-split-divider" +
          (del
            ? del.isEof
              ? " sfc-diff-eof"
              : " sfc-diff-del"
            : " sfc-diff-empty"),
        del ? del.text : "",
      );
      const rightNum = element(
        "td",
        "sfc-inline-diff-number sfc-split-num" +
          (add
            ? add.isEof
              ? " sfc-diff-eof"
              : " sfc-diff-add"
            : " sfc-diff-empty"),
        add ? String(add.lineNum) : "",
      );
      const rightCode = element(
        "td",
        "sfc-inline-diff-code sfc-split-code" +
          (add
            ? add.isEof
              ? " sfc-diff-eof"
              : " sfc-diff-add"
            : " sfc-diff-empty"),
        add ? add.text : "",
      );
      row.append(leftNum, leftCode, rightNum, rightCode);
      body.append(row);
    }
    deletedBatch = [];
    addedBatch = [];
  };

  for (const line of lines.slice(0, PATCH_LINE_LIMIT)) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
    if (match) {
      flushBatch();
      if (unfinished()) incomplete = true;
      const numbers = [
        Number(match[1]),
        Number(match[3]),
        Number(match[2] ?? 1),
        Number(match[4] ?? 1),
      ];
      if (numbers.every(Number.isSafeInteger)) {
        sawHunk = true;
        hunk = {
          oldLine: numbers[0] as number,
          newLine: numbers[1] as number,
          oldRemaining: numbers[2] as number,
          newRemaining: numbers[3] as number,
        };
      } else {
        incomplete = true;
        hunk = null;
      }
      const hunkRow = element("tr", "sfc-split-hunk-row");
      const hunkCell = element("td", "sfc-split-hunk-cell", line);
      hunkCell.colSpan = 4;
      hunkRow.append(hunkCell);
      body.append(hunkRow);
      continue;
    }

    if (!sawHunk) {
      if (!line.startsWith("---") && !line.startsWith("+++")) {
        const metaRow = element("tr", "sfc-split-meta-row");
        const metaCell = element("td", "sfc-split-meta-cell", line);
        metaCell.colSpan = 4;
        metaRow.append(metaCell);
        body.append(metaRow);
      }
      continue;
    }

    if (
      hunk &&
      /^[ +-]/.test(line) &&
      (hunk.oldRemaining > 0 || hunk.newRemaining > 0)
    ) {
      const prefix = line[0];
      const text = line.slice(1);
      if (prefix === " ") {
        flushBatch();
        if (hunk.oldRemaining <= 0 || hunk.newRemaining <= 0) {
          incomplete = true;
          hunk = null;
        } else {
          const oldNum = String(hunk.oldLine++);
          const newNum = String(hunk.newLine++);
          hunk.oldRemaining--;
          hunk.newRemaining--;
          const row = element("tr", "sfc-split-row sfc-split-context");
          row.append(
            element("td", "sfc-inline-diff-number sfc-split-num", oldNum),
            element(
              "td",
              "sfc-inline-diff-code sfc-split-code sfc-split-divider",
              text,
            ),
            element("td", "sfc-inline-diff-number sfc-split-num", newNum),
            element("td", "sfc-inline-diff-code sfc-split-code", text),
          );
          body.append(row);
        }
      } else if (prefix === "-") {
        if (hunk.oldRemaining <= 0) {
          incomplete = true;
          hunk = null;
        } else {
          const oldNum = hunk.oldLine++;
          hunk.oldRemaining--;
          deletedBatch.push({ lineNum: oldNum, text });
        }
      } else if (prefix === "+") {
        if (hunk.newRemaining <= 0) {
          incomplete = true;
          hunk = null;
        } else {
          const newNum = hunk.newLine++;
          hunk.newRemaining--;
          addedBatch.push({ lineNum: newNum, text });
        }
      }
    } else if (line.startsWith("\\")) {
      const notice = "\\ " + t("footer.noNewline");
      if (addedBatch.length > 0) {
        addedBatch.push({ lineNum: "", text: notice, isEof: true });
      } else if (deletedBatch.length > 0) {
        deletedBatch.push({ lineNum: "", text: notice, isEof: true });
      } else {
        flushBatch();
        const row = element("tr", "sfc-split-row sfc-diff-eof");
        row.append(
          element(
            "td",
            "sfc-inline-diff-number sfc-split-num sfc-diff-eof",
            "",
          ),
          element(
            "td",
            "sfc-inline-diff-code sfc-split-code sfc-split-divider sfc-diff-eof",
            notice,
          ),
          element(
            "td",
            "sfc-inline-diff-number sfc-split-num sfc-diff-eof",
            "",
          ),
          element(
            "td",
            "sfc-inline-diff-code sfc-split-code sfc-diff-eof",
            notice,
          ),
        );
        body.append(row);
      }
    } else {
      if (unfinished() || /^[ +-]/.test(line)) incomplete = true;
      hunk = null;
    }
  }
  flushBatch();
  table.append(head, body);
  scroll.append(table);
  panel.append(scroll);
  if (lines.length > PATCH_LINE_LIMIT) {
    panel.append(
      element(
        "p",
        "sfc-inline-note",
        t("footer.diffLimit", { count: PATCH_LINE_LIMIT }),
      ),
    );
  } else if (!sawHunk || incomplete || unfinished()) {
    panel.append(element("p", "sfc-inline-note", t("footer.diffIncomplete")));
  }
};
