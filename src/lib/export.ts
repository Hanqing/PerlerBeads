import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { BeadColor, ProjectSnapshot } from "../types";
import { boardLabel } from "./pattern";
import { isTauri } from "./api";

const escapeXml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

export const symbolFor = (order: number): string => {
  const symbols = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  return symbols[order] ?? String(order + 1);
};

export function projectJson(snapshot: ProjectSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export function usageCsv(snapshot: ProjectSnapshot): string {
  const rows = [
    ["品牌", "系列", "色号", "色名", "数量", "库存", "缺口", "建议购买袋数"],
    ...snapshot.pattern.usage.map((entry) => {
      const color = snapshot.palette[entry.paletteIndex];
      return [
        color.brand,
        color.series,
        color.code,
        color.name,
        entry.count,
        entry.inventory,
        entry.shortage,
        entry.bagsNeeded,
      ];
    }),
  ];
  return `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n")}`;
}

export function patternSvg(snapshot: ProjectSnapshot): string {
  const { pattern, palette } = snapshot;
  const cell = 18;
  const margin = 34;
  const legendWidth = 250;
  const artWidth = pattern.width * cell;
  const artHeight = pattern.height * cell;
  const width = margin * 2 + artWidth + legendWidth;
  const height = Math.max(margin * 2 + artHeight, 180 + pattern.usage.length * 30);
  const selectedOrder = new Map(pattern.selectedPaletteIndices.map((index, order) => [index, order]));
  const pieces: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="${margin}" y="24" font-family="sans-serif" font-size="16" font-weight="600" fill="#1f2527">${escapeXml(snapshot.name)}</text>`,
    `<g transform="translate(${margin} ${margin})">`,
    `<rect x="0" y="0" width="${artWidth}" height="${artHeight}" fill="#f3f5f4" stroke="#273033" stroke-width="2"/>`,
  ];
  for (let y = 0; y < pattern.height; y += 1) {
    for (let x = 0; x < pattern.width; x += 1) {
      const paletteIndex = pattern.cells[y * pattern.width + x];
      const px = x * cell;
      const py = y * cell;
      if (paletteIndex === null) {
        pieces.push(`<circle cx="${px + cell / 2}" cy="${py + cell / 2}" r="1.4" fill="#c7cfcc"/>`);
        continue;
      }
      const color = palette[paletteIndex];
      const symbol = symbolFor(selectedOrder.get(paletteIndex) ?? 0);
      pieces.push(
        `<rect x="${px}" y="${py}" width="${cell}" height="${cell}" fill="${escapeXml(color.hex)}" stroke="#ffffff" stroke-opacity=".32"/>`,
        `<text x="${px + cell / 2}" y="${py + 12.5}" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="600" fill="#172023">${escapeXml(symbol)}</text>`,
      );
    }
  }
  for (let x = pattern.metrics.boardSize; x < pattern.width; x += pattern.metrics.boardSize) {
    pieces.push(`<line x1="${x * cell}" y1="0" x2="${x * cell}" y2="${artHeight}" stroke="#20282b" stroke-width="3"/>`);
  }
  for (let y = pattern.metrics.boardSize; y < pattern.height; y += pattern.metrics.boardSize) {
    pieces.push(`<line x1="0" y1="${y * cell}" x2="${artWidth}" y2="${y * cell}" stroke="#20282b" stroke-width="3"/>`);
  }
  pieces.push("</g>");
  const legendX = margin * 2 + artWidth;
  pieces.push(
    `<text x="${legendX}" y="${margin + 4}" font-family="sans-serif" font-size="15" font-weight="600" fill="#1f2527">材料清单</text>`,
    `<text x="${legendX}" y="${margin + 28}" font-family="sans-serif" font-size="11" fill="#667176">${pattern.width} × ${pattern.height} · ${pattern.metrics.totalBeads} 颗 · ${pattern.metrics.boardsAcross} × ${pattern.metrics.boardsDown} 板</text>`,
  );
  pattern.usage.forEach((entry, order) => {
    const color = palette[entry.paletteIndex];
    const y = margin + 58 + order * 30;
    pieces.push(
      `<circle cx="${legendX + 9}" cy="${y}" r="8" fill="${escapeXml(color.hex)}" stroke="#c3c9c7"/>`,
      `<text x="${legendX + 9}" y="${y + 3}" text-anchor="middle" font-family="sans-serif" font-size="7" fill="#172023">${escapeXml(symbolFor(order))}</text>`,
      `<text x="${legendX + 25}" y="${y + 4}" font-family="sans-serif" font-size="11" fill="#1f2527">${escapeXml(color.code)} ${escapeXml(color.name)}</text>`,
      `<text x="${legendX + 205}" y="${y + 4}" text-anchor="end" font-family="sans-serif" font-size="11" fill="#1f2527">${entry.count}</text>`,
    );
  });
  pieces.push(
    `<text x="${legendX}" y="${height - 36}" font-family="sans-serif" font-size="10" fill="#667176">板块：${Array.from({ length: pattern.metrics.boardsDown }, (_, boardY) => Array.from({ length: pattern.metrics.boardsAcross }, (_, boardX) => boardLabel(boardX, boardY)).join(" · ")).join(" / ")}</text>`,
    `<text x="${legendX}" y="${height - 18}" font-family="sans-serif" font-size="9" fill="#8a9491">色彩为屏幕近似值，制作前请核对实体色卡。</text>`,
    "</svg>",
  );
  return pieces.join("");
}

export async function saveTextExport(
  suggestedName: string,
  contents: string,
  extensions: string[],
  description: string,
): Promise<boolean> {
  if (isTauri()) {
    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: description, extensions }],
    });
    if (!path) return false;
    await invoke("save_text_file", { path, contents });
    return true;
  }
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

