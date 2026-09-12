import { useEffect, useRef } from "react";
import type { BeadColor, PatternResult } from "../types";
import { boardLabel } from "../lib/pattern";

export function PatternPreview({ pattern, palette }: { pattern: PatternResult; palette: BeadColor[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const scale = Math.min(10, 720 / Math.max(pattern.width, pattern.height));
    canvas.width = Math.ceil(pattern.width * scale);
    canvas.height = Math.ceil(pattern.height * scale);
    ctx.fillStyle = "#f3efe4";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    pattern.cells.forEach((color, index) => {
      const x = (index % pattern.width + .5) * scale;
      const y = (Math.floor(index / pattern.width) + .5) * scale;
      ctx.fillStyle = color === null ? "#dcd8ca" : palette[color].hex;
      ctx.beginPath();
      ctx.arc(x, y, scale * (color === null ? .08 : .46), 0, Math.PI * 2);
      ctx.fill();
      if (color !== null && scale > 3) {
        ctx.beginPath(); ctx.arc(x, y, scale * .13, 0, Math.PI * 2);
        ctx.fillStyle = "#39372b70"; ctx.fill();
      }
    });
  }, [pattern, palette]);
  return <canvas ref={ref} className="pattern-preview" role="img" aria-label={`作品全貌，${pattern.width} × ${pattern.height} 格`} />;
}

export function PatternOverview({ pattern, palette, boardIndex, onBoardChange }: {
  pattern: PatternResult; palette: BeadColor[]; boardIndex: number; onBoardChange: (index: number) => void;
}) {
  const { boardsAcross, boardsDown, boardSize } = pattern.metrics;
  return <section className="pattern-overview" aria-label="分板导航">
    <div className="section-title"><span>作品全貌</span><span>{boardsAcross * boardsDown} 块底板</span></div>
    <div className="overview-map">
      <PatternPreview pattern={pattern} palette={palette} />
      <div className="overview-boards" style={{ gridTemplateColumns: Array.from({ length: boardsAcross }, (_, x) => `${Math.min(boardSize, pattern.width - x * boardSize)}fr`).join(" "), gridTemplateRows: Array.from({ length: boardsDown }, (_, y) => `${Math.min(boardSize, pattern.height - y * boardSize)}fr`).join(" ") }}>
        {Array.from({ length: boardsAcross * boardsDown }, (_, index) => <button type="button"
          key={index} aria-label={`前往板 ${boardLabel(index % boardsAcross, Math.floor(index / boardsAcross))}`}
          aria-pressed={index === boardIndex} className={index === boardIndex ? "is-current" : ""}
          onClick={() => onBoardChange(index)}>
          {boardsAcross <= 5 && boardsDown <= 5 && <span>{boardLabel(index % boardsAcross, Math.floor(index / boardsAcross))}</span>}
        </button>)}
      </div>
    </div>
    <p>点击缩略图切换底板 · 从左上角开始摆放</p>
  </section>;
}
