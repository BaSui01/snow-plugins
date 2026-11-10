import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerMediaAnalyze } from "./mediaAnalyze";
import { registerMediaCapabilities } from "./mediaCapabilities";
import { registerMediaCapture } from "./mediaCapture";
import { registerMediaCompose } from "./mediaCompose";
import { registerMediaCut } from "./mediaCut";
import { registerMediaDraw } from "./mediaDraw";
import { registerMediaEffects } from "./mediaEffects";
import { registerMediaEnvCheck } from "./mediaEnvCheck";
import { registerMediaExtractAudio } from "./mediaExtractAudio";
import { registerMediaFrames } from "./mediaFrames";
import { registerMediaGif } from "./mediaGif";
import { registerMediaLayers } from "./mediaLayers";
import { registerMediaMetadata } from "./mediaMetadata";
import { registerMediaProbe } from "./mediaProbe";
import { registerMediaRun } from "./mediaRun";
import { registerMediaStream } from "./mediaStream";
import { registerMediaSubtitles } from "./mediaSubtitles";
import { registerMediaTranscode } from "./mediaTranscode";
import { registerMediaVisualize } from "./mediaVisualize";

// Single registration point: the server entry only declares the transport.
// Discovery first, then single-file work, then effects/drawing and subtitles/metadata,
// then composition, then the long tail.
export function registerTools(server: McpServer): void {
  registerMediaEnvCheck(server);
  registerMediaCapabilities(server);
  registerMediaProbe(server);
  registerMediaAnalyze(server);
  registerMediaVisualize(server);
  registerMediaTranscode(server);
  registerMediaCut(server);
  registerMediaExtractAudio(server);
  registerMediaFrames(server);
  registerMediaGif(server);
  registerMediaEffects(server);
  registerMediaDraw(server);
  registerMediaSubtitles(server);
  registerMediaMetadata(server);
  registerMediaCompose(server);
  registerMediaLayers(server);
  registerMediaStream(server);
  registerMediaCapture(server);
  registerMediaRun(server);
}
