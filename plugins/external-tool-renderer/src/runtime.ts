import type * as ReactTypes from "react";

// Only the host React runtime is captured. Never capture SnowAppPlugin.api:
// the load-time API is aborted before per-card renderer APIs are created.
export const React: typeof ReactTypes = (
  window as unknown as { SnowAppPlugin: { React: typeof ReactTypes } }
).SnowAppPlugin.React;
export const { useMemo, createContext, useContext } = React;
export type { ReactNode } from "react";
