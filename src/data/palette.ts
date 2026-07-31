import type { BeadColor, GenerationSettings } from "../types";

const color = (
  code: string,
  name: string,
  hex: string,
  inventory = 1000,
): BeadColor => {
  const normalized = hex.replace("#", "");
  return {
    id: `starter-solid-${code.toLowerCase()}`,
    brand: "Starter",
    series: "Solid",
    code,
    name,
    hex,
    rgb: [
      Number.parseInt(normalized.slice(0, 2), 16),
      Number.parseInt(normalized.slice(2, 4), 16),
      Number.parseInt(normalized.slice(4, 6), 16),
    ],
    inventory,
    bagSize: 1000,
    active: true,
  };
};

// Screen approximations for the MVP. The palette model keeps measurement source/version
// separate so calibrated Lab values can replace these without changing project files.
export const DEFAULT_PALETTE: BeadColor[] = [
  color("S01", "纯白", "#F5F3EA", 1800),
  color("S02", "奶油", "#EFD8AD", 1100),
  color("S03", "沙色", "#CFAE7D", 900),
  color("S04", "浅棕", "#A87550", 900),
  color("S05", "深棕", "#513B34", 720),
  color("S06", "黑色", "#252525", 1600),
  color("S07", "浅灰", "#B8B9B2", 800),
  color("S08", "深灰", "#62666A", 800),
  color("S09", "柠檬黄", "#F3D44E", 650),
  color("S10", "橙色", "#E58B4F", 700),
  color("S11", "珊瑚红", "#DE6E62", 500),
  color("S12", "正红", "#B83C3D", 800),
  color("S13", "浅粉", "#EEB0B5", 560),
  color("S14", "玫红", "#C34F78", 480),
  color("S15", "薰衣草", "#A58BBF", 520),
  color("S16", "深紫", "#5D416E", 540),
  color("S17", "天蓝", "#76B5C5", 700),
  color("S18", "湖蓝", "#3B8FA0", 630),
  color("S19", "深蓝", "#315A85", 720),
  color("S20", "藏蓝", "#27394F", 700),
  color("S21", "浅绿", "#A8C78D", 600),
  color("S22", "草绿", "#6D9E63", 650),
  color("S23", "深绿", "#3E694E", 700),
  color("S24", "薄荷", "#9FD5C3", 450),
];

export const DEFAULT_SETTINGS: GenerationSettings = {
  width: 58,
  height: 58,
  maxColors: 18,
  alphaThreshold: 0.18,
  cleanup: 1,
  dithering: false,
  respectInventory: true,
  fitMode: "cover",
  boardSize: 29,
  beadPitchMm: 5,
};

