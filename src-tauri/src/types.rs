use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRequest {
    pub image_base64: String,
    pub settings: GenerationSettings,
    pub palette: Vec<BeadColor>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationSettings {
    pub width: u32,
    pub height: u32,
    pub max_colors: usize,
    pub alpha_threshold: f32,
    pub cleanup: u8,
    pub dithering: bool,
    pub respect_inventory: bool,
    pub fit_mode: FitMode,
    pub board_size: u32,
    pub bead_pitch_mm: f32,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FitMode {
    Cover,
    Contain,
    Stretch,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BeadColor {
    pub id: String,
    pub brand: String,
    pub series: String,
    pub code: String,
    pub name: String,
    pub hex: String,
    pub rgb: [u8; 3],
    pub inventory: u32,
    pub bag_size: u32,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatternResult {
    pub width: u32,
    pub height: u32,
    pub cells: Vec<Option<usize>>,
    pub selected_palette_indices: Vec<usize>,
    pub usage: Vec<ColorUsage>,
    pub metrics: PatternMetrics,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorUsage {
    pub palette_index: usize,
    pub count: u32,
    pub inventory: u32,
    pub shortage: u32,
    pub bags_needed: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatternMetrics {
    pub total_beads: u32,
    pub color_count: usize,
    pub board_size: u32,
    pub boards_across: u32,
    pub boards_down: u32,
    pub physical_width_mm: f32,
    pub physical_height_mm: f32,
    pub mean_delta_e: f32,
    pub isolated_beads: u32,
}
