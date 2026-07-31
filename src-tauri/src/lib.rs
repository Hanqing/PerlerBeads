mod generator;
mod types;

use std::{fs, path::PathBuf};

use types::{GenerateRequest, PatternResult};

#[tauri::command]
fn generate_pattern(request: GenerateRequest) -> Result<PatternResult, String> {
    generator::generate(request).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_text_file(path: String, contents: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err("目标目录不存在".into());
        }
    }
    fs::write(path, contents).map_err(|error| format!("保存失败：{error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![generate_pattern, save_text_file])
        .run(tauri::generate_context!())
        .expect("error while running BeadGrid");
}
