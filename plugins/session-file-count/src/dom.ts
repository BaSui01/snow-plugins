/**
 * DOM helpers. The footer builds plain elements with `textContent` only, so no
 * host data is ever parsed as markup.
 */

import type { FooterApi } from "./types";

/** Tag-aware factory: callers that need `scope`, `colSpan` or `type` get the
 *  concrete element type instead of a widened `HTMLElement`. */
export const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string | number,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The DOM footer uses the host Lucide component's SVG node data, not a bundled
 * icon. When the host does not expose a usable component the wrapper stays
 * empty instead of falling back to a private icon copy.
 */
export const hostIcon = (
  api: FooterApi,
  name: string,
  className: string,
  color?: string,
): HTMLElement => {
  const wrapper = element("span", className);
  wrapper.setAttribute("aria-hidden", "true");
  if (color) {
    wrapper.style.color = color;
  }
  const component = api.ui.icon(name) ?? api.ui.icon("File");
  const nodes = component?.render?.({}, null)?.props?.iconNode;
  if (!Array.isArray(nodes)) return wrapper;
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 24 24",
    width: "24",
    height: "24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  })) {
    svg.setAttribute(key, value);
  }
  for (const [tag, attributes] of nodes as Array<
    [string, Record<string, unknown>]
  >) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key !== "key") node.setAttribute(key, String(value));
    }
    svg.append(node);
  }
  wrapper.append(svg);
  return wrapper;
};

/** Matches the host's platform-aware primary modifier convention. */
export const isMacPlatform = (): boolean =>
  /mac/i.test(navigator.platform ?? "") ||
  /mac/i.test(navigator.userAgent ?? "");
