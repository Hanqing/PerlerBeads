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
  Pencil,
  Printer,
  RotateCcw,
  Save,
  Settings,
  Sparkles,
  TriangleAlert,
  Upload,
  WandSparkles,
} from "lucide-react";
import { BoardCanvas } from "./components/BoardCanvas";
import { PrintSheet } from "./components/PrintSheet";
import { applyDeviceProfile, DEVICE_PROFILES, getDeviceProfile } from "./data/devices";
import { DEFAULT_PALETTE, DEFAULT_SETTINGS } from "./data/palette";
import { generatePattern } from "./lib/api";
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
      settings: { ...DEFAULT_SETTINGS, ...saved.settings },
      palette: Array.isArray(saved.palette) && saved.palette.length ? saved.palette : DEFAULT_PALETTE,
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, palette }));
  }, [palette, settings]);

  useEffect(() => {
    if (!pattern) return;
    const used = pattern.usage.map((entry) => entry.paletteIndex);
    if (selectedColor === null || !used.includes(selectedColor)) {
      setSelectedColor(used[0] ?? null);
    }
    const maxBoard = pattern.metrics.boardsAcross * pattern.metrics.boardsDown - 1;
    if (boardIndex > maxBoard) setBoardIndex(Math.max(0, maxBoard));
  }, [boardIndex, pattern, selectedColor]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? null : current), 2600);
  };

  const runGeneration = async (
    imageBase64 = sourceData,
    nextSettings = settings,
    nextPalette = palette,
  ) => {
    if (!imageBase64) {
      setError("请先选择一张图片");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await generatePattern({ imageBase64, settings: nextSettings, palette: nextPalette });
      setPattern(result);
      setPatternSettings(nextSettings);
      setCompleted(new Set());
      setBoardIndex(0);
      setSelectedColor(result.usage[0]?.paletteIndex ?? null);
      setActiveTool("build");
      showNotice("图案已生成");
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("请选择 PNG、JPG、WebP 或 GIF 图片");
      return;
    }
    try {
      const data = await fileToDataUrl(file);
      setSourceData(data);
      setProjectName(file.name.replace(/\.[^.]+$/, "") || "未命名项目");
      await runGeneration(data);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : String(readError));
    }
  };

  const loadDemo = () => {
    const result = createDemoPattern(palette);
    setSourceData(null);
    setProjectName("橘猫肖像示例");
    setPattern(result);
    setPatternSettings(DEFAULT_SETTINGS);
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
  const selectedBead = selectedColor === null ? null : palette[selectedColor];
  const regions = pattern && selectedColor !== null
    ? findColorRegions(pattern, selectedColor, boardIndex)
    : [];
  const boardColorTotal = pattern && selectedColor !== null
    ? countBoardColor(pattern, selectedColor, boardIndex)
    : 0;
  const boardColorCompleted = regions.reduce(
    (sum, region) => sum + region.cells.filter((cell) => completed.has(cell)).length,
    0,
  );
  const effectivePatternSettings: GenerationSettings = patternSettings
    ? { ...patternSettings, cellLabelMode: settings.cellLabelMode }
    : settings;

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
    if (!pattern) return;
    if (activeTool === "edit") {
      if (selectedColor === null) return;
      const cells = [...pattern.cells];
      cells[globalIndex] = selectedColor;
      setPattern(recalculatePattern({ ...pattern, cells }, palette, effectivePatternSettings));
      return;
    }
    setCompleted((current) => {
      const next = new Set(current);
      if (next.has(globalIndex)) next.delete(globalIndex);
      else next.add(globalIndex);
      return next;
    });
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

  return <>
    <div className="app-shell">
      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => event.target.files?.[0] && void handleFile(event.target.files[0])}
      />
      <header className="titlebar">
        <div className="brand">BEADGRID</div>
        <span className="title-separator">/</span>
        <input
          className="project-title-input"
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          aria-label="项目名称"
        />
        {pattern && <span className="title-context">/ 板 {currentBoardLabel}</span>}
        <div className="title-actions">
          <button className="icon-button" type="button" onClick={() => void exportProject("json")} title="保存项目 JSON" aria-label="保存项目 JSON"><Save size={16} /></button>
          <button className="icon-button" type="button" onClick={() => void exportProject("svg")} title="导出 SVG 图纸" aria-label="导出 SVG 图纸"><FileDown size={16} /></button>
          <button className="icon-button" type="button" onClick={() => void exportProject("csv")} title="导出材料 CSV" aria-label="导出材料 CSV"><FileArchive size={16} /></button>
          <button className="icon-button" type="button" onClick={() => window.print()} title="打印或另存 PDF" aria-label="打印或另存 PDF"><Printer size={16} /></button>
          <button className="icon-button" type="button" onClick={() => setActiveTool("project")} title="生成设置" aria-label="生成设置"><Settings size={16} /></button>
        </div>
      </header>

      <div className="workspace">
        <nav className="tool-rail" aria-label="工作区">
          {railItems.map(({ tool, label, icon: Icon }) => <button
            type="button"
            className={activeTool === tool ? "rail-button is-active" : "rail-button"}
            aria-label={label}
            title={label}
            key={tool}
            onClick={() => setActiveTool(tool)}
          ><Icon size={17} /></button>)}
          <span className="rail-spacer" />
          <button type="button" className="rail-button" aria-label="帮助" title="点击格子可编辑或标记完成"><CircleHelp size={17} /></button>
        </nav>

        <main className="pattern-workspace">
          <div className="board-toolbar">
            <strong>板 {currentBoardLabel}</strong>
            <button className="icon-button" type="button" disabled={!pattern || boardIndex === 0} onClick={() => setBoardIndex((value) => Math.max(0, value - 1))} aria-label="上一块板"><ChevronLeft size={17} /></button>
            <button className="icon-button" type="button" disabled={!pattern || boardIndex >= boardCount - 1} onClick={() => setBoardIndex((value) => Math.min(boardCount - 1, value + 1))} aria-label="下一块板"><ChevronRight size={17} /></button>
            {pattern && <span className="board-position">第 {boardIndex + 1} / {boardCount} 块</span>}
            <span className="toolbar-spacer" />
            {activeTool === "build" && pattern && <>
              <span className="progress-copy">已完成 {completedBeads.toLocaleString()} / {pattern.metrics.totalBeads.toLocaleString()} · {progress}%</span>
              <button className="secondary-button" type="button" onClick={() => selectedColor === null ? null : setSelectedColor(selectedColor)}><Focus size={15} />聚焦当前颜色</button>
            </>}
            {activeTool === "edit" && <span className="mode-pill"><Pencil size={14} />编辑模式</span>}
          </div>

          <div
            className="board-stage"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
          >
            {pattern ? <BoardCanvas
              pattern={pattern}
              palette={palette}
              boardIndex={boardIndex}
              selectedColor={activeTool === "build" ? selectedColor : null}
              completed={completed}
              mode={activeTool === "edit" ? "edit" : "build"}
              onCellClick={handleCellClick}
            /> : <div className="empty-state">
              <span className="empty-mark"><Sparkles size={26} /></span>
              <h1>把图片变成可直接开拼的图纸</h1>
              <p>图片只在本机处理。支持设备预设、透明背景、品牌色板、库存约束和自动分板。</p>
              <div className="empty-actions">
                <button className="primary-button" type="button" onClick={() => fileInput.current?.click()}><ImagePlus size={17} />选择图片</button>
                <button className="secondary-button" type="button" onClick={loadDemo}><WandSparkles size={17} />载入示例</button>
              </div>
              <span>也可以把图片拖到这里</span>
            </div>}
            {busy && <div className="busy-overlay"><span className="spinner" />正在生成拼豆方案…</div>}
          </div>

          <div className="palette-bar" aria-label="图案颜色">
            <span className="palette-heading">颜色</span>
            {pattern?.usage.map((entry) => {
              const color = palette[entry.paletteIndex];
              return <button
                type="button"
                className={selectedColor === entry.paletteIndex ? "palette-button is-selected" : "palette-button"}
                aria-pressed={selectedColor === entry.paletteIndex}
                key={color.id}
                onClick={() => setSelectedColor(entry.paletteIndex)}
              >
                <span className="palette-chip" style={{ background: color.hex }} />
                <strong>{color.code}</strong>
                <small>{entry.count}</small>
              </button>;
            })}
            {!pattern && <span className="palette-empty">生成图案后，使用到的颜色会显示在这里</span>}
          </div>
        </main>

        <aside className="inspector">
          {activeTool === "project" && <ProjectInspector
            sourceData={sourceData}
            settings={settings}
            setSettings={setSettings}
            busy={busy}
            hasPattern={Boolean(pattern)}
            onChooseImage={() => fileInput.current?.click()}
            onGenerate={() => void runGeneration()}
            onDemo={loadDemo}
          />}
          {activeTool === "edit" && <EditInspector
            pattern={pattern}
            palette={palette}
            selectedColor={selectedColor}
            onReset={() => pattern && sourceData && void runGeneration()}
          />}
          {activeTool === "build" && <BuildInspector
            pattern={pattern}
            palette={palette}
            selectedColor={selectedColor}
            selectedUsage={selectedUsage}
            boardColorTotal={boardColorTotal}
            boardColorCompleted={boardColorCompleted}
            regions={regions}
            completed={completed}
            onToggleRegion={toggleRegion}
          />}
          {activeTool === "inventory" && <InventoryInspector palette={palette} onChange={updatePaletteColor} />}
        </aside>
      </div>

      {error && <div className="error-toast" role="alert"><TriangleAlert size={16} />{error}<button type="button" onClick={() => setError(null)}>关闭</button></div>}
      {notice && <div className="notice-toast" role="status"><Check size={16} />{notice}</div>}
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
      <label>宽<input type="number" min="8" max="300" value={settings.width} onChange={(event) => update("width", Math.max(8, Number(event.target.value)))} /></label>
      <label>高<input type="number" min="8" max="300" value={settings.height} onChange={(event) => update("height", Math.max(8, Number(event.target.value)))} /></label>
    </div>
    <label className="select-field">适配方式<select value={settings.fitMode} onChange={(event) => update("fitMode", event.target.value as GenerationSettings["fitMode"])}><option value="cover">填满裁切</option><option value="contain">完整留白</option><option value="stretch">拉伸</option></select></label>
    <label className="select-field">图纸格内标注<select value={settings.cellLabelMode} onChange={(event) => update("cellLabelMode", event.target.value as GenerationSettings["cellLabelMode"])}><option value="code">实际色号（推荐）</option><option value="symbol">简写符号</option></select></label>
    <label className="range-field"><span>颜色上限 <strong>{settings.maxColors} 色</strong></span><input type="range" min="4" max={Math.min(40, DEFAULT_PALETTE.length)} value={settings.maxColors} onChange={(event) => update("maxColors", Number(event.target.value))} /></label>
    <label className="range-field"><span>零散点清理 <strong>{["关闭", "适中", "强"][settings.cleanup]}</strong></span><input type="range" min="0" max="2" value={settings.cleanup} onChange={(event) => update("cleanup", Number(event.target.value))} /></label>
    <label className="switch-row"><input type="checkbox" checked={settings.dithering} onChange={(event) => update("dithering", event.target.checked)} /><span><strong>渐变抖动</strong><small>更平滑，但会增加交错单豆</small></span></label>
    <label className="switch-row"><input type="checkbox" checked={settings.respectInventory} onChange={(event) => update("respectInventory", event.target.checked)} /><span><strong>遵守库存</strong><small>不足时自动寻找相近替代色</small></span></label>
    <button className="primary-button inspector-primary" type="button" disabled={busy || !sourceData} onClick={onGenerate}><WandSparkles size={16} />{hasPattern ? "重新生成" : "生成图案"}</button>
    {!sourceData && <button className="secondary-button inspector-secondary" type="button" onClick={onDemo}><Sparkles size={16} />载入橘猫示例</button>}
  </>;
}

