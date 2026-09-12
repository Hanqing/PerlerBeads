import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileArchive,
  FileDown,
  FolderOpen,
  Focus,
  Grid3X3,
  Hand,
  ImagePlus,
  PackageOpen,
  Printer,
  RotateCcw,
  Save,
  Sparkles,
  TriangleAlert,
  Upload,
  WandSparkles,
  ArrowUpRight,
  Undo2,
  Redo2,
  ShieldCheck,
  X,
} from "lucide-react";
import { BoardCanvas } from "./components/BoardCanvas";
import { PatternOverview, PatternPreview } from "./components/PatternPreview";
import { PrintSheet } from "./components/PrintSheet";
import { applyDeviceProfile, DEVICE_PROFILES, getDeviceProfile } from "./data/devices";
import { DEFAULT_PALETTE, DEFAULT_SETTINGS } from "./data/palette";
import { generatePattern, isTauri } from "./lib/api";
import { clampInteger, isBeadPalette, normalizeSettings } from "./lib/settings";
import { createDemoPattern } from "./lib/demo";
import { patternSvg, projectJson, saveTextExport, usageCsv } from "./lib/export";
import {
  boardLabel,
  boardOrigin,
  countBoardColor,
  findColorRegions,
  recalculatePattern,
} from "./lib/pattern";
import type {
  BeadColor,
  GenerationSettings,
  PatternResult,
  ProjectSnapshot,
  WorkspaceTool,
} from "./types";

const STORAGE_KEY = "beadgrid.preferences.v1";

interface StoredPreferences {
  settings: GenerationSettings;
  palette: BeadColor[];
}

function loadPreferences(): StoredPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const saved = JSON.parse(raw) as Partial<StoredPreferences>;
    return {
      settings: normalizeSettings(saved.settings ?? {}),
      palette: isBeadPalette(saved.palette) ? saved.palette : DEFAULT_PALETTE,
    };
  } catch {
    return { settings: DEFAULT_SETTINGS, palette: DEFAULT_PALETTE };
  }
}

const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("读取图片失败"));
  reader.readAsDataURL(file);
});

interface CellEdit { index: number; before: number | null; after: number; wasCompleted: boolean }

