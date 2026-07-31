import { useEffect, useRef } from "react";
import type { BeadColor, PatternResult } from "../types";
import { boardOrigin } from "../lib/pattern";

interface BoardCanvasProps {
  pattern: PatternResult;
  palette: BeadColor[];
  boardIndex: number;
  selectedColor: number | null;
  completed: Set<number>;
  mode: "build" | "edit";
  onCellClick: (globalIndex: number) => void;
}

export function BoardCanvas({
  pattern,
  palette,
  boardIndex,
  selectedColor,
  completed,
  mode,
  onCellClick,
}: BoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      const size = Math.max(320, Math.floor(Math.min(bounds.width, bounds.height || bounds.width)));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
      canvas.style.height = `${size}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, size, size);
      context.fillStyle = "#111819";
      context.fillRect(0, 0, size, size);

      const padding = 32;
      const boardSize = pattern.metrics.boardSize;
      const cellSize = (size - padding * 2) / boardSize;
      const boardPixelSize = cellSize * boardSize;
      const { startX, startY } = boardOrigin(
        boardIndex,
        pattern.metrics.boardsAcross,
        boardSize,
      );
      context.fillStyle = "#39423f";
      context.fillRect(padding, padding, boardPixelSize, boardPixelSize);

      context.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = "#9aa7a3";
      for (let value = 0; value < boardSize; value += 1) {
        if (value === 0 || (value + 1) % 5 === 0 || value === boardSize - 1) {
          const center = padding + value * cellSize + cellSize / 2;
          context.fillText(String(startX + value + 1).padStart(2, "0"), center, 17);
          context.fillText(String(startY + value + 1).padStart(2, "0"), 16, center);
        }
      }

      for (let localY = 0; localY < boardSize; localY += 1) {
        for (let localX = 0; localX < boardSize; localX += 1) {
          const globalX = startX + localX;
          const globalY = startY + localY;
          const px = padding + localX * cellSize;
          const py = padding + localY * cellSize;
          const inPattern = globalX < pattern.width && globalY < pattern.height;
          const globalIndex = globalY * pattern.width + globalX;
          const paletteIndex = inPattern ? pattern.cells[globalIndex] : null;

          context.fillStyle = "#444d4a";
          context.fillRect(px + 0.4, py + 0.4, cellSize - 0.8, cellSize - 0.8);
          if (paletteIndex === null) {
            context.beginPath();
            context.arc(px + cellSize / 2, py + cellSize / 2, Math.max(1, cellSize * 0.09), 0, Math.PI * 2);
            context.fillStyle = "#2a3331";
            context.fill();
            continue;
          }
          const dimmed = selectedColor !== null && paletteIndex !== selectedColor;
          context.globalAlpha = dimmed ? 0.15 : completed.has(globalIndex) ? 0.42 : 1;
          context.fillStyle = palette[paletteIndex].hex;
          context.fillRect(px + 0.9, py + 0.9, cellSize - 1.8, cellSize - 1.8);
          context.globalAlpha = 1;
          if (paletteIndex === selectedColor) {
            context.strokeStyle = "#ffd05c";
            context.lineWidth = Math.max(1, cellSize * 0.12);
            context.strokeRect(px + 1.2, py + 1.2, cellSize - 2.4, cellSize - 2.4);
          }
          if (completed.has(globalIndex)) {
            context.strokeStyle = "rgba(230, 243, 238, .52)";
            context.lineWidth = 1;
            context.beginPath();
            context.moveTo(px + cellSize * 0.22, py + cellSize * 0.52);
            context.lineTo(px + cellSize * 0.43, py + cellSize * 0.72);
            context.lineTo(px + cellSize * 0.78, py + cellSize * 0.27);
            context.stroke();
          }
        }
      }

      context.strokeStyle = "#71807b";
      context.lineWidth = 0.7;
      for (let line = 0; line <= boardSize; line += 1) {
        const offset = padding + line * cellSize;
        context.beginPath();
        context.moveTo(padding, offset);
        context.lineTo(padding + boardPixelSize, offset);
        context.moveTo(offset, padding);
        context.lineTo(offset, padding + boardPixelSize);
        context.stroke();
      }
      context.strokeStyle = "#b6c2be";
      context.lineWidth = 2;
      context.strokeRect(padding, padding, boardPixelSize, boardPixelSize);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [boardIndex, completed, palette, pattern, selectedColor]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const size = Math.min(bounds.width, bounds.height);
    const padding = 32;
    const boardSize = pattern.metrics.boardSize;
    const cellSize = (size - padding * 2) / boardSize;
    const localX = Math.floor((event.clientX - bounds.left - padding) / cellSize);
    const localY = Math.floor((event.clientY - bounds.top - padding) / cellSize);
    if (localX < 0 || localY < 0 || localX >= boardSize || localY >= boardSize) return;
    const { startX, startY } = boardOrigin(boardIndex, pattern.metrics.boardsAcross, boardSize);
    const globalX = startX + localX;
    const globalY = startY + localY;
    if (globalX >= pattern.width || globalY >= pattern.height) return;
    const globalIndex = globalY * pattern.width + globalX;
    if (mode === "build" && pattern.cells[globalIndex] === null) return;
    onCellClick(globalIndex);
  };

  return (
    <canvas
      ref={canvasRef}
      className="board-canvas"
      onClick={handleClick}
      aria-label={mode === "build" ? "拼豆摆放板；点击格子标记完成" : "拼豆编辑板；点击格子替换颜色"}
    />
  );
}

