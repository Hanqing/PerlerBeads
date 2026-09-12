import { invoke } from "@tauri-apps/api/core";
import type { BeadColor, GenerateRequest, GenerationSettings, PatternResult } from "../types";
import { recalculatePattern } from "./pattern";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isTauri = () => Boolean(window.__TAURI_INTERNALS__);

export async function generatePattern(request: GenerateRequest): Promise<PatternResult> {
  if (isTauri()) {
    return invoke<PatternResult>("generate_pattern", { request });
  }
  return generateBrowserPreview(request.imageBase64, request.settings, request.palette);
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("浏览器无法读取这张图片"));
    image.src = source;
  });
}

async function generateBrowserPreview(
  imageBase64: string,
  settings: GenerationSettings,
  palette: BeadColor[],
): Promise<PatternResult> {
  const image = await loadImage(imageBase64);
  const canvas = document.createElement("canvas");
  canvas.width = settings.width;
  canvas.height = settings.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法创建图片处理画布");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const sourceAspect = image.width / image.height;
  const targetAspect = settings.width / settings.height;
  if (settings.fitMode === "stretch") {
    context.drawImage(image, 0, 0, settings.width, settings.height);
  } else if (settings.fitMode === "cover") {
    let sx = 0;
    let sy = 0;
    let sw = image.width;
    let sh = image.height;
    if (sourceAspect > targetAspect) {
      sw = image.height * targetAspect;
      sx = (image.width - sw) / 2;
    } else {
      sh = image.width / targetAspect;
      sy = (image.height - sh) / 2;
    }
    context.drawImage(image, sx, sy, sw, sh, 0, 0, settings.width, settings.height);
  } else {
    const scale = Math.min(settings.width / image.width, settings.height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context.drawImage(
      image,
      (settings.width - drawWidth) / 2,
      (settings.height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
  }

  const pixels = context.getImageData(0, 0, settings.width, settings.height).data;
  const active = palette.map((item, index) => ({ item, index })).filter(({ item }) => item.active);
  if (!active.length) throw new Error("请至少启用一种拼豆颜色");
  const nearest = (r: number, g: number, b: number, candidates = active) => {
    let best = candidates[0];
    let distance = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const [cr, cg, cb] = candidate.item.rgb;
      const next = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
      if (next < distance) {
        distance = next;
        best = candidate;
      }
    }
    return best.index;
  };

  const firstPass: Array<number | null> = [];
  const popularity = new Map<number, number>();
  for (let index = 0; index < settings.width * settings.height; index += 1) {
    const offset = index * 4;
    if (pixels[offset + 3] / 255 < settings.alphaThreshold) {
      firstPass.push(null);
      continue;
    }
    const colorIndex = nearest(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    firstPass.push(colorIndex);
    popularity.set(colorIndex, (popularity.get(colorIndex) ?? 0) + 1);
  }
  const selectedIndices = [...popularity.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, settings.maxColors)
    .map(([index]) => index);
  const selected = active.filter(({ index }) => selectedIndices.includes(index));
  const cells = firstPass.map((value, index) => {
    if (value === null) return null;
    const offset = index * 4;
    return nearest(pixels[offset], pixels[offset + 1], pixels[offset + 2], selected);
  });

  return recalculatePattern({
    width: settings.width,
    height: settings.height,
    cells,
    selectedPaletteIndices: [],
    usage: [],
    metrics: {
      totalBeads: 0,
      colorCount: 0,
      boardSize: settings.boardSize,
      boardsAcross: Math.ceil(settings.width / settings.boardSize),
      boardsDown: Math.ceil(settings.height / settings.boardSize),
      physicalWidthMm: settings.width * settings.beadPitchMm,
      physicalHeightMm: settings.height * settings.beadPitchMm,
      meanDeltaE: 0,
      isolatedBeads: 0,
    },
    warnings: ["浏览器仅预览配色，不执行库存替代、抖动与清理。请在桌面应用中生成最终图纸。"],
  }, palette, settings);
}
