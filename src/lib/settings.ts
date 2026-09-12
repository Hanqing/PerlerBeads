import { DEFAULT_SETTINGS } from "../data/palette";
import { getDeviceProfile } from "../data/devices";
import type { BeadColor, GenerationSettings } from "../types";

export const clampInteger = (value: number, min: number, max: number, fallback = min) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

export function normalizeSettings(saved: Partial<GenerationSettings>): GenerationSettings {
  const settings = { ...DEFAULT_SETTINGS, ...saved };
  const device = getDeviceProfile(settings.deviceProfileId);
  return {
    ...settings,
    deviceProfileId: device.id,
    boardSize: device.boardSize,
    beadPitchMm: device.pegPitchMm,
    width: clampInteger(settings.width, 8, 300, DEFAULT_SETTINGS.width),
    height: clampInteger(settings.height, 8, 300, DEFAULT_SETTINGS.height),
    maxColors: clampInteger(settings.maxColors, 4, 24, DEFAULT_SETTINGS.maxColors),
    cleanup: clampInteger(settings.cleanup, 0, 2, DEFAULT_SETTINGS.cleanup),
    alphaThreshold: Number.isFinite(settings.alphaThreshold) ? Math.min(1, Math.max(0, settings.alphaThreshold)) : DEFAULT_SETTINGS.alphaThreshold,
    fitMode: ["cover", "contain", "stretch"].includes(settings.fitMode) ? settings.fitMode : "cover",
    cellLabelMode: settings.cellLabelMode === "symbol" ? "symbol" : "code",
    dithering: settings.dithering === true,
    respectInventory: settings.respectInventory !== false,
  };
}

export function isBeadPalette(value: unknown): value is BeadColor[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 256 && value.every((color) =>
    color && ["id", "brand", "series", "code", "name"].every((key) => typeof color[key] === "string") &&
    /^#[0-9a-f]{6}$/i.test(color.hex) && typeof color.active === "boolean" &&
    Number.isInteger(color.inventory) && color.inventory >= 0 &&
    Number.isInteger(color.bagSize) && color.bagSize > 0 &&
    Array.isArray(color.rgb) && color.rgb.length === 3 &&
    color.rgb.every((channel: unknown) => typeof channel === "number" && Number.isFinite(channel) && channel >= 0 && channel <= 255),
  );
}
