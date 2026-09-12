import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { applyDeviceProfile, DEVICE_PROFILES, getDeviceProfile } from "../src/data/devices";
import { DEFAULT_PALETTE, DEFAULT_SETTINGS } from "../src/data/palette";
import { createDemoPattern } from "../src/lib/demo";
import { boardOrigin, countBoardColor, findColorRegions, recalculatePattern } from "../src/lib/pattern";
import { clampInteger, isBeadPalette, normalizeSettings } from "../src/lib/settings";
import { patternSvg, usageCsv } from "../src/lib/export";
import type { ProjectSnapshot } from "../src/types";

describe("generation settings", () => {
  test("clamps dimensions, fractions and non-finite values", () => {
    expect(clampInteger(999, 8, 300)).toBe(300);
    expect(clampInteger(-10, 8, 300)).toBe(8);
    expect(clampInteger(28.8, 8, 300)).toBe(29);
    expect(normalizeSettings({ width: NaN, height: Infinity }).width).toBe(58);
  });
  test("normalizes old or corrupted preferences", () => {
    const saved = normalizeSettings({ deviceProfileId: "deleted", width: 999, boardSize: 0, cleanup: 5 });
    expect(saved.width).toBe(300);
    expect(saved.boardSize).toBe(29);
    expect(saved.cleanup).toBe(2);
  });
  test("large Maxi to Mini switch stays within 300 and whole boards", () => {
    const next = applyDeviceProfile({ ...DEFAULT_SETTINGS, width: 300, height: 300, boardSize: 16 }, getDeviceProfile("hama-mini-57"));
    expect(next.width).toBe(285);
    expect(next.height).toBe(285);
    expect(next.beadPitchMm).toBe(2.5);
  });
  test("all device switches retain legal whole-board dimensions", () => {
    for (const from of DEVICE_PROFILES) for (const to of DEVICE_PROFILES) {
      const next = applyDeviceProfile({ ...DEFAULT_SETTINGS, boardSize: from.boardSize, width: 300, height: 8 }, to);
      expect(next.width).toBeLessThanOrEqual(300);
      expect(next.height).toBeGreaterThanOrEqual(8);
      expect(next.width % next.boardSize).toBe(0);
    }
  });
  test("rejects malformed palette records before rendering", () => {
    expect(isBeadPalette(DEFAULT_PALETTE)).toBe(true);
    expect(isBeadPalette([{}])).toBe(false);
    expect(isBeadPalette([{ ...DEFAULT_PALETTE[0], inventory: -1 }])).toBe(false);
    expect(isBeadPalette([{ ...DEFAULT_PALETTE[0], rgb: [NaN, 0, 0] }])).toBe(false);
    expect(isBeadPalette([])).toBe(false);
  });
});

describe("pattern recalculation and navigation", () => {
  const demo = createDemoPattern(DEFAULT_PALETTE);
  test("inventory changes recalculate shortages and bags without changing cells", () => {
    const index = demo.usage[0].paletteIndex;
    const palette = DEFAULT_PALETTE.map((color, i) => i === index ? { ...color, inventory: 0, bagSize: 100 } : color);
    const next = recalculatePattern(demo, palette, DEFAULT_SETTINGS);
    expect(next.usage[0].shortage).toBe(next.usage[0].count);
    expect(next.usage[0].bagsNeeded).toBe(Math.ceil(next.usage[0].count / 100));
    expect(next.cells).toBe(demo.cells);
  });
  test("preserves engine warnings but replaces stale shortage warnings", () => {
    const next = recalculatePattern({ ...demo, warnings: ["浏览器仅预览配色", "S01 白色 库存不足 99 颗", "当前启用颜色总库存还缺 10 颗"] }, DEFAULT_PALETTE, DEFAULT_SETTINGS);
    expect(next.warnings).toContain("浏览器仅预览配色");
    expect(next.warnings).not.toContain("S01 白色 库存不足 99 颗");
    expect(next.warnings).not.toContain("当前启用颜色总库存还缺 10 颗");
  });
  test("demo respects selected device dimensions and print pitch", () => {
    const settings = applyDeviceProfile(DEFAULT_SETTINGS, getDeviceProfile("hama-mini-57"));
    const mini = createDemoPattern(DEFAULT_PALETTE, settings);
    expect(mini.cells.length).toBe(114 * 114);
    expect(mini.metrics.boardSize).toBe(57);
    expect(mini.metrics.boardsAcross).toBe(2);
    expect(mini.metrics.physicalWidthMm).toBe(285);
  });
  test("recalculation synchronizes board size with board layout", () => {
    const next = recalculatePattern(demo, DEFAULT_PALETTE, { ...DEFAULT_SETTINGS, boardSize: 16 });
    expect(next.metrics.boardSize).toBe(16);
    expect(next.metrics.boardsAcross).toBe(4);
  });
  test("all regions partition each color exactly, without crossing boards", () => {
    for (const usage of demo.usage) {
      let total = 0;
      for (let board = 0; board < 4; board++) {
        const regions = findColorRegions(demo, usage.paletteIndex, board);
        const cells = regions.flatMap((region) => region.cells);
        expect(new Set(cells).size).toBe(cells.length);
        expect(cells.length).toBe(countBoardColor(demo, usage.paletteIndex, board));
        const origin = boardOrigin(board, 2, 29);
        for (const cell of cells) {
          expect(cell % 58).toBeGreaterThanOrEqual(origin.startX);
          expect(cell % 58).toBeLessThan(origin.startX + 29);
        }
        total += cells.length;
      }
      expect(total).toBe(usage.count);
    }
  });
  test("returns more than eight isolated regions and clips partial boards", () => {
    const cells = Array.from({ length: 30 * 30 }, (_, index) => index % 2 === 0 && Math.floor(index / 30) % 2 === 0 ? 0 : null);
    const pattern = recalculatePattern({ ...demo, width: 30, height: 30, cells }, DEFAULT_PALETTE, DEFAULT_SETTINGS);
    expect(findColorRegions(pattern, 0, 0).length).toBe(225);
    expect(findColorRegions(pattern, 0, 3).length).toBe(0);
  });
});

describe("exports and physical template alignment", () => {
  const project: ProjectSnapshot = { version: 1, name: 'Cat <& "friends">', createdAt: "2026-09-12", settings: DEFAULT_SETTINGS, palette: DEFAULT_PALETTE, pattern: createDemoPattern(DEFAULT_PALETTE), completedCells: [] };
  test("SVG escapes project names and labels dark legend colors legibly", () => {
    const svg = patternSvg(project);
    expect(svg).toContain("Cat &lt;&amp; &quot;friends&quot;&gt;");
    expect(svg).toMatch(/font-size="7" fill="#ffffff"/);
    expect(svg).toContain("S10");
  });
  test("CSV reports current material quantities with UTF-8 BOM", () => {
    const csv = usageCsv(project);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"593"');
    expect(csv.split("\n").length).toBe(project.pattern.usage.length + 1);
  });
  test("all blank overlay grids start at the printed board origin", () => {
    for (const name of ["midi-29", "mini-57", "maxi-16"]) {
      const svg = readFileSync(new URL(`../refs/templates/blank-overlay-${name}.svg`, import.meta.url), "utf8");
      expect(svg).toContain('<pattern id="grid" x="8" y="8"');
      expect(svg).toContain('<rect x="8" y="8"');
    }
  });
});