export function App() {
  const initial = useMemo(loadPreferences, []);
  const [settings, setSettings] = useState<GenerationSettings>(initial.settings);
  const [patternSettings, setPatternSettings] = useState<GenerationSettings | null>(null);
  const [palette, setPalette] = useState<BeadColor[]>(initial.palette);
  const [pattern, setPattern] = useState<PatternResult | null>(null);
  const [sourceData, setSourceData] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("未命名项目");
  const [activeTool, setActiveTool] = useState<WorkspaceTool>("project");
  const [boardIndex, setBoardIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState<number | null>(null);
  const [completed, setCompleted] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const generationId = useRef(0);
  const [focused, setFocused] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [undoStack, setUndoStack] = useState<CellEdit[]>([]);
  const [redoStack, setRedoStack] = useState<CellEdit[]>([]);
  const welcomePattern = useMemo(() => createDemoPattern(DEFAULT_PALETTE), []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, palette })); }
    catch { setError("无法保存本地偏好设置。当前仍可继续使用，请手动导出项目。"); }
  }, [palette, settings]);

  useEffect(() => {
    if (patternSettings) setPattern((current) => current ? recalculatePattern(current, palette, patternSettings) : null);
  }, [palette, patternSettings]);

  useEffect(() => {
    if (!pattern) return;
    const used = activeTool === "edit" ? palette.flatMap((color, index) => color.active ? [index] : []) : pattern.usage.map((entry) => entry.paletteIndex);
    if (selectedColor === null || !used.includes(selectedColor)) {
      setSelectedColor(used[0] ?? null);
    }
    const maxBoard = pattern.metrics.boardsAcross * pattern.metrics.boardsDown - 1;
    if (boardIndex > maxBoard) setBoardIndex(Math.max(0, maxBoard));
  }, [activeTool, boardIndex, palette, pattern, selectedColor]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? null : current), 2600);
  };

  const runGeneration = async (
    imageBase64 = sourceData,
    nextSettings = settings,
    nextPalette = palette,
    importedName?: string,
  ) => {
    if (!imageBase64) {
      setError("请先选择一张图片");
      return;
    }
    setBusy(true);
    setError(null);
    const requestId = ++generationId.current;
    const safeSettings = normalizeSettings(nextSettings);
    try {
      const result = await generatePattern({ imageBase64, settings: safeSettings, palette: nextPalette });
      if (requestId !== generationId.current) return;
      setPattern(result);
      if (importedName !== undefined) { setSourceData(imageBase64); setProjectName(importedName); }
      setPatternSettings(safeSettings);
      setUndoStack([]); setRedoStack([]); setFocused(false); setZoom(1);
      setCompleted(new Set());
      setBoardIndex(0);
      setSelectedColor(result.usage[0]?.paletteIndex ?? null);
      setActiveTool("build");
      showNotice("图案已生成");
    } catch (generationError) {
      if (requestId === generationId.current) setError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      if (requestId === generationId.current) setBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("请选择 PNG、JPG、WebP 或 GIF 图片");
      return;
    }
    const requestId = ++generationId.current;
    setBusy(true);
    try {
      const data = await fileToDataUrl(file);
      if (requestId !== generationId.current) return;
      await runGeneration(data, settings, palette, file.name.replace(/\.[^.]+$/, "") || "未命名项目");
    } catch (readError) {
      if (requestId === generationId.current) { setBusy(false); setError(readError instanceof Error ? readError.message : String(readError)); }
    }
  };

  const loadDemo = () => {
    generationId.current += 1;
    setBusy(false);
    const result = createDemoPattern(palette, settings);
    setSourceData(null);
    setProjectName("橘猫肖像示例");
    setPattern(result);
    setPatternSettings(settings);
    setUndoStack([]); setRedoStack([]); setFocused(false); setZoom(1);
    setCompleted(new Set());
    setBoardIndex(0);
    setSelectedColor(result.usage[0]?.paletteIndex ?? null);
    setActiveTool("build");
    setError(null);
  };

  const boardCount = pattern
    ? pattern.metrics.boardsAcross * pattern.metrics.boardsDown
    : 0;
  const currentBoard = pattern
    ? boardOrigin(boardIndex, pattern.metrics.boardsAcross, pattern.metrics.boardSize)
    : null;
  const currentBoardLabel = currentBoard
    ? boardLabel(currentBoard.boardX, currentBoard.boardY)
    : "—";
  const completedBeads = pattern
    ? [...completed].filter((index) => pattern.cells[index] !== null).length
    : 0;
  const progress = pattern?.metrics.totalBeads
    ? Math.round((completedBeads / pattern.metrics.totalBeads) * 100)
    : 0;
  const selectedUsage = pattern?.usage.find((entry) => entry.paletteIndex === selectedColor);
  const regions = useMemo(() => pattern && selectedColor !== null
    ? findColorRegions(pattern, selectedColor, boardIndex)
    : [], [pattern, selectedColor, boardIndex]);
  const boardColorTotal = pattern && selectedColor !== null
    ? countBoardColor(pattern, selectedColor, boardIndex)
    : 0;
  const boardColorCompleted = regions.reduce(
    (sum, region) => sum + region.cells.filter((cell) => completed.has(cell)).length,
    0,
  );
  const effectivePatternSettings: GenerationSettings = useMemo(() => patternSettings
    ? { ...patternSettings, cellLabelMode: settings.cellLabelMode }
    : settings, [patternSettings, settings]);

  const snapshot = (): ProjectSnapshot | null => pattern ? {
    version: 1,
    name: projectName,
    createdAt: new Date().toISOString(),
    settings: effectivePatternSettings,
    palette,
    pattern,
    completedCells: [...completed],
  } : null;

  const exportProject = async (kind: "svg" | "csv" | "json") => {
    const project = snapshot();
    if (!project) return;
    const safeName = projectName.replace(/[\\/:*?"<>|]/g, "-") || "beadgrid-project";
    try {
      const saved = kind === "svg"
        ? await saveTextExport(`${safeName}.svg`, patternSvg(project), ["svg"], "SVG 图纸")
        : kind === "csv"
          ? await saveTextExport(`${safeName}-materials.csv`, usageCsv(project), ["csv"], "材料清单")
          : await saveTextExport(`${safeName}.beadgrid.json`, projectJson(project), ["json"], "BeadGrid 项目");
      if (saved) showNotice("文件已保存");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    }
  };

  const handleCellClick = (globalIndex: number) => {
    if (!pattern || busy) return;
    if (activeTool === "edit") {
      if (selectedColor === null || pattern.cells[globalIndex] === selectedColor) return;
      setUndoStack((current) => [...current.slice(-99), { index: globalIndex, before: pattern.cells[globalIndex], after: selectedColor, wasCompleted: completed.has(globalIndex) }]);
      setRedoStack([]);
      const cells = [...pattern.cells];
      cells[globalIndex] = selectedColor;
      setPattern(recalculatePattern({ ...pattern, cells }, palette, effectivePatternSettings));
      setCompleted((current) => { const next = new Set(current); next.delete(globalIndex); return next; });
      return;
    }
    if (activeTool !== "build" || pattern.cells[globalIndex] === null) return;
    setCompleted((current) => {
      const next = new Set(current);
      if (next.has(globalIndex)) next.delete(globalIndex);
      else next.add(globalIndex);
      return next;
    });
  };

  const restoreEdit = (direction: "undo" | "redo") => {
    if (!pattern || busy) return;
    const edits = direction === "undo" ? undoStack : redoStack;
    const edit = edits.at(-1);
    if (!edit) return;
    const cells = [...pattern.cells];
    cells[edit.index] = direction === "undo" ? edit.before : edit.after;
    setPattern(recalculatePattern({ ...pattern, cells }, palette, effectivePatternSettings));
    setCompleted((current) => {
      const next = new Set(current);
      if (direction === "undo" && edit.wasCompleted) next.add(edit.index); else next.delete(edit.index);
      return next;
    });
    if (direction === "undo") { setUndoStack(edits.slice(0, -1)); setRedoStack((current) => [...current, edit]); }
    else { setRedoStack(edits.slice(0, -1)); setUndoStack((current) => [...current, edit]); }
  };

  const toggleRegion = (cells: number[], checked: boolean) => {
    setCompleted((current) => {
      const next = new Set(current);
      for (const cell of cells) {
        if (checked) next.add(cell);
        else next.delete(cell);
      }
      return next;
    });
  };

  const updatePaletteColor = (index: number, update: Partial<BeadColor>) => {
    setPalette((current) => current.map((color, colorIndex) => colorIndex === index ? { ...color, ...update } : color));
  };

  const railItems: Array<{ tool: WorkspaceTool; label: string; icon: typeof FolderOpen }> = [
    { tool: "project", label: "项目与生成", icon: FolderOpen },
    { tool: "edit", label: "编辑图案", icon: Grid3X3 },
    { tool: "build", label: "摆放模式", icon: Hand },
    { tool: "inventory", label: "材料库存", icon: PackageOpen },
  ];

  const paletteEntries = activeTool === "edit"
    ? palette.flatMap((color, paletteIndex) => color.active ? [{ paletteIndex, count: pattern?.usage.find((entry) => entry.paletteIndex === paletteIndex)?.count ?? 0 }] : [])
    : pattern?.usage ?? [];

  return <>
    <div className="app-shell">
      <input ref={fileInput} className="sr-only" type="file" aria-label="导入图片文件"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void handleFile(file); }} />
      <header className="titlebar">
        <div className="brand"><span className="brand-mark" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span><div>BeadGrid<small>拼豆创作工作室</small></div></div>
        <span className="title-separator" />
        <div className="project-title"><span>当前项目</span><input className="project-title-input" value={projectName}
          onChange={(event) => setProjectName(event.target.value)} aria-label="项目名称" /></div>
        <div className="title-actions">
          <span className="local-label"><ShieldCheck size={14} />图片留在本机</span>
          <button className="icon-button" type="button" disabled={!pattern || busy} onClick={() => void exportProject("json")} title="保存项目 JSON" aria-label="保存项目 JSON"><Save size={17} /></button>
          <button className="icon-button" type="button" disabled={!pattern || busy} onClick={() => void exportProject("csv")} title="导出材料 CSV" aria-label="导出材料 CSV"><FileArchive size={17} /></button>
          <button className="secondary-button" type="button" disabled={!pattern || busy} onClick={() => window.print()} title="打印或另存 PDF"><Printer size={16} />打印图纸</button>
          <button className="primary-button" type="button" disabled={!pattern || busy} onClick={() => void exportProject("svg")}><FileDown size={16} />导出 SVG</button>
        </div>
      </header>
      <div className="workspace">
        <nav className="tool-rail" aria-label="工作区">
          {railItems.map(({ tool, label, icon: Icon }) => <button type="button"
            className={activeTool === tool ? "rail-button is-active" : "rail-button"}
            aria-label={label} aria-pressed={activeTool === tool} title={label} key={tool}
            onClick={() => setActiveTool(tool)}><Icon size={20} /><span>{{ project: "生成", edit: "编辑", build: "摆放", inventory: "材料" }[tool]}</span></button>)}
          <span className="rail-spacer" />
          <button type="button" className="rail-button" aria-label="使用帮助" onClick={() => helpDialog.current?.showModal()}><CircleHelp size={20} /><span>帮助</span></button>
        </nav>
        <main className="pattern-workspace">
          <div className="board-toolbar">
            <span className="workspace-kicker">{pattern ? "WORKSPACE" : "YOUR NEXT LITTLE JOY"}</span>
            <strong>{pattern ? "底板 " + currentBoardLabel : "创作，从一张图片开始"}</strong>
            {pattern && <div className="board-navigation">
              <button className="icon-button" type="button" disabled={boardIndex === 0} onClick={() => setBoardIndex((value) => Math.max(0, value - 1))} aria-label="上一块板"><ChevronLeft size={16} /></button>
              <span className="board-position">{boardIndex + 1} / {boardCount}</span>
              <button className="icon-button" type="button" disabled={boardIndex >= boardCount - 1} onClick={() => setBoardIndex((value) => Math.min(boardCount - 1, value + 1))} aria-label="下一块板"><ChevronRight size={16} /></button>
            </div>}
            <span className="toolbar-spacer" />
            {pattern && <select className="zoom-control" aria-label="画板缩放" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}><option value={1}>100%</option><option value={1.5}>150%</option><option value={2}>200%</option><option value={3}>300%</option></select>}
            {pattern && <div className="view-switch" aria-label="画板显示">
              <button type="button" aria-pressed={!showLabels} onClick={() => setShowLabels(false)}>拼豆</button>
              <button type="button" aria-pressed={showLabels} onClick={() => setShowLabels(true)}>标注</button>
            </div>}
            {activeTool === "build" && pattern && <button className={"secondary-button focus-button" + (focused ? " is-active" : "")} type="button" disabled={selectedColor === null} aria-pressed={focused} onClick={() => setFocused((value) => !value)}><Focus size={15} />聚焦颜色</button>}
            {activeTool === "edit" && <div className="edit-actions">
              <button className="icon-button" type="button" disabled={!undoStack.length || busy} onClick={() => restoreEdit("undo")} aria-label="撤销"><Undo2 size={17} /></button>
              <button className="icon-button" type="button" disabled={!redoStack.length || busy} onClick={() => restoreEdit("redo")} aria-label="重做"><Redo2 size={17} /></button>
            </div>}
          </div>
          {pattern && <div className="project-metrics">
            <span><strong>{pattern.width} × {pattern.height}</strong> 格</span>
            <span><strong>{pattern.metrics.totalBeads.toLocaleString()}</strong> 颗拼豆</span>
            <span><strong>{pattern.metrics.colorCount}</strong> 种颜色</span>
            <span><strong>{pattern.metrics.physicalWidthMm / 10} × {pattern.metrics.physicalHeightMm / 10}</strong> cm</span>
            <div className="project-progress"><span>已完成 <strong>{progress}%</strong></span><progress max={pattern.metrics.totalBeads || 1} value={completedBeads} aria-label="项目摆放进度" /></div>
          </div>}
          <div className={"board-stage" + (!pattern ? " is-empty" : "") + (pattern && zoom > 1 ? " is-zoomed" : "")} style={{ "--board-zoom": zoom } as React.CSSProperties}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void handleFile(file); }}>
            {pattern ? <BoardCanvas pattern={pattern} palette={palette} boardIndex={boardIndex}
              selectedColor={activeTool === "build" && focused ? selectedColor : null}
              completed={completed} mode={activeTool === "edit" ? "edit" : activeTool === "build" ? "build" : "view"}
              showLabels={showLabels} labelMode={settings.cellLabelMode} onCellClick={handleCellClick} />
            : <div className="welcome">
              <div className="welcome-copy">
                <span className="eyebrow"><i /> MAKE SOMETHING TANGIBLE</span>
                <h1>把喜欢的画面，<br /><em>一颗颗</em>变成真。</h1>
                <p>从一张照片，到一份清晰的拼豆图纸。<br />配色、分板、用量都准备好，只管享受开拼。</p>
                <div className="empty-actions">
                  <button className="primary-button" type="button" onClick={() => fileInput.current?.click()}><ImagePlus size={18} />导入你的图片<ArrowUpRight size={17} /></button>
                  <button className="text-button" type="button" onClick={loadDemo}>先玩一下示例 <ChevronRight size={16} /></button>
                </div>
                <span className="drop-hint">或将图片拖到这里 · PNG / JPG / WebP / GIF</span>
              </div>
              <div className="welcome-art" aria-label="橘猫拼豆示例">
                <span className="art-sticker">HAPPINESS,<br />PIECE BY PIECE.</span>
                <div className="sample-card"><div className="sample-card-top"><span>BEAD STUDY — 001</span><span>↗</span></div><PatternPreview pattern={welcomePattern} palette={DEFAULT_PALETTE} /><div className="sample-card-footer"><strong>今天，也要猫猫。</strong><span>58 × 58 · 6 色</span></div></div>
                <span className="loose-bead bead-one" /><span className="loose-bead bead-two" /><span className="loose-bead bead-three" />
              </div>
              <div className="welcome-steps"><div><span>01</span><strong>选一张喜欢的图</strong><small>照片、插画，灵感不限</small></div><div><span>02</span><strong>调成你的配色</strong><small>适配底板，匹配现有库存</small></div><div><span>03</span><strong>跟着图纸开拼</strong><small>色号、坐标、用量一目了然</small></div></div>
            </div>}
            {busy && <div className="busy-overlay" role="status"><span className="spinner" />正在生成拼豆方案…</div>}
          </div>
          <div className="palette-bar" aria-label="图案颜色">
            <div className="palette-heading"><strong>{activeTool === "edit" ? "画笔色盘" : "作品色盘"}</strong><span>{pattern ? paletteEntries.length + " COLORS" : "YOUR PALETTE"}</span></div>
            <div className="palette-scroll">
              {pattern && paletteEntries.map((entry) => { const color = palette[entry.paletteIndex]; return <button type="button"
                className={selectedColor === entry.paletteIndex ? "palette-button is-selected" : "palette-button"}
                aria-label={`${color.code} ${color.name}，${entry.count} 颗`} title={color.name}
                aria-pressed={selectedColor === entry.paletteIndex} key={color.id} onClick={() => setSelectedColor(entry.paletteIndex)}>
                <span className="palette-chip" style={{ background: color.hex }} /><strong>{color.code}</strong><small>{entry.count}</small>
              </button>; })}
              {!pattern && <><div className="preview-swatches" aria-hidden="true">{["#e68e52", "#eed7af", "#e9acb3", "#709e80", "#655045", "#f3efe4"].map((color) => <i key={color} style={{ background: color }} />)}</div><span className="palette-empty">一点色彩，很多可能。</span></>}
            </div>
            <span className="palette-note">{pattern ? "点击选色" : "等你来创作"}</span>
          </div>
        </main>
        <aside className="inspector">
          {activeTool === "project" && <ProjectInspector sourceData={sourceData} settings={settings} setSettings={setSettings}
            busy={busy} hasPattern={Boolean(pattern)} onChooseImage={() => fileInput.current?.click()} onGenerate={() => void runGeneration()} onDemo={loadDemo} />}
          {activeTool === "edit" && <EditInspector pattern={pattern} palette={palette} selectedColor={selectedColor}
            canReset={Boolean(sourceData) && !busy} onReset={() => void runGeneration()} />}
          {activeTool === "build" && <BuildInspector pattern={pattern} palette={palette} selectedColor={selectedColor} selectedUsage={selectedUsage}
            boardColorTotal={boardColorTotal} boardColorCompleted={boardColorCompleted} regions={regions} completed={completed} onToggleRegion={toggleRegion} />}
          {activeTool === "inventory" && <InventoryInspector palette={palette} onChange={updatePaletteColor} />}
          {pattern && activeTool !== "inventory" && <PatternOverview pattern={pattern} palette={palette} boardIndex={boardIndex} onBoardChange={setBoardIndex} />}
        </aside>
      </div>
      <footer className="statusbar"><span><i />{isTauri() ? "桌面生成引擎 · CIEDE2000" : "浏览器预览 · 最终图纸请在桌面生成"}</span><span>{pattern ? getDeviceProfile(effectivePatternSettings.deviceProfileId).brand + " · " + effectivePatternSettings.boardSize + " × " + effectivePatternSettings.boardSize + " 钉 · " + effectivePatternSettings.beadPitchMm + " mm 节距" : "本地处理 · 无需上传图片"}<span className="status-version">BeadGrid 0.1</span></span></footer>
      {error && <div className="error-toast" role="alert"><TriangleAlert size={16} />{error}<button type="button" onClick={() => setError(null)}>关闭</button></div>}
      {notice && <div className="notice-toast" role="status"><Check size={16} />{notice}</div>}
      <dialog ref={helpDialog} className="help-dialog">
        <form method="dialog"><button className="icon-button" aria-label="关闭帮助"><X size={20} /></button></form>
        <span className="eyebrow">A LITTLE GUIDE</span><h2>慢慢拼，享受每一颗。</h2>
        <p>导入图片，选择与你手中设备一致的底板，再生成图纸。编辑模式可单格改色和撤销；摆放模式可逐颗或按区域标记完成。</p>
        <p>点击作品全貌切换底板。「聚焦颜色」隐藏其他颜色的干扰；「标注」显示色号或符号。画板也支持方向键移动、回车操作。</p>
        <div className="warning-panel"><TriangleAlert size={18} /><span>Starter 色板是屏幕近似值，不对应实体品牌色号。制作前请核对实体色卡；打印选 100% 原始尺寸，用 50 mm 校准线检查比例。</span></div>
        <p className="inspector-note">偏好与库存自动保存在本机。图案与摆放进度暂不自动恢复，关闭前请保存项目 JSON 作为备份；当前版本尚不支持重新导入。</p>
      </dialog>
    </div>
    <PrintSheet name={projectName} pattern={pattern} palette={palette} settings={effectivePatternSettings} />
  </>;
}

