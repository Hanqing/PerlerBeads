import { useEffect, useRef, useState } from "react";
import type { BeadColor, CellLabelMode, PatternResult } from "../types";
import { boardOrigin } from "../lib/pattern";
import { readableInk, symbolFor } from "../lib/export";

interface BoardCanvasProps {
  pattern: PatternResult;
  palette: BeadColor[];
  boardIndex: number;
  selectedColor: number | null;
  completed: Set<number>;
  mode: "build" | "edit" | "view";
  showLabels: boolean;
  labelMode: CellLabelMode;
  onCellClick: (globalIndex: number) => void;
}

const PADDING = 30;

export function BoardCanvas({ pattern, palette, boardIndex, selectedColor, completed, mode, showLabels, labelMode, onCellClick }: BoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const { boardSize, boardsAcross } = pattern.metrics;
  const { startX, startY } = boardOrigin(boardIndex, boardsAcross, boardSize);
  useEffect(() => setCursor(null), [boardIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const size = canvas.getBoundingClientRect().width;
      if (size <= PADDING * 2) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#f3efe4"; ctx.fillRect(0, 0, size, size);
      const cell = (size - PADDING * 2) / boardSize;
      const orders = new Map(pattern.selectedPaletteIndices.map((index, order) => [index, order]));
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let y = 0; y < boardSize; y++) {
        for (let x = 0; x < boardSize; x++) {
          const px = PADDING + (x + .5) * cell;
          const py = PADDING + (y + .5) * cell;
          const index = (startY + y) * pattern.width + startX + x;
          if (startX + x >= pattern.width || startY + y >= pattern.height) continue;
          const colorIndex = pattern.cells[index];
          if (colorIndex === null) {
            ctx.beginPath(); ctx.arc(px, py, Math.max(.6, cell * .08), 0, Math.PI * 2);
            ctx.fillStyle = "#cecabb"; ctx.fill(); continue;
          }
          const color = palette[colorIndex];
          const done = completed.has(index);
          ctx.globalAlpha = selectedColor !== null && selectedColor !== colorIndex ? .18 : done ? .48 : 1;
          ctx.fillStyle = color.hex;
          if (showLabels) {
            ctx.fillRect(px - cell / 2 + .4, py - cell / 2 + .4, cell - .8, cell - .8);
            ctx.fillStyle = readableInk(color);
            const label = labelMode === "code" ? color.code : symbolFor(orders.get(colorIndex) ?? 0);
            ctx.font = "600 " + Math.min(10, cell / (label.length > 2 ? 2.05 : 1.6)) + "px ui-monospace, monospace";
            ctx.fillText(label, px, py);
          } else {
            const radius = cell * .44;
            ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#30291b22"; ctx.lineWidth = .7; ctx.stroke();
            ctx.beginPath(); ctx.arc(px, py - radius * .07, radius * .72, Math.PI * 1.15, Math.PI * 1.85);
            ctx.strokeStyle = "#ffffff66"; ctx.stroke();
            ctx.beginPath(); ctx.arc(px, py, cell * .135, 0, Math.PI * 2);
            ctx.fillStyle = "#433d3290"; ctx.fill();
          }
          ctx.globalAlpha = 1;
          if (done) {
            ctx.beginPath(); ctx.moveTo(px - cell * .22, py); ctx.lineTo(px - cell * .04, py + cell * .2); ctx.lineTo(px + cell * .25, py - cell * .22);
            ctx.strokeStyle = "#174638"; ctx.lineWidth = Math.max(1.4, cell * .08); ctx.stroke();
          }
        }
      }
      ctx.strokeStyle = "#b5b09e66"; ctx.lineWidth = .6; ctx.setLineDash([2, 3]);
      for (let line = 5; line < boardSize; line += 5) {
        const offset = PADDING + line * cell;
        ctx.beginPath(); ctx.moveTo(PADDING, offset); ctx.lineTo(size - PADDING, offset);
        ctx.moveTo(offset, PADDING); ctx.lineTo(offset, size - PADDING); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.strokeStyle = "#beb9a7";
      ctx.strokeRect(PADDING, PADDING, size - PADDING * 2, size - PADDING * 2);
      ctx.fillStyle = "#6f7060"; ctx.font = "10px ui-monospace, monospace";
      for (let value = 0; value < boardSize; value++) {
        if (value !== 0 && (value + 1) % 5 !== 0 && value !== boardSize - 1) continue;
        const center = PADDING + (value + .5) * cell;
        ctx.fillText(String(startX + value + 1), center, 15); ctx.fillText(String(startX + value + 1), center, size - 14);
        ctx.fillText(String(startY + value + 1), 14, center); ctx.fillText(String(startY + value + 1), size - 14, center);
      }
      if (cursor) {
        ctx.strokeStyle = "#147353"; ctx.lineWidth = 2;
        ctx.strokeRect(PADDING + cursor[0] * cell, PADDING + cursor[1] * cell, cell, cell);
      }
    };
    draw();
    const observer = new ResizeObserver(draw); observer.observe(canvas);
    return () => observer.disconnect();
  }, [boardSize, completed, cursor, labelMode, palette, pattern, selectedColor, showLabels, startX, startY]);

  const hitTest = (event: React.MouseEvent<HTMLCanvasElement>): [number, number] | null => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const cell = (bounds.width - PADDING * 2) / boardSize;
    const x = Math.floor((event.clientX - bounds.left - PADDING) / cell);
    const y = Math.floor((event.clientY - bounds.top - PADDING) / cell);
    return x >= 0 && y >= 0 && x < boardSize && y < boardSize && startX + x < pattern.width && startY + y < pattern.height ? [x, y] : null;
  };
  const activate = (point: [number, number] | null) => {
    if (!point || mode === "view") return;
    const index = (startY + point[1]) * pattern.width + startX + point[0];
    if (mode === "build" && pattern.cells[index] === null) return;
    onCellClick(index);
  };
  const cursorColor = cursor ? pattern.cells[(startY + cursor[1]) * pattern.width + startX + cursor[0]] : null;
  return <div className="canvas-wrap">
    <canvas ref={canvasRef} className="board-canvas" tabIndex={0}
      aria-label={mode === "edit" ? "拼豆编辑板；方向键移动，回车上色" : mode === "build" ? "拼豆摆放板；方向键移动，回车标记完成" : "拼豆图纸预览"}
      onMouseMove={(event) => { const next = hitTest(event); if (next?.[0] !== cursor?.[0] || next?.[1] !== cursor?.[1]) setCursor(next); }}
      onMouseLeave={() => setCursor(null)} onClick={(event) => activate(hitTest(event))}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(cursor); return; }
        const directions: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        const step = directions[event.key];
        if (!step) return;
        event.preventDefault();
        setCursor((current) => current ? [Math.max(0, Math.min(Math.min(boardSize, pattern.width - startX) - 1, current[0] + step[0])), Math.max(0, Math.min(Math.min(boardSize, pattern.height - startY) - 1, current[1] + step[1]))] : [0, 0]);
      }} />
    <div className="canvas-caption">{cursor ? `X ${startX + cursor[0] + 1} · Y ${startY + cursor[1] + 1}　${cursorColor === null ? "空格" : palette[cursorColor].code + " " + palette[cursorColor].name}` : mode === "edit" ? "选择颜色，点击格子上色 · 支持撤销 / 重做" : mode === "build" ? "点击拼豆标记完成 · 每 5 格一条辅助线" : "图纸预览 · 切换到摆放或编辑模式开始操作"}</div>
  </div>;
}
