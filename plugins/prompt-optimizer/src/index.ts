/**
 * Plugin entry module. The host imports this file for both the configuration
 * panel and the input-toolbar action, and resolves each export by name.
 */

export { optimizeDraft, optimizeDraftWithProjectContext } from "./action";
export { default } from "./panel";