interface ProjectInspectorProps {
  sourceData: string | null;
  settings: GenerationSettings;
  setSettings: React.Dispatch<React.SetStateAction<GenerationSettings>>;
  busy: boolean;
  hasPattern: boolean;
  onChooseImage: () => void;
  onGenerate: () => void;
  onDemo: () => void;
}

function ProjectInspector({ sourceData, settings, setSettings, busy, hasPattern, onChooseImage, onGenerate, onDemo }: ProjectInspectorProps) {
  const update = <Key extends keyof GenerationSettings>(key: Key, value: GenerationSettings[Key]) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const device = getDeviceProfile(settings.deviceProfileId);
  const presets = [1, 2, 3].map((boards) => settings.boardSize * boards);
  return <>
    <div className="inspector-heading"><div><span>PROJECT</span><h2>项目与生成</h2></div><span className="status-badge">本地处理</span></div>
    {sourceData ? <div className="source-preview"><img src={sourceData} alt="当前原图" /><button type="button" onClick={onChooseImage}><Upload size={14} />更换图片</button></div> : <button className="source-drop" type="button" onClick={onChooseImage}><ImagePlus size={22} /><strong>选择图片</strong><span>PNG · JPG · WebP · GIF</span></button>}
    <div className="section-title"><span>设备与底板</span><span>{device.beadDiameterMm} mm</span></div>
    <label className="select-field">设备配置<select
      value={device.id}
      onChange={(event) => {
        const next = getDeviceProfile(event.target.value);
        setSettings((current) => applyDeviceProfile(current, next));
      }}
    >{DEVICE_PROFILES.map((profile) => <option value={profile.id} key={profile.id}>{profile.brand} · {profile.name}</option>)}</select></label>
    <div className="device-summary">
      <strong>{device.boardSize} × {device.boardSize} 钉 · {device.pegPitchMm} mm 节距</strong>
      <span>单板拼图区约 {device.boardSize * device.pegPitchMm} × {device.boardSize * device.pegPitchMm} mm{device.linkable ? " · 可连接" : ""}</span>
      <small>{device.note}</small>
    </div>
    <div className="section-title"><span>图案尺寸</span><span>{settings.width} × {settings.height}</span></div>
    <div className="preset-row">{presets.map((size) => <button type="button" className={settings.width === size && settings.height === size ? "preset is-active" : "preset"} key={size} onClick={() => setSettings((current) => ({ ...current, width: size, height: size }))}>{size}</button>)}</div>
    <div className="field-pair">
      <label>宽 · 格<input type="number" min="8" max="300" value={settings.width} onChange={(event) => update("width", clampInteger(Number(event.target.value), 8, 300))} /></label>
      <label>高 · 格<input type="number" min="8" max="300" value={settings.height} onChange={(event) => update("height", clampInteger(Number(event.target.value), 8, 300))} /></label>
    </div>
    <label className="select-field">适配方式<select value={settings.fitMode} onChange={(event) => update("fitMode", event.target.value as GenerationSettings["fitMode"])}><option value="cover">填满裁切</option><option value="contain">完整留白</option><option value="stretch">拉伸</option></select></label>
    <label className="select-field">图纸格内标注<select value={settings.cellLabelMode} onChange={(event) => update("cellLabelMode", event.target.value as GenerationSettings["cellLabelMode"])}><option value="code">实际色号（推荐）</option><option value="symbol">简写符号</option></select></label>
    <label className="range-field"><span>颜色上限 <strong>{settings.maxColors} 色</strong></span><input type="range" min="4" max={Math.min(40, DEFAULT_PALETTE.length)} value={settings.maxColors} onChange={(event) => update("maxColors", Number(event.target.value))} /></label>
    <label className="range-field"><span>零散点清理 <strong>{["关闭", "适中", "强"][settings.cleanup]}</strong></span><input type="range" min="0" max="2" value={settings.cleanup} onChange={(event) => update("cleanup", Number(event.target.value))} /></label>
    <label className="switch-row"><input type="checkbox" checked={settings.dithering} onChange={(event) => update("dithering", event.target.checked)} /><span><strong>渐变抖动</strong><small>更平滑，但会增加交错单豆</small></span></label>
    <label className="switch-row"><input type="checkbox" checked={settings.respectInventory} onChange={(event) => update("respectInventory", event.target.checked)} /><span><strong>遵守库存</strong><small>不足时自动寻找相近替代色</small></span></label>
    {!isTauri() && <p className="inspector-note">浏览器仅预览配色；库存替代、抖动与清理需在桌面应用中运行。</p>}
    <div className="generation-actions"><button className="primary-button inspector-primary" type="button" disabled={busy || !sourceData} onClick={onGenerate}><WandSparkles size={16} />{busy ? "正在生成…" : hasPattern ? "重新生成图案" : "生成我的图纸"}</button>
    {!sourceData && <button className="secondary-button inspector-secondary" type="button" disabled={busy} onClick={onDemo}><Sparkles size={16} />载入橘猫示例</button>}</div>
  </>;
}

