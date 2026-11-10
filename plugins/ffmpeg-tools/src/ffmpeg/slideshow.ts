// Slideshow planning: compiles an ordered still-image list into one concat graph
// where every image owns its own frame count, zoom/pan motion and tilt, so the
// total length can be pinned to an audio track exactly.
//
import { evenDimension } from "./formats";

// Single definition of the motion pipeline: the tool layer only validates caller
// input and assembles argv from the plan this module returns.

export const SLIDE_EFFECT_VALUES = ["none", "auto", "zoom-in", "zoom-out"] as const;
export type SlideEffect = (typeof SLIDE_EFFECT_VALUES)[number];

export const SLIDE_FIT_VALUES = ["cover", "contain"] as const;
export type SlideFit = (typeof SLIDE_FIT_VALUES)[number];

export const DEFAULT_EFFECT_STRENGTH = 0.15;
export const DEFAULT_IMAGE_SECONDS = 5;

// Blur is applied on a 1/8 scale copy and stretched back, so the cost per frame
// stays low even for a long slideshow.
const BACKGROUND_DIVISOR = 8;
const BACKGROUND_BLUR_SIGMA = 6;
// Rotation removes corners, so the working frame is supersampled by the factor
// this function returns; the visible canvas is then cropped out of its centre.
const MIN_SUPERSAMPLE = 1.1;
const ROTATION_HEADROOM = 1.06;

type Motion = {
  id: "zoom-in" | "zoom-out";
  zoomIn: boolean;
  /** Signed fraction of the available pan range; 0 keeps the motion centred. */
  pan: number;
  tilt: 1 | -1;
};

// Deterministic cycle, so the same input list always renders the same video.
const MOTIONS: Motion[] = [
  { id: "zoom-in", zoomIn: true, pan: 0, tilt: 1 },
  { id: "zoom-out", zoomIn: false, pan: 0, tilt: -1 },
  { id: "zoom-out", zoomIn: false, pan: 0.36, tilt: 1 },
  { id: "zoom-in", zoomIn: true, pan: -0.36, tilt: -1 },
];

export type SlideshowSegment = {
  path: string;
  frames: number;
  seconds: number;
  motion: "still" | Motion["id"];
  tiltDegrees: number;
  pan: number;
};

export type SlideshowPlan = {
  segments: SlideshowSegment[];
  width: number;
  height: number;
  fps: number;
  supersample: { width: number; height: number };
  filterComplex: string;
  videoLabel: string;
};

export type SlideshowRequest = {
  paths: string[];
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  effect: SlideEffect;
  strength: number;
  fit: SlideFit;
};

export type SlideshowResult =
  | { ok: true; plan: SlideshowPlan }
  | { ok: false; message: string };

function fixed(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)));
}

/** Splits a total frame budget over the images; null when every image cannot get one frame. */
export function distributeFrames(totalFrames: number, count: number): number[] | null {
  if (count <= 0 || totalFrames < count) return null;
  const base = Math.floor(totalFrames / count);
  const extra = totalFrames - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0));
}

export function tiltDegreesFor(strength: number): number {
  return Math.min(6, Math.max(0.8, strength * 15));
}

export function motionFor(effect: SlideEffect, index: number): Motion | null {
  if (effect === "none") return null;
  if (effect === "zoom-in") return MOTIONS[0] as Motion;
  if (effect === "zoom-out") return MOTIONS[1] as Motion;
  return MOTIONS[index % MOTIONS.length] as Motion;
}

// A centred WxH rectangle stays inside the rotated supersampled frame when the
// frame is scaled by 1 / (cos a - (H/W) * sin a); the headroom covers the pan.
function supersampleFactor(width: number, height: number, tiltRadians: number): number {
  const denominator = Math.cos(tiltRadians) - (height / width) * Math.sin(tiltRadians);
  const needed = denominator > 0 ? 1 / denominator : 1;
  return Math.max(MIN_SUPERSAMPLE, needed * ROTATION_HEADROOM);
}

