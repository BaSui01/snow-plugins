import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  INVENTORY_KINDS,
  readInventory,
  searchNames,
  type InventoryKind,
} from "../ffmpeg/inventory";
import { failure, respond, type ToolResponse } from "./shared";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// Searching across everything is capped per kind so one answer cannot blow the budget.
const CROSS_KINDS: InventoryKind[] = [
  "filters",
  "encoders",
  "decoders",
  "muxers",
  "demuxers",
  "protocols",
  "bitstream_filters",
];
const CROSS_LIMIT = 25;

type Args = {
  kind?: InventoryKind;
  query?: string;
  limit?: number;
};

async function countsForAll(): Promise<ToolResponse> {
  const counts: Record<string, number | null> = {};
  const hwaccels: string[] = [];
  const protocols: string[] = [];
  let missing: string[] = [];

  for (const kind of INVENTORY_KINDS) {
    const inventory = await readInventory(kind);
    if (!inventory) {
      counts[kind] = null;
      missing.push(kind);
      continue;
    }
    counts[kind] = inventory.names.length;
    if (kind === "hwaccels") hwaccels.push(...inventory.names);
    if (kind === "protocols") protocols.push(...inventory.names);
  }

  return respond({
    ok: true,
    counts,
    hwaccels,
    protocols,
    unavailable: missing,
    hint: "用 { kind, query } 查询某个能力族的具体名称；传 query 不带 kind 会跨族搜索。",
  });
}

async function searchAcross(query: string, limit: number): Promise<ToolResponse> {
  const matches: Record<string, string[]> = {};
  const totals: Record<string, number> = {};
  let found = 0;
  for (const kind of CROSS_KINDS) {
    const inventory = await readInventory(kind);
    if (!inventory) continue;
    const hits = searchNames(inventory.names, query);
    if (!hits.length) continue;
    found += hits.length;
    totals[kind] = hits.length;
    matches[kind] = hits.slice(0, limit);
  }
  if (!found) {
    return respond({
      ok: true,
      query,
      matches: {},
      total: 0,
      hint: "本机 ffmpeg 未命中该关键词；可换更短的关键词，或来自其它构建/新版本。",
    });
  }
  return respond({ ok: true, query, matches, totals, total: found });
}

async function listKind(kind: InventoryKind, query: string | undefined, limit: number): Promise<ToolResponse> {
  const inventory = await readInventory(kind);
  if (!inventory) {
    return failure("inventory-unavailable", `无法枚举本机 ffmpeg 的 ${kind}（二进制缺失或该构建不支持）`);
  }
  const hits = searchNames(inventory.names, query);
  const shown = hits.slice(0, limit);
  const payload: Record<string, unknown> = {
    ok: true,
    kind,
    query: query ?? null,
    total: hits.length,
    names: shown,
  };
  if (hits.length > shown.length) payload.truncatedTo = shown.length;
  return respond(payload);
}

async function handle({ kind, query, limit }: Args): Promise<ToolResponse> {
  const trimmedQuery = query?.trim();
  const effectiveLimit = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  if (!kind) {
    if (trimmedQuery) return searchAcross(trimmedQuery, CROSS_LIMIT);
    return countsForAll();
  }
  return listKind(kind, trimmedQuery, effectiveLimit);
}

export function registerMediaCapabilities(server: McpServer): void {
  server.registerTool(
    "media_capabilities",
    {
      title: "Query ffmpeg capabilities",
      description:
        "Ask this machine's ffmpeg build what it supports: counts for every capability family (filters, muxers, demuxers, encoders, decoders, protocols, hwaccels, pixel formats, devices, bitstream filters), the hardware acceleration methods and protocols it was built with, and name lookup inside any family. Without arguments it returns the counts; with { kind, query } it lists matching names; with only { query } it searches across families. Read-only.",
      inputSchema: {
        kind: z.enum(INVENTORY_KINDS).optional().describe("Capability family to list"),
        query: z.string().optional().describe("Case-insensitive name filter, e.g. drawtext / nvenc / hls"),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe("Max names returned, default 100"),
      },
      annotations: READ_ONLY,
    },
    (args) => handle(args as Args),
  );
}
