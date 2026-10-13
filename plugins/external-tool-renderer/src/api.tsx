import { React, createContext, useContext } from "./runtime";
import type { ToolCallApi } from "./types";

// A distinct Provider is mounted for every card, including rerenders/locale changes.
export const ApiContext = createContext<ToolCallApi | null>(null);
export function useApi(): ToolCallApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error("Tool renderer requires a per-card API Provider");
  api.signal.throwIfAborted();
  return api;
}

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number | string };
function icon(name: string) {
  return function HostIcon(props: IconProps): React.JSX.Element | null {
    const api = useApi();
    const Icon = api.ui.icon(name) as React.ElementType<IconProps> | undefined;
    return Icon ? React.createElement(Icon, props) : null;
  };
}
export const AlertCircle = icon("AlertCircle");
export const ExternalLink = icon("ExternalLink");
export const FileText = icon("FileText");
export const Globe = icon("Globe");
export const Loader2 = icon("Loader2");
export const Search = icon("Search");
export const CheckCircle2 = icon("CheckCircle2");
export const Database = icon("Database");
export const KeyRound = icon("KeyRound");
export const ListTree = icon("ListTree");
export const Play = icon("Play");
export const Table2 = icon("Table2");
export const TerminalSquare = icon("TerminalSquare");
