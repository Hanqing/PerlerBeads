export type FitMode = "cover" | "contain" | "stretch";
export type CellLabelMode = "code" | "symbol";
export type WorkspaceTool = "project" | "edit" | "build" | "inventory";

export interface DeviceProfile {
  id: string;
  brand: string;
  name: string;
  beadDiameterMm: number;
  pegPitchMm: number;
  boardSize: number;
  linkable: boolean;
  sourceKind: "reference" | "official";
  sourceUrl?: string;
  note: string;
}

export interface GenerationSettings {
  width: number;
  height: number;
  maxColors: number;
  alphaThreshold: number;
  cleanup: number;
  dithering: boolean;
  respectInventory: boolean;
  fitMode: FitMode;
  boardSize: number;
  beadPitchMm: number;
  deviceProfileId: string;
  cellLabelMode: CellLabelMode;
}

export interface BeadColor {
  id: string;
  brand: string;
  series: string;
  code: string;
  name: string;
  hex: string;
  rgb: [number, number, number];
  inventory: number;
  bagSize: number;
  active: boolean;
}

export interface GenerateRequest {
  imageBase64: string;
  settings: GenerationSettings;
  palette: BeadColor[];
}

export interface ColorUsage {
  paletteIndex: number;
  count: number;
  inventory: number;
  shortage: number;
  bagsNeeded: number;
}

export interface PatternMetrics {
  totalBeads: number;
  colorCount: number;
  boardSize: number;
  boardsAcross: number;
  boardsDown: number;
  physicalWidthMm: number;
  physicalHeightMm: number;
  meanDeltaE: number;
  isolatedBeads: number;
}

export interface PatternResult {
  width: number;
  height: number;
  cells: Array<number | null>;
  selectedPaletteIndices: number[];
  usage: ColorUsage[];
  metrics: PatternMetrics;
  warnings: string[];
}

export interface ProjectSnapshot {
  version: 1;
  name: string;
  createdAt: string;
  settings: GenerationSettings;
  palette: BeadColor[];
  pattern: PatternResult;
  completedCells: number[];
}

export interface ColorRegion {
  id: number;
  cells: number[];
}
