import { DEFAULT_SETTINGS } from "../data/palette";
import type { BeadColor, PatternResult } from "../types";
import { recalculatePattern } from "./pattern";

export function createDemoPattern(palette: BeadColor[]): PatternResult {
  const width = 58;
  const height = 58;
  const cells: Array<number | null> = Array(width * height).fill(null);
  const closest = (code: string) => Math.max(0, palette.findIndex((item) => item.code === code));
  const ink = closest("S05");
  const orange = closest("S10");
  const cream = closest("S02");
  const white = closest("S01");
  const pink = closest("S13");
  const green = closest("S22");

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - 28.5;
      const dy = y - 31;
      const head = (dx * dx) / 430 + (dy * dy) / 340 <= 1;
      const leftEar = y > 6 && y < 24 && x > 8 && x < 28 && y > Math.abs(x - 18) * 1.4 + 4;
      const rightEar = y > 6 && y < 24 && x > 29 && x < 50 && y > Math.abs(x - 40) * 1.4 + 4;
      let bead: number | null = null;
      if (head || leftEar || rightEar) {
        const outline = (dx * dx) / 380 + (dy * dy) / 300 > 1;
        bead = outline ? ink : orange;
        if ((leftEar && y < 17) || (rightEar && y < 17)) bead = pink;
        if (y > 32 && y < 47 && Math.abs(dx) < 13) bead = cream;
        if (y > 28 && y < 34 && (Math.abs(dx + 10) < 2 || Math.abs(dx - 10) < 2)) bead = ink;
        if (y > 35 && y < 39 && Math.abs(dx) < 2) bead = pink;
        if (y > 44 && Math.abs(dx) < 7) bead = white;
        if ((x + y) % 19 === 0 && bead === orange) bead = cream;
      } else if ((x * 7 + y * 11) % 173 === 0) {
        bead = green;
      }
      cells[y * width + x] = bead;
    }
  }

  const base: PatternResult = {
    width,
    height,
    cells,
    selectedPaletteIndices: [],
    usage: [],
    metrics: {
      totalBeads: 0,
      colorCount: 0,
      boardSize: DEFAULT_SETTINGS.boardSize,
      boardsAcross: 2,
      boardsDown: 2,
      physicalWidthMm: 290,
      physicalHeightMm: 290,
      meanDeltaE: 0,
      isolatedBeads: 0,
    },
    warnings: [],
  };
  return recalculatePattern(base, palette, DEFAULT_SETTINGS);
}

