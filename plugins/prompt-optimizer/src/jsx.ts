import type { ReactLike } from "./types";

// The host injects its own React namespace; the plugin never bundles a copy.
// Components receive it through `api.ui.React`, so the JSX factory resolves it
// lazily at render time instead of at module scope.
let react: ReactLike | null = null;

export const bindReact = (value: ReactLike): ReactLike => {
  react = value;
  return value;
};

export const getReact = (): ReactLike => {
  if (!react) {
    throw new Error("Plugin React runtime is unavailable");
  }
  return react;
};

/** JSX factory configured through tsconfig `jsxFactory` and esbuild `jsxFactory`. */
export const h = (
  type: unknown,
  props?: Record<string, unknown> | null,
  ...children: unknown[]
): unknown => getReact().createElement(type, props, ...children);

declare global {
  // Minimal JSX surface: the host owns React, so only the factory result matters.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    type Element = unknown;
    interface IntrinsicElements {
      [elementName: string]: Record<string, unknown>;
    }
  }
}