interface EditInspectorProps {
  pattern: PatternResult | null;
  palette: BeadColor[];
  selectedColor: number | null;
  onReset: () => void;
  canReset: boolean;
}

function EditInspector({ palette, selectedColor, onReset, canReset }: EditInspectorProps) {
  const bead = selectedColor === null ? null : palette[selectedColor];
  return <>
    <div className="inspector-heading"><div><span>EDIT</span><h2>图案编辑</h2></div><span className="status-badge">画笔</span></div>
    {bead ? <div className="current-color"><span style={{ background: bead.hex }} /><div><strong>{bead.code} {bead.name}</strong><small>点击工作板格子替换为当前颜色</small></div></div> : <div className="empty-inspector">请先生成图案并选择一种颜色。</div>}
    <div className="instruction-list">
      <div><span>1</span><p>从底部色盘选择颜色</p></div>
      <div><span>2</span><p>点击工作板中的任意格子上色</p></div>
      <div><span>3</span><p>材料数量与缺口会立即重算</p></div>
    </div>
    <button className="secondary-button inspector-primary" type="button" disabled={!canReset} onClick={onReset}><RotateCcw size={16} />从原图重新生成</button>
    <p className="inspector-note">工具栏可撤销或重做最近 100 次改色。修改已摆放的拼豆会清除该格完成标记，方便重新核对。</p>
  </>;
}

