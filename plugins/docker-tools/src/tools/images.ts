import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { imageRef, runDocker, runDockerJsonLines } from "../docker.js";
import { runTool } from "./result.js";

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

export function registerImages(server: McpServer): void {
  server.registerTool(
    "images_list",
    {
      title: "List Docker images",
      description:
        "List local Docker images with repository, tag, ID, size and creation time. Read-only.",
      inputSchema: {
        all: z.boolean().optional().describe("Include intermediate images. Defaults to false."),
        dangling: z.boolean().optional().describe("Only dangling images."),
        reference: z
          .string()
          .min(1)
          .max(255)
          .optional()
          .describe("Filter by repository or tag reference, e.g. nginx or nginx:alpine."),
        limit: z.number().int().min(1).max(500).optional().describe("Maximum images to return. Defaults to 100."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ all, dangling, reference, limit }) =>
      runTool(async () => {
        const args = ["images", "--no-trunc", "--format", "{{json .}}"];
        if (all) args.push("--all");
        if (dangling) args.push("--filter", "dangling=true");
        if (reference) args.push("--filter", `reference=${reference}`);

        const records = await runDockerJsonLines(args, { timeoutMs: 30_000 });
        const max = limit ?? 100;
        const images = records.slice(0, max).map((row) => ({
          repository: text(row.Repository),
          tag: text(row.Tag),
          id: text(row.ID),
          digest: text(row.Digest),
          createdAt: text(row.CreatedAt),
          size: text(row.Size),
          containers: text(row.Containers),
        }));

        return {
          images,
          count: images.length,
          total: records.length,
          truncated: records.length > images.length,
        };
      }),
  );

  server.registerTool(
    "image_pull",
    {
      title: "Pull Docker image",
      description:
        "Pull one image from a registry using the current Docker context. Network access is required; output is bounded.",
      inputSchema: {
        image: z
          .string()
          .min(1)
          .max(255)
          .describe("Image reference, e.g. nginx:alpine or ghcr.io/owner/app:tag."),
        platform: z
          .string()
          .min(1)
          .max(64)
          .optional()
          .describe("Optional platform, e.g. linux/amd64."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    ({ image, platform }) =>
      runTool(async () => {
        const ref = imageRef(image);
        const args = ["pull"];
        if (platform) args.push("--platform", platform);
        args.push(ref);

        const output = await runDocker(args, { timeoutMs: 240_000, maxBytes: 64 * 1024 });
        return {
          image: ref,
          output: output.stdout.trim(),
          stderr: output.stderr.trim() || undefined,
          truncated: output.truncated,
          originalBytes: output.originalBytes,
        };
      }),
  );
}
