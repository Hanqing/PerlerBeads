import type {
  BeadColor,
  ColorRegion,
  ColorUsage,
  GenerationSettings,
  PatternResult,
} from "../types";

export function recalculatePattern(
  pattern: PatternResult,
  palette: BeadColor[],
  settings: GenerationSettings,
): PatternResult {
  const counts = new Map<number, number>();
  for (const cell of pattern.cells) {
    if (cell !== null) counts.set(cell, (counts.get(cell) ?? 0) + 1);
  }
  const usage: ColorUsage[] = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([paletteIndex, count]) => {
      const bead = palette[paletteIndex];
      const shortage = Math.max(0, count - bead.inventory);
      return {
        paletteIndex,
        count,
        inventory: bead.inventory,
        shortage,
        bagsNeeded: shortage ? Math.ceil(shortage / Math.max(1, bead.bagSize)) : 0,
      };
    });
  return {
    ...pattern,
    selectedPaletteIndices: usage.map((entry) => entry.paletteIndex),
    usage,
    metrics: {
      ...pattern.metrics,
      totalBeads: pattern.cells.filter((cell) => cell !== null).length,
      colorCount: usage.length,
      boardSize: settings.boardSize,
      boardsAcross: Math.ceil(pattern.width / settings.boardSize),
      boardsDown: Math.ceil(pattern.height / settings.boardSize),
      physicalWidthMm: pattern.width * settings.beadPitchMm,
      physicalHeightMm: pattern.height * settings.beadPitchMm,
    },
    // Inventory warnings are derived; retain engine/calibration warnings across edits.
    warnings: [...pattern.warnings.filter((warning) => !/库存不足.*颗|^当前启用颜色总库存还缺 \d+ 颗$/.test(warning)), ...usage
      .filter((entry) => entry.shortage > 0)
      .map((entry) => `${palette[entry.paletteIndex].code} ${palette[entry.paletteIndex].name} 库存不足 ${entry.shortage} 颗`)],
  };
}

export function boardLabel(boardX: number, boardY: number): string {
  return `${String.fromCharCode(65 + boardY)}${boardX + 1}`;
}

export function boardOrigin(
  boardIndex: number,
  boardsAcross: number,
  boardSize: number,
): { boardX: number; boardY: number; startX: number; startY: number } {
  const boardX = boardIndex % boardsAcross;
  const boardY = Math.floor(boardIndex / boardsAcross);
  return {
    boardX,
    boardY,
    startX: boardX * boardSize,
    startY: boardY * boardSize,
  };
}

export function findColorRegions(
  pattern: PatternResult,
  paletteIndex: number,
  boardIndex: number,
): ColorRegion[] {
  const { boardSize, boardsAcross } = pattern.metrics;
  const { startX, startY } = boardOrigin(boardIndex, boardsAcross, boardSize);
  const visited = new Set<number>();
  const regions: ColorRegion[] = [];

  for (let localY = 0; localY < boardSize; localY += 1) {
    for (let localX = 0; localX < boardSize; localX += 1) {
      const x = startX + localX;
      const y = startY + localY;
      if (x >= pattern.width || y >= pattern.height) continue;
      const index = y * pattern.width + x;
      if (visited.has(index) || pattern.cells[index] !== paletteIndex) continue;

      const queue = [index];
      const cells: number[] = [];
      visited.add(index);
      while (queue.length) {
        const current = queue.pop()!;
        cells.push(current);
        const currentX = current % pattern.width;
        const currentY = Math.floor(current / pattern.width);
        const neighbors = [
          [currentX - 1, currentY],
          [currentX + 1, currentY],
          [currentX, currentY - 1],
          [currentX, currentY + 1],
        ];
        for (const [nextX, nextY] of neighbors) {
          if (
            nextX < startX ||
            nextY < startY ||
            nextX >= startX + boardSize ||
            nextY >= startY + boardSize ||
            nextX < 0 ||
            nextY < 0 ||
            nextX >= pattern.width ||
            nextY >= pattern.height
          ) continue;
          const next = nextY * pattern.width + nextX;
          if (!visited.has(next) && pattern.cells[next] === paletteIndex) {
            visited.add(next);
            queue.push(next);
          }
        }
      }
      regions.push({ id: regions.length + 1, cells });
    }
  }
  return regions.sort((left, right) => right.cells.length - left.cells.length);
}

export function countBoardColor(
  pattern: PatternResult,
  paletteIndex: number,
  boardIndex: number,
): number {
  const { boardSize, boardsAcross } = pattern.metrics;
  const { startX, startY } = boardOrigin(boardIndex, boardsAcross, boardSize);
  let count = 0;
  for (let y = startY; y < Math.min(pattern.height, startY + boardSize); y += 1) {
    for (let x = startX; x < Math.min(pattern.width, startX + boardSize); x += 1) {
      if (pattern.cells[y * pattern.width + x] === paletteIndex) count += 1;
    }
  }
  return count;
}