interface BuildInspectorProps {
  pattern: PatternResult | null;
  palette: BeadColor[];
  selectedColor: number | null;
  selectedUsage: PatternResult["usage"][number] | undefined;
  boardColorTotal: number;
  boardColorCompleted: number;
  regions: ReturnType<typeof findColorRegions>;
  completed: Set<number>;
  onToggleRegion: (cells: number[], checked: boolean) => void;
}

function BuildInspector({ pattern, palette, selectedColor, selectedUsage, boardColorTotal, boardColorCompleted, regions, completed, onToggleRegion }: BuildInspectorProps) {
  const bead = selectedColor === null ? null : palette[selectedColor];
  return <>
    <div className="inspector-heading"><div><span>ONE BEAD AT A TIME</span><h2>摆放队列</h2></div>{pattern && <span className="live-badge">进行中</span>}</div>
    {!pattern || !bead ? <div className="empty-inspector"><Hand size={24} /><p>生成图案后，这里会按颜色和连续区域拆解摆放任务。</p></div> : <>
      <div className="current-color"><span style={{ background: bead.hex }} /><div><strong>{bead.code} {bead.name}</strong><small>本板剩余 {Math.max(0, boardColorTotal - boardColorCompleted)} / {boardColorTotal} 颗</small></div></div>
      <div className="section-title"><span>连续区域</span><span>{regions.length} 个区域</span></div>
      <div className="region-list">
        {regions.map((region, index) => {
          const done = region.cells.every((cell) => completed.has(cell));
          const partial = !done && region.cells.some((cell) => completed.has(cell));
          return <label className="region-row" key={region.id}>
            <input type="checkbox" checked={done} ref={(element) => { if (element) element.indeterminate = partial; }} onChange={(event) => onToggleRegion(region.cells, event.target.checked)} />
            <span>区域 {String(index + 1).padStart(2, "0")}</span><strong>{region.cells.length} <small>颗</small></strong>
          </label>;
        })}
        {!regions.length && <p className="inspector-note">当前板没有使用此颜色。</p>}
      </div>
      {selectedUsage && <div className="inventory-summary"><span>项目总需</span><strong>{selectedUsage.count}</strong><span>当前库存</span><strong>{selectedUsage.inventory}</strong></div>}
      {selectedUsage && selectedUsage.shortage > 0 && <div className="warning-panel"><TriangleAlert size={17} /><span>库存不足 {selectedUsage.shortage} 颗，建议购买 {selectedUsage.bagsNeeded} 袋或重新生成替代方案。</span></div>}
      {pattern.warnings.filter((warning) => !warning.includes(bead.code)).slice(0, 2).map((warning) => <div className="warning-panel compact" key={warning}><TriangleAlert size={15} /><span>{warning}</span></div>)}
    </>}
  </>;
}

