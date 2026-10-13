/**
 * File-type icon mapper and renderer matching Snow App's native design.
 *
 * Utilizes authentic Simple Icons SVG vector paths for programming languages,
 * frameworks, and dev tools alongside Lucide file glyphs for generic types.
 * Pure DOM construction with document.createElementNS — zero innerHTML.
 */

import { element, hostIcon } from "./dom";
import {
  EXTENSION_MAP,
  FILENAME_MAP,
  SI_PATHS,
  type IconDef,
} from "./fileIconData";
import type { FooterApi } from "./types";

const SVG_NS = "http://www.w3.org/2000/svg";

const DEFAULT_ICON: IconDef = {
  kind: "li",
  icon: "File",
  color: "#6c757d",
};

/**
 * Extracts normalized file name from a path.
 */
export const getFileName = (filePath: string): string => {
  const normalized = filePath.replaceAll("\\", "/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
};

/**
 * Resolves the icon configuration according to Snow App's file-matching rules.
 */
export const getFileIconDef = (filePath: string): IconDef => {
  const fileName = getFileName(filePath).toLowerCase();
  if (FILENAME_MAP[fileName]) {
    return FILENAME_MAP[fileName];
  }
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex > 0) {
    const ext = fileName.slice(dotIndex + 1);
    if (EXTENSION_MAP[ext]) {
      return EXTENSION_MAP[ext];
    }
  }
  return DEFAULT_ICON;
};

/**
 * Renders an authentic Simple Icons brand SVG path using pure DOM nodes.
 */
const renderSimpleIcon = (
  pathData: string,
  color: string,
  className: string,
): HTMLElement => {
  const wrapper = element("span", className);
  wrapper.setAttribute("aria-hidden", "true");
  if (color) {
    wrapper.style.color = color;
  }
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 24 24",
    width: "14",
    height: "14",
    fill: "currentColor",
  })) {
    svg.setAttribute(key, value);
  }
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathData);
  svg.append(path);
  wrapper.append(svg);
  return wrapper;
};

/**
 * Creates an inline file-type icon element identical to Snow App's visual presentation.
 */
export const createFileIcon = (
  api: FooterApi,
  filePath: string,
  className = "sfc-inline-file-icon",
): HTMLElement => {
  const def = getFileIconDef(filePath);
  const pathData = def.kind === "si" ? SI_PATHS[def.icon] : undefined;
  if (pathData) {
    return renderSimpleIcon(pathData, def.color, className);
  }
  return hostIcon(api, def.icon, className, def.color);
};