export function buildSlideshow(request: SlideshowRequest): SlideshowResult {
  const { paths, width, height, fps, effect, fit } = request;
  const count = paths.length;
  if (!count) return { ok: false, message: "幻灯片模式需要至少一张图片" };

  const frames = distributeFrames(request.totalFrames, count);
  if (!frames) {
    return {
      ok: false,
      message: `总时长过短：${request.totalFrames} 帧要分配给 ${count} 张图片，每张至少需要 1 帧；请增大时长或降低 fps`,
    };
  }

  const strength = request.strength;
  const tiltDegrees = effect === "none" ? 0 : tiltDegreesFor(strength);
  const tiltRadians = (tiltDegrees * Math.PI) / 180;
  const factor = supersampleFactor(width, height, tiltRadians);
  const superWidth = evenDimension(width * factor);
  const superHeight = evenDimension(height * factor);

  const chains: string[] = [];
  const labels: string[] = [];
  const segments: SlideshowSegment[] = [];

  paths.forEach((path, index) => {
    const segmentFrames = frames[index] as number;
    const motion = motionFor(effect, index);
    // The last frame of a segment marks progress 1 without dividing by zero.
    const span = Math.max(1, segmentFrames - 1);

    if (fit === "contain") {
      const blurWidth = evenDimension(superWidth / BACKGROUND_DIVISOR);
      const blurHeight = evenDimension(superHeight / BACKGROUND_DIVISOR);
      chains.push(`[${index}:v]split=2[bg${index}][fg${index}]`);
      chains.push(
        `[bg${index}]scale=${blurWidth}:${blurHeight}:force_original_aspect_ratio=increase,` +
          `crop=${blurWidth}:${blurHeight}:(iw-ow)/2:(ih-oh)/2,gblur=sigma=${BACKGROUND_BLUR_SIGMA},` +
          `scale=${superWidth}:${superHeight}:flags=bilinear[bg${index}b]`,
      );
      chains.push(
        `[fg${index}]scale=${superWidth}:${superHeight}:force_original_aspect_ratio=decrease[fg${index}f]`,
      );
      chains.push(`[bg${index}b][fg${index}f]overlay=(W-w)/2:(H-h)/2[base${index}]`);
    } else {
      chains.push(
        `[${index}:v]scale=${superWidth}:${superHeight}:force_original_aspect_ratio=increase,` +
          `crop=${superWidth}:${superHeight}:(iw-ow)/2:(ih-oh)/2[base${index}]`,
      );
    }

    const zoom = !motion
      ? "1"
      : motion.zoomIn
        ? `1+${fixed(strength, 4)}*on/${span}`
        : `${fixed(1 + strength, 4)}-${fixed(strength, 4)}*on/${span}`;
    const x =
      !motion || motion.pan === 0
        ? "(iw-iw/zoom)/2"
        : `(iw-iw/zoom)*(0.5+${fixed(motion.pan, 4)}*(on/${span}-0.5))`;
    const y = "(ih-ih/zoom)/2";

    // zoompan is the frame generator: one still frame in, exactly segmentFrames out.
    let chain =
      `[base${index}]zoompan=z='${zoom}':x='${x}':y='${y}':d=${segmentFrames}:` +
      `s=${superWidth}x${superHeight}:fps=${fps}`;
    if (motion && tiltDegrees > 0) {
      chain += `,rotate=a='${fixed(motion.tilt * tiltRadians, 6)}*sin(2*PI*n/${span})':ow=iw:oh=ih:c=black`;
    }
    chain += `,crop=${width}:${height}:(iw-ow)/2:(ih-oh)/2,setsar=1,format=yuv420p[v${index}]`;
    chains.push(chain);

    labels.push(`[v${index}]`);
    segments.push({
      path,
      frames: segmentFrames,
      seconds: segmentFrames / fps,
      motion: motion ? motion.id : "still",
      tiltDegrees: motion ? Number((motion.tilt * tiltDegrees).toFixed(2)) : 0,
      pan: motion ? motion.pan : 0,
    });
  });

  chains.push(`${labels.join("")}concat=n=${count}:v=1:a=0[v]`);

  return {
    ok: true,
    plan: {
      segments,
      width,
      height,
      fps,
      supersample: { width: superWidth, height: superHeight },
      filterComplex: chains.join(";"),
      videoLabel: "[v]",
    },
  };
}