interface InventoryInspectorProps {
  palette: BeadColor[];
  onChange: (index: number, update: Partial<BeadColor>) => void;
}

function InventoryInspector({ palette, onChange }: InventoryInspectorProps) {
  const active = palette.filter((color) => color.active).length;
  return <>
    <div className="inspector-heading"><div><span>INVENTORY</span><h2>材料库存</h2></div><span className="status-badge">{active} 色启用</span></div>
    <p className="inspector-note">Starter 色板为屏幕近似，不对应实体品牌色号。库存变更即时更新材料缺口；启用 / 关闭颜色将在重新生成时生效。</p>
    <div className="inventory-list">
      {palette.map((color, index) => <div className={color.active ? "inventory-row" : "inventory-row is-disabled"} key={color.id}>
        <input type="checkbox" checked={color.active} onChange={(event) => onChange(index, { active: event.target.checked })} aria-label={`启用 ${color.code}`} />
        <span className="inventory-chip" style={{ background: color.hex }} />
        <div><strong>{color.code} {color.name}</strong><small>{color.series}</small></div>
        <input type="number" min="0" max="999999" value={color.inventory} onChange={(event) => onChange(index, { inventory: clampInteger(Number(event.target.value), 0, 999999) })} aria-label={`${color.code} 库存`} />
      </div>)}
    </div>
  </>;
}