interface EditInspectorProps {
  pattern: PatternResult | null;
  palette: BeadColor[];
  selectedColor: number | null;
  onReset: () => void;
}

function EditInspector({ pattern, palette, selectedColor, onReset }: EditInspectorProps) {
  const bead = selectedColor === null ? null : palette[selectedColor];
  return <>
    <div className="inspector-heading"><div><span>EDIT</span><h2>图案编辑</h2></div><span className="status-badge">画笔</span></div>
    {bead ? <div className="current-color"><span style={{ background: bead.hex }} /><div><strong>{bead.code} {bead.name}</strong><small>点击工作板格子替换为当前颜色</small></div></div> : <div className="empty-inspector">请先生成图案并选择一种颜色。</div>}
    <div className="instruction-list">
      <div><span>1</span><p>从底部色盘选择颜色</p></div>
      <div><span>2</span><p>点击工作板中的任意格子上色</p></div>
      <div><span>3</span><p>材料数量与缺口会立即重算</p></div>
    </div>
    <button className="secondary-button inspector-primary" type="button" disabled={!pattern} onClick={onReset}><RotateCcw size={16} />恢复自动生成结果</button>
    <p className="inspector-note">当前 MVP 已支持单格改色；区域选择、撤销栈和移动工具可在下一轮继续扩展。</p>
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
    <div className="inspector-heading"><div><span>BUILD</span><h2>摆放队列</h2></div><span className="live-badge">进行中</span></div>
    {!pattern || !bead ? <div className="empty-inspector"><Hand size={24} /><p>生成图案后，这里会按颜色和连续区域拆解摆放任务。</p></div> : <>
      <div className="current-color"><span style={{ background: bead.hex }} /><div><strong>{bead.code} {bead.name}</strong><small>本板剩余 {Math.max(0, boardColorTotal - boardColorCompleted)} / {boardColorTotal} 颗</small></div></div>
      <div className="region-list">
        {regions.slice(0, 8).map((region, index) => {
          const done = region.cells.every((cell) => completed.has(cell));
          const partial = !done && region.cells.some((cell) => completed.has(cell));
          return <label className="region-row" key={region.id}>
            <input type="checkbox" checked={done} ref={(element) => { if (element) element.indeterminate = partial; }} onChange={(event) => onToggleRegion(region.cells, event.target.checked)} />
            <span>区域 {String(index + 1).padStart(2, "0")}</span><strong>{region.cells.length}</strong>
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
    <p className="inspector-note">首版色值为屏幕近似。可关闭没有的颜色，并录入当前颗数。</p>
    <div className="inventory-list">
      {palette.map((color, index) => <div className={color.active ? "inventory-row" : "inventory-row is-disabled"} key={color.id}>
        <input type="checkbox" checked={color.active} onChange={(event) => onChange(index, { active: event.target.checked })} aria-label={`启用 ${color.code}`} />
        <span className="inventory-chip" style={{ background: color.hex }} />
        <div><strong>{color.code} {color.name}</strong><small>{color.series}</small></div>
        <input type="number" min="0" value={color.inventory} onChange={(event) => onChange(index, { inventory: Math.max(0, Number(event.target.value)) })} aria-label={`${color.code} 库存`} />
      </div>)}
    </div>
  </>;
}
