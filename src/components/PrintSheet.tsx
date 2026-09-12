import { memo } from "react";
import type { BeadColor, GenerationSettings, PatternResult } from "../types";
import { getDeviceProfile } from "../data/devices";
import { boardLabel, boardOrigin } from "../lib/pattern";
import { readableInk, symbolFor } from "../lib/export";

interface PrintSheetProps {
  name: string;
  pattern: PatternResult | null;
  palette: BeadColor[];
  settings: GenerationSettings;
}

const shouldShowCoordinate = (index: number, boardSize: number) =>
  index === 0 || (index + 1) % 5 === 0 || index === boardSize - 1;

export const PrintSheet = memo(function PrintSheet({ name, pattern, palette, settings }: PrintSheetProps) {
  if (!pattern) return null;
  const device = getDeviceProfile(settings.deviceProfileId);
  const symbolOrder = new Map(pattern.selectedPaletteIndices.map((index, order) => [index, order]));
  const boardCount = pattern.metrics.boardsAcross * pattern.metrics.boardsDown;
  const boardSize = pattern.metrics.boardSize;
  const pitch = settings.beadPitchMm;
  const coordinateBand = 8;
  const boardExtent = boardSize * pitch;
  const canvasExtent = boardExtent + coordinateBand * 2;
  const boardStart = coordinateBand;
  const labelFor = (paletteIndex: number) => {
    if (settings.cellLabelMode === "code") return palette[paletteIndex].code;
    return symbolFor(symbolOrder.get(paletteIndex) ?? 0);
  };

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
          <div><span>设备</span><strong>{device.brand} · {device.beadDiameterMm} mm</strong></div>
        </div>
        <div className="print-device-note">
          <strong>{device.name}</strong>
          <span>{boardSize} × {boardSize} 钉 · {pitch} mm 节距 · 单板拼图区 {boardExtent} mm</span>
        </div>
        <h2>材料清单</h2>
        <table className="print-table">
          <thead><tr><th>简写</th><th>色号</th><th>颜色</th><th>数量</th><th>库存</th><th>缺口</th></tr></thead>
          <tbody>
            {pattern.usage.map((entry, order) => {
              const color = palette[entry.paletteIndex];
              return <tr key={color.id}>
                <td><span className="print-symbol" style={{ background: color.hex, color: readableInk(color) }}>{symbolFor(order)}</span></td>
                <td>{color.code}</td><td>{color.name}</td><td>{entry.count}</td><td>{entry.inventory}</td><td>{entry.shortage || "—"}</td>
              </tr>;
            })}
          </tbody>
        </table>
        <p className="print-note">格内标注：{settings.cellLabelMode === "code" ? "实际色号" : "简写符号"}。颜色为屏幕近似值，制作前请核对实体色卡；打印请选择 100% 或“实际大小”，并先测量 50 mm 校准尺。</p>
      </section>
      {Array.from({ length: boardCount }, (_, boardIndex) => {
        const { boardX, boardY, startX, startY } = boardOrigin(boardIndex, pattern.metrics.boardsAcross, boardSize);
        const boardName = boardLabel(boardX, boardY);
        return <section className="print-page print-board" key={boardName}>
          <header>
            <div><span>板块</span><strong>{boardName}</strong></div>
            <p>{name} · 第 {boardIndex + 1}/{boardCount} 页 · 1:1 实际尺寸</p>
            <span>↑ 顶部</span>
          </header>
          <svg
            className="print-board-svg"
            viewBox={`0 0 ${canvasExtent} ${canvasExtent}`}
            style={{ width: `${canvasExtent}mm`, height: `${canvasExtent}mm` }}
            role="img"
            aria-label={`板块 ${boardName}`}
          >
            <rect x={boardStart} y={boardStart} width={boardExtent} height={boardExtent} fill="#f4f5f4" stroke="#20282b" strokeWidth=".4" />
            {Array.from({ length: boardSize }, (_, localY) =>
              Array.from({ length: boardSize }, (__, localX) => {
                const x = startX + localX;
                const y = startY + localY;
                const globalIndex = y * pattern.width + x;
                const paletteIndex = x < pattern.width && y < pattern.height ? pattern.cells[globalIndex] : null;
                const cellX = boardStart + localX * pitch;
                const cellY = boardStart + localY * pitch;
                if (paletteIndex === null) return <circle key={`${localX}-${localY}`} cx={cellX + pitch / 2} cy={cellY + pitch / 2} r={Math.max(.28, pitch * .08)} fill="#b9c1be" />;
                const color = palette[paletteIndex];
                const label = labelFor(paletteIndex);
                const labelSize = Math.min(pitch * (label.length > 2 ? .26 : .32), 1.65);
                return <g key={`${localX}-${localY}`}>
                  <rect x={cellX} y={cellY} width={pitch} height={pitch} fill={color.hex} />
                  <text
                    x={cellX + pitch / 2}
                    y={cellY + pitch / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontFamily="Arial, sans-serif"
                    fontSize={labelSize}
                    fontWeight="700"
                    fill={readableInk(color)}
                  >{label}</text>
                </g>;
              }),
            )}
            {Array.from({ length: boardSize + 1 }, (_, line) => <g key={`line-${line}`}>
              <line x1={boardStart + line * pitch} y1={boardStart} x2={boardStart + line * pitch} y2={boardStart + boardExtent} stroke={line % 5 === 0 ? "#59625f" : "#99a39f"} strokeOpacity={line % 5 === 0 ? 1 : .72} strokeWidth={line % 5 === 0 ? ".22" : ".1"} />
              <line x1={boardStart} y1={boardStart + line * pitch} x2={boardStart + boardExtent} y2={boardStart + line * pitch} stroke={line % 5 === 0 ? "#59625f" : "#99a39f"} strokeOpacity={line % 5 === 0 ? 1 : .72} strokeWidth={line % 5 === 0 ? ".22" : ".1"} />
            </g>)}
            {Array.from({ length: boardSize }, (_, index) => shouldShowCoordinate(index, boardSize) && <g key={`coord-${index}`} fill="#343b3d" fontFamily="Arial, sans-serif" fontSize="2.2">
              <text x={boardStart + (index + .5) * pitch} y={boardStart - 2.2} textAnchor="middle">{startX + index + 1}</text>
              <text x={boardStart + (index + .5) * pitch} y={boardStart + boardExtent + 4} textAnchor="middle">{startX + index + 1}</text>
              <text x={boardStart - 3.2} y={boardStart + (index + .5) * pitch} textAnchor="middle" dominantBaseline="central">{startY + index + 1}</text>
              <text x={boardStart + boardExtent + 3.2} y={boardStart + (index + .5) * pitch} textAnchor="middle" dominantBaseline="central">{startY + index + 1}</text>
            </g>)}
          </svg>
          <div className="print-ruler"><span>校准尺</span><i></i><strong>50 mm</strong></div>
          <p className="print-board-note">将相邻板页按全局坐标衔接；非透明底板请把本页作为逐格施工图使用。</p>
        </section>;
      })}
    </div>
  );
});
