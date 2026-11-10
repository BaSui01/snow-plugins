import { resolveBinary } from "./binary";
import { runBinary, resolveOperationTimeoutMs } from "./run";

/**
 * Enumeration of what THIS ffmpeg build actually provides. This is the honest way to
 * cover FFmpeg's surface: the plugin never hardcodes a capability list, it asks the
 * installed binary.
 */
export const INVENTORY_KINDS = [
  "filters",
  "muxers",
  "demuxers",
  "encoders",
  "decoders",
  "protocols",
  "hwaccels",
  "pix_fmts",
  "devices",
  "bitstream_filters",
] as const;

export type InventoryKind = (typeof INVENTORY_KINDS)[number];

export type Inventory = {
  kind: InventoryKind;
  names: string[];
};

const LIST_ARGUMENT: Record<InventoryKind, string> = {
  filters: "-filters",
  muxers: "-muxers",
  demuxers: "-demuxers",
  encoders: "-encoders",
  decoders: "-decoders",
  protocols: "-protocols",
  hwaccels: "-hwaccels",
  pix_fmts: "-pix_fmts",
  devices: "-devices",
  bitstream_filters: "-bsfs",
};

// Listing rows start with a flags column ("TSC", "V.....", "IO...", " E ").
const FLAGGED_ROW = /^\s*[A-Z.]{2,6}\s+(\S+)/;
// `-protocols` prints sections ("Input:" / "Output:") with plain indented names.
const INDENTED_NAME = /^\s{2,}(\S+)\s*$/;
const HWACCEL_NAME = /^([A-Za-z0-9_]+)\s*$/;
const SECTION_OR_HEADER = /^(Input|Output|Hardware acceleration methods|File formats|Filters|Encoders|Decoders|Pixel formats|Devices|Bitstream filters|Configuration)/i;

const cache = new Map<InventoryKind, string[]>();

function parseListing(kind: InventoryKind, output: string): string[] {
  const names: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim() || SECTION_OR_HEADER.test(line.trim())) continue;
    let match: RegExpExecArray | null = null;
    if (kind === "protocols") {
      match = INDENTED_NAME.exec(line);
    } else if (kind === "hwaccels") {
      match = HWACCEL_NAME.exec(line.trim());
    } else {
      match = FLAGGED_ROW.exec(line);
    }
    const name = match?.[1];
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

export async function readInventory(kind: InventoryKind): Promise<Inventory | null> {
  const cached = cache.get(kind);
  if (cached) return { kind, names: cached };

  const binary = resolveBinary("ffmpeg");
  if (!binary) return null;

  const outcome = await runBinary(binary.path, ["-hide_banner", LIST_ARGUMENT[kind]], {
    timeoutMs: Math.min(resolveOperationTimeoutMs(), 120_000),
    stdoutLimitBytes: 8 * 1024 * 1024,
  });
  if (outcome.spawnError || outcome.timedOut || outcome.code !== 0) return null;

  const names = parseListing(kind, outcome.stdout);
  if (!names.length) return null;

  cache.set(kind, names);
  return { kind, names };
}

export function searchNames(names: string[], query: string | undefined): string[] {
  if (!query) return names;
  const needle = query.trim().toLowerCase();
  if (!needle) return names;
  return names.filter((name) => name.toLowerCase().includes(needle));
}
