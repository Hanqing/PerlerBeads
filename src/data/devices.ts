import type { DeviceProfile, GenerationSettings } from "../types";

export const DEFAULT_DEVICE_PROFILE_ID = "generic-midi-29";

export const DEVICE_PROFILES: DeviceProfile[] = [
  {
    id: DEFAULT_DEVICE_PROFILE_ID,
    brand: "通用",
    name: "Midi 29 × 29（待实测）",
    beadDiameterMm: 5,
    pegPitchMm: 5,
    boardSize: 29,
    linkable: false,
    sourceKind: "reference",
    note: "现有设备的品牌与钉数尚未确认。暂按常见 29 × 29 配置，打印前请实测并校准。",
  },
  {
    id: "hama-midi-29",
    brand: "Hama",
    name: "Midi 大方板",
    beadDiameterMm: 5,
    pegPitchMm: 5,
    boardSize: 29,
    linkable: true,
    sourceKind: "official",
    sourceUrl: "https://hama.dk/en/products/midi-pegboard-large-square",
    note: "官方 841 钉大方板，可互相连接；适合常规尺寸作品。",
  },
  {
    id: "perler-standard-29",
    brand: "Perler",
    name: "Standard 大方板",
    beadDiameterMm: 5,
    pegPitchMm: 5,
    boardSize: 29,
    linkable: true,
    sourceKind: "official",
    sourceUrl: "https://perler.com/products/large-clear-square-pegboards-4-ct",
    note: "官方透明互锁大方板约 5.7 英寸；打印前建议与手中底板叠合校准。",
  },
  {
    id: "artkal-midi-29",
    brand: "Artkal",
    name: "Midi 大方板",
    beadDiameterMm: 5,
    pegPitchMm: 5,
    boardSize: 29,
    linkable: true,
    sourceKind: "official",
    sourceUrl: "https://www.artkalbead.com/pegboard/",
    note: "官方 5 mm 可连接透明板约 14.5 × 14.5 cm。",
  },
  {
    id: "hama-mini-57",
    brand: "Hama",
    name: "Mini 大方板",
    beadDiameterMm: 2.5,
    pegPitchMm: 2.5,
    boardSize: 57,
    linkable: false,
    sourceKind: "official",
    sourceUrl: "https://hama.dk/en/products/mini-pegboard-large-square",
    note: "官方 3,249 钉大方板；格内色号较小，建议导出 SVG 放大查看。",
  },
  {
    id: "hama-maxi-16",
    brand: "Hama",
    name: "Maxi 大方板",
    beadDiameterMm: 10,
    pegPitchMm: 10,
    boardSize: 16,
    linkable: false,
    sourceKind: "official",
    sourceUrl: "https://hama.dk/en/products/maxi-pegboard-large-square",
    note: "官方 256 钉大方板；适合儿童与大颗粒图案。",
  },
];

export function getDeviceProfile(id: string): DeviceProfile {
  return DEVICE_PROFILES.find((profile) => profile.id === id) ?? DEVICE_PROFILES[0];
}

export function applyDeviceProfile(
  settings: GenerationSettings,
  profile: DeviceProfile,
): GenerationSettings {
  const maxBoards = Math.floor(300 / profile.boardSize);
  const safeBoardCount = (size: number) => Math.min(maxBoards, Math.max(1,
    Math.round((Number.isFinite(size) ? size : profile.boardSize) / Math.max(1, settings.boardSize)),
  ));
  const horizontalBoards = safeBoardCount(settings.width);
  const verticalBoards = safeBoardCount(settings.height);
  return {
    ...settings,
    width: profile.boardSize * horizontalBoards,
    height: profile.boardSize * verticalBoards,
    boardSize: profile.boardSize,
    beadPitchMm: profile.pegPitchMm,
    deviceProfileId: profile.id,
  };
}
