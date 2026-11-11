import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { githubRequest, githubRequestWithResponse, segment } from "../github/client";
import { pageInput, paginationFromLink } from "../github/pagination";
import { run } from "../mcp/result";

const notificationResponse = z.object({
  id: z.string(),
  unread: z.boolean(),
  reason: z.string(),
  updated_at: z.string(),
  last_read_at: z.string().nullable(),
  url: z.string(),
  subscription_url: z.string(),
  subject: z.object({
    title: z.string(),
    url: z.string().nullable(),
    latest_comment_url: z.string().nullable(),
    type: z.string(),
  }),
  repository: z.object({ full_name: z.string(), html_url: z.string() }).nullable(),
});

export function registerNotifications(server: McpServer): void {
  server.registerTool(
    "github_list_notifications",
    {
      title: "List GitHub notifications",
      description:
        "List the authenticated user's notification threads with reason, unread state and subject. Requires authentication and returns Link-based pagination.",
      inputSchema: {
        all: z.boolean().optional().describe("Include notifications already marked as read"),
        participating: z.boolean().optional().describe("Only notifications the user is participating in"),
        since: z.string().min(1).optional().describe("ISO 8601 timestamp; only notifications updated after this time"),
        before: z.string().min(1).optional().describe("ISO 8601 timestamp; only notifications updated before this time"),
        page: pageInput,
        perPage: z.number().int().min(1).max(50).default(20).describe("Number of notifications per page (1-50)"),
      },
    },
    ({ all, participating, since, before, page, perPage }) =>
      run(async () => {
        const query = new URLSearchParams({
          page: String(page),
          per_page: String(perPage),
        });
        if (all !== undefined) query.set("all", String(all));
        if (participating !== undefined) query.set("participating", String(participating));
        if (since !== undefined) query.set("since", since);
        if (before !== undefined) query.set("before", before);
        const { data, response } = await githubRequestWithResponse(
          `/notifications?${query}`,
          z.array(notificationResponse),
          {},
          { requireToken: true },
        );
        return {
          items: data,
          pagination: paginationFromLink(response.headers.get("Link"), page, perPage),
        };
      }),
  );

  server.registerTool(
    "github_get_notification",
    {
      title: "Get a GitHub notification thread",
      description:
        "Read one notification thread with its reason, unread state and subject. Requires authentication.",
      inputSchema: {
        threadId: z.string().min(1).describe("Notification thread ID"),
      },
    },
    ({ threadId }) =>
      run(() =>
        githubRequest(
          `/notifications/threads/${segment(threadId)}`,
          notificationResponse,
          {},
          { requireToken: true },
        ),
      ),
  );
}
