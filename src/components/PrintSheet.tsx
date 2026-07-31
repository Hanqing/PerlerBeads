import type { BeadColor, PatternResult } from "../types";
import { boardLabel, boardOrigin } from "../lib/pattern";
import { symbolFor } from "../lib/export";

interface PrintSheetProps {
  name: string;
  pattern: PatternResult | null;
  palette: BeadColor[];
}

export function PrintSheet({ name, pattern, palette }: PrintSheetProps) {
  if (!pattern) return null;
  const symbolOrder = new Map(pattern.selectedPaletteIndices.map((index, order) => [index, order]));
  const boardCount = pattern.metrics.boardsAcross * pattern.metrics.boardsDown;
  return (
    <div className="print-root" aria-hidden="true">
      <section className="print-page print-cover">
        <p className="print-kicker">BEADGRID PROJECT</p>
        <h1>{name}</h1>
        <div className="print-metrics">
          <div><span>图案</span><strong>{pattern.width} × {pattern.height}</strong></div>
          <div><span>拼豆</span><strong>{pattern.metrics.totalBeads} 颗</strong></div>
          <div><span>颜色</span><strong>{pattern.metrics.colorCount} 种</strong></div>
          <div><span>拼板</span><strong>{pattern.metrics.boardsAcross} × {pattern.metrics.boardsDown}</strong></div>
          <div><span>成品</span><strong>{Math.round(pattern.metrics.physicalWidthMm)} × {Math.round(pattern.metrics.physicalHeightMm)} mm</strong></div>
        </div>
        <h2>材料清单</h2>
        <table className="print-table">
          <thead><tr><th>符号</th><th>色号</th><th>颜色</th><th>数量</th><th>库存</th><th>缺口</th></tr></thead>
          <tbody>
            {pattern.usage.map((entry, order) => {
              const color = palette[entry.paletteIndex];
              return <tr key={color.id}>
                <td><span className="print-symbol" style={{ background: color.hex }}>{symbolFor(order)}</span></td>
                <td>{color.code}</td><td>{color.name}</td><td>{entry.count}</td><td>{entry.inventory}</td><td>{entry.shortage || "—"}</td>
              </tr>;
            })}
          </tbody>
        </table>
        <p className="print-note">颜色为屏幕近似值，制作前请核对实体色卡。打印时请选择 100% 或“实际大小”。</p>
      </section>
      {Array.from({ length: boardCount }, (_, boardIndex) => {
        const { boardX, boardY, startX, startY } = boardOrigin(boardIndex, pattern.metrics.boardsAcross, pattern.metrics.boardSize);
        const boardName = boardLabel(boardX, boardY);
        return <section className="print-page print-board" key={boardName}>
          <header><div><span>板块</span><strong>{boardName}</strong></div><p>{name} · 第 {boardIndex + 1}/{boardCount} 页</p><span>↑ 顶部</span></header>
          <svg className="print-board-svg" viewBox="0 0 165 165" role="img" aria-label={`板块 ${boardName}`}>
            <rect x="10" y="10" width="145" height="145" fill="#f4f5f4" stroke="#20282b" strokeWidth=".4" />
            {Array.from({ length: pattern.metrics.boardSize }, (_, localY) =>
              Array.from({ length: pattern.metrics.boardSize }, (__, localX) => {
                const x = startX + localX;
                const y = startY + localY;
                const globalIndex = y * pattern.width + x;
                const paletteIndex = x < pattern.width && y < pattern.height ? pattern.cells[globalIndex] : null;
                const cx = 12.5 + localX * 5;
                const cy = 12.5 + localY * 5;
                if (paletteIndex === null) return <circle key={`${localX}-${localY}`} cx={cx} cy={cy} r=".45" fill="#c3c9c7" />;
                const color = palette[paletteIndex];
                return <g key={`${localX}-${localY}`}>
                  <circle cx={cx} cy={cy} r="2.25" fill={color.hex} stroke="#59625f" strokeWidth=".12" />
                  <circle cx={cx} cy={cy} r=".62" fill="#ffffff" fillOpacity=".72" />
                  <text x={cx} y={cy + .55} textAnchor="middle" fontFamily="sans-serif" fontSize="1.35" fontWeight="700" fill="#172023">{symbolFor(symbolOrder.get(paletteIndex) ?? 0)}</text>
                </g>;
              }),
            )}
            {Array.from({ length: 30 }, (_, line) => <g key={`line-${line}`}>
              <line x1={10 + line * 5} y1="10" x2={10 + line * 5} y2="155" stroke={line % 5 === 0 ? "#6b7471" : "#c7cdcb"} strokeWidth={line % 5 === 0 ? ".22" : ".1"} />
              <line x1="10" y1={10 + line * 5} x2="155" y2={10 + line * 5} stroke={line % 5 === 0 ? "#6b7471" : "#c7cdcb"} strokeWidth={line % 5 === 0 ? ".22" : ".1"} />
            </g>)}
            {Array.from({ length: pattern.metrics.boardSize }, (_, index) => (index === 0 || (index + 1) % 5 === 0 || index === pattern.metrics.boardSize - 1) && <g key={`coord-${index}`}>
              <text x={12.5 + index * 5} y="7.2" textAnchor="middle" fontSize="2.2" fill="#343b3d">{startX + index + 1}</text>
              <text x="7" y={13.2 + index * 5} textAnchor="middle" fontSize="2.2" fill="#343b3d">{startY + index + 1}</text>
            </g>)}
          </svg>
          <div className="print-ruler"><span>校准尺</span><i></i><strong>50 mm</strong></div>
        </section>;
      })}
    </div>
  );
}

