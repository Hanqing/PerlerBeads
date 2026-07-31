use std::{cmp::Ordering, collections::HashMap};

#[cfg(test)]
use std::io::Cursor;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{DynamicImage, GenericImageView};
use thiserror::Error;

use crate::types::{
    BeadColor, ColorUsage, FitMode, GenerateRequest, GenerationSettings, PatternMetrics,
    PatternResult,
};

#[derive(Debug, Error)]
pub enum GeneratorError {
    #[error("图片数据不是有效的 Base64")]
    InvalidBase64,
    #[error("无法解码图片：{0}")]
    InvalidImage(String),
    #[error("图案尺寸必须在 1 到 300 之间")]
    InvalidSize,
    #[error("请至少启用一种拼豆颜色")]
    EmptyPalette,
}

#[derive(Debug, Clone, Copy)]
struct Lab {
    l: f32,
    a: f32,
    b: f32,
}

#[derive(Debug, Clone, Copy)]
struct Sample {
    linear: [f32; 3],
    lab: Lab,
}

type PaletteAlternative = (f32, usize);
type ReplacementCandidate = (f32, usize, Vec<PaletteAlternative>);

pub fn generate(request: GenerateRequest) -> Result<PatternResult, GeneratorError> {
    validate(&request.settings, &request.palette)?;
    let image = decode_image(&request.image_base64)?;
    generate_from_image(&image, &request.settings, &request.palette)
}

fn validate(settings: &GenerationSettings, palette: &[BeadColor]) -> Result<(), GeneratorError> {
    if settings.width == 0 || settings.height == 0 || settings.width > 300 || settings.height > 300
    {
        return Err(GeneratorError::InvalidSize);
    }
    if !palette.iter().any(|color| color.active) {
        return Err(GeneratorError::EmptyPalette);
    }
    Ok(())
}

fn decode_image(data_url: &str) -> Result<DynamicImage, GeneratorError> {
    let encoded = data_url.split_once(',').map_or(data_url, |(_, data)| data);
    let bytes = STANDARD
        .decode(encoded.trim())
        .map_err(|_| GeneratorError::InvalidBase64)?;
    image::load_from_memory(&bytes).map_err(|error| GeneratorError::InvalidImage(error.to_string()))
}

fn generate_from_image(
    image: &DynamicImage,
    settings: &GenerationSettings,
    palette: &[BeadColor],
) -> Result<PatternResult, GeneratorError> {
    let samples = sample_image(image, settings);
    let palette_labs: Vec<Lab> = palette.iter().map(|color| srgb_to_lab(color.rgb)).collect();
    let palette_linear: Vec<[f32; 3]> = palette
        .iter()
        .map(|color| {
            color
                .rgb
                .map(|channel| srgb_channel_to_linear(channel as f32 / 255.0))
        })
        .collect();
    let candidates: Vec<usize> = palette
        .iter()
        .enumerate()
        .filter_map(|(index, color)| color.active.then_some(index))
        .collect();
    let selected = select_palette(
        &samples,
        &palette_labs,
        &candidates,
        settings.max_colors.max(1),
    );

    let mut cells = if settings.dithering {
        assign_with_dithering(
            &samples,
            settings.width,
            settings.height,
            &selected,
            &palette_labs,
            &palette_linear,
        )
    } else {
        assign_nearest(&samples, &selected, &palette_labs)
    };

    if settings.cleanup > 0 {
        cleanup_isolated(
            &mut cells,
            &samples,
            settings.width,
            settings.height,
            &palette_labs,
            settings.cleanup,
        );
    }

    let mut warnings = Vec::new();
    if settings.respect_inventory {
        rebalance_inventory(
            &mut cells,
            &samples,
            &selected,
            palette,
            &palette_labs,
            &mut warnings,
        );
    }

    let usage = build_usage(&cells, palette);
    let used_indices: Vec<usize> = usage
        .iter()
        .filter(|entry| entry.count > 0)
        .map(|entry| entry.palette_index)
        .collect();
    let total_beads = cells.iter().filter(|cell| cell.is_some()).count() as u32;
    let isolated_beads = count_isolated(&cells, settings.width, settings.height);
    let mean_delta_e = mean_delta_e(&cells, &samples, &palette_labs);

    for entry in &usage {
        if entry.shortage > 0 {
            let color = &palette[entry.palette_index];
            warnings.push(format!(
                "{} {} 库存不足 {} 颗",
                color.code, color.name, entry.shortage
            ));
        }
    }

    let board_size = settings.board_size.max(1);
    Ok(PatternResult {
        width: settings.width,
        height: settings.height,
        cells,
        selected_palette_indices: used_indices.clone(),
        usage,
        metrics: PatternMetrics {
            total_beads,
            color_count: used_indices.len(),
            board_size,
            boards_across: settings.width.div_ceil(board_size),
            boards_down: settings.height.div_ceil(board_size),
            physical_width_mm: settings.width as f32 * settings.bead_pitch_mm,
            physical_height_mm: settings.height as f32 * settings.bead_pitch_mm,
            mean_delta_e,
            isolated_beads,
        },
        warnings,
    })
}

fn sample_image(image: &DynamicImage, settings: &GenerationSettings) -> Vec<Option<Sample>> {
    let rgba = image.to_rgba8();
    let (source_width, source_height) = image.dimensions();
    let mut result = Vec::with_capacity((settings.width * settings.height) as usize);

    for y in 0..settings.height {
        for x in 0..settings.width {
            let mapping = map_cell_to_source(
                x,
                y,
                settings.width,
                settings.height,
                source_width,
                source_height,
                settings.fit_mode,
            );
            let Some((sx0, sy0, sx1, sy1, destination_coverage)) = mapping else {
                result.push(None);
                continue;
            };

            let ix0 = sx0.floor().max(0.0) as u32;
            let iy0 = sy0.floor().max(0.0) as u32;
            let ix1 = sx1.ceil().min(source_width as f32) as u32;
            let iy1 = sy1.ceil().min(source_height as f32) as u32;
            let mut premultiplied = [0.0f32; 3];
            let mut alpha_weight = 0.0f32;
            let mut total_weight = 0.0f32;

            for source_y in iy0..iy1 {
                let wy = (sy1.min(source_y as f32 + 1.0) - sy0.max(source_y as f32)).max(0.0);
                for source_x in ix0..ix1 {
                    let wx = (sx1.min(source_x as f32 + 1.0) - sx0.max(source_x as f32)).max(0.0);
                    let weight = wx * wy;
                    if weight <= 0.0 {
                        continue;
                    }
                    let pixel = rgba.get_pixel(source_x, source_y).0;
                    let alpha = pixel[3] as f32 / 255.0;
                    for channel in 0..3 {
                        let srgb = pixel[channel] as f32 / 255.0;
                        premultiplied[channel] += srgb_channel_to_linear(srgb) * alpha * weight;
                    }
                    alpha_weight += alpha * weight;
                    total_weight += weight;
                }
            }

            let coverage = if total_weight > 0.0 {
                (alpha_weight / total_weight) * destination_coverage
            } else {
                0.0
            };
            if coverage < settings.alpha_threshold || alpha_weight <= f32::EPSILON {
                result.push(None);
                continue;
            }

            let linear = premultiplied.map(|value| (value / alpha_weight).clamp(0.0, 1.0));
            result.push(Some(Sample {
                linear,
                lab: linear_rgb_to_lab(linear),
            }));
        }
    }
    result
}

#[allow(clippy::too_many_arguments)]
fn map_cell_to_source(
    x: u32,
    y: u32,
    target_width: u32,
    target_height: u32,
    source_width: u32,
    source_height: u32,
    fit_mode: FitMode,
) -> Option<(f32, f32, f32, f32, f32)> {
    let tw = target_width as f32;
    let th = target_height as f32;
    let sw = source_width as f32;
    let sh = source_height as f32;
    let source_aspect = sw / sh;
    let target_aspect = tw / th;

    match fit_mode {
        FitMode::Stretch => Some((
            x as f32 / tw * sw,
            y as f32 / th * sh,
            (x + 1) as f32 / tw * sw,
            (y + 1) as f32 / th * sh,
            1.0,
        )),
        FitMode::Cover => {
            let (crop_x, crop_y, crop_width, crop_height) = if source_aspect > target_aspect {
                let crop_width = sh * target_aspect;
                ((sw - crop_width) / 2.0, 0.0, crop_width, sh)
            } else {
                let crop_height = sw / target_aspect;
                (0.0, (sh - crop_height) / 2.0, sw, crop_height)
            };
            Some((
                crop_x + x as f32 / tw * crop_width,
                crop_y + y as f32 / th * crop_height,
                crop_x + (x + 1) as f32 / tw * crop_width,
                crop_y + (y + 1) as f32 / th * crop_height,
                1.0,
            ))
        }
        FitMode::Contain => {
            let (content_x, content_y, content_width, content_height) =
                if source_aspect > target_aspect {
                    let content_height = tw / source_aspect;
                    (0.0, (th - content_height) / 2.0, tw, content_height)
                } else {
                    let content_width = th * source_aspect;
                    ((tw - content_width) / 2.0, 0.0, content_width, th)
                };
            let dx0 = (x as f32).max(content_x);
            let dy0 = (y as f32).max(content_y);
            let dx1 = ((x + 1) as f32).min(content_x + content_width);
            let dy1 = ((y + 1) as f32).min(content_y + content_height);
            if dx1 <= dx0 || dy1 <= dy0 {
                return None;
            }
            Some((
                (dx0 - content_x) / content_width * sw,
                (dy0 - content_y) / content_height * sh,
                (dx1 - content_x) / content_width * sw,
                (dy1 - content_y) / content_height * sh,
                (dx1 - dx0) * (dy1 - dy0),
            ))
        }
    }
}

fn select_palette(
    samples: &[Option<Sample>],
    palette_labs: &[Lab],
    candidates: &[usize],
    max_colors: usize,
) -> Vec<usize> {
    let opaque: Vec<Lab> = samples
        .iter()
        .filter_map(|sample| sample.map(|value| value.lab))
        .collect();
    if opaque.is_empty() {
        return vec![candidates[0]];
    }
    let limit = max_colors.min(candidates.len());
    let mut selected = Vec::with_capacity(limit);
    let mut best_distances = vec![f32::INFINITY; opaque.len()];

    while selected.len() < limit {
        let mut best_candidate = None;
        let mut best_cost = f32::INFINITY;
        for &candidate in candidates {
            if selected.contains(&candidate) {
                continue;
            }
            let cost: f32 = opaque
                .iter()
                .zip(best_distances.iter())
                .map(|(sample, current)| {
                    current.min(delta_e_2000(*sample, palette_labs[candidate]))
                })
                .sum();
            if cost < best_cost {
                best_cost = cost;
                best_candidate = Some(candidate);
            }
        }
        let Some(candidate) = best_candidate else {
            break;
        };
        let previous_cost: f32 = best_distances.iter().sum();
        for (index, sample) in opaque.iter().enumerate() {
            best_distances[index] =
                best_distances[index].min(delta_e_2000(*sample, palette_labs[candidate]));
        }
        selected.push(candidate);
        let current_cost: f32 = best_distances.iter().sum();
        if selected.len() > 1 && previous_cost.is_finite() && previous_cost - current_cost < 0.01 {
            break;
        }
    }
    selected
}

fn assign_nearest(
    samples: &[Option<Sample>],
    selected: &[usize],
    palette_labs: &[Lab],
) -> Vec<Option<usize>> {
    samples
        .iter()
        .map(|sample| sample.map(|sample| nearest_color(sample.lab, selected, palette_labs).0))
        .collect()
}

fn assign_with_dithering(
    samples: &[Option<Sample>],
    width: u32,
    height: u32,
    selected: &[usize],
    palette_labs: &[Lab],
    palette_linear: &[[f32; 3]],
) -> Vec<Option<usize>> {
    let mut cells = vec![None; samples.len()];
    let mut errors = vec![[0.0f32; 3]; samples.len()];
    let add_error = |errors: &mut Vec<[f32; 3]>, index: usize, error: [f32; 3], weight: f32| {
        for channel in 0..3 {
            errors[index][channel] += error[channel] * weight;
        }
    };

    for y in 0..height {
        for x in 0..width {
            let index = (y * width + x) as usize;
            let Some(sample) = samples[index] else {
                continue;
            };
            let adjusted = [
                (sample.linear[0] + errors[index][0]).clamp(0.0, 1.0),
                (sample.linear[1] + errors[index][1]).clamp(0.0, 1.0),
                (sample.linear[2] + errors[index][2]).clamp(0.0, 1.0),
            ];
            let palette_index =
                nearest_color(linear_rgb_to_lab(adjusted), selected, palette_labs).0;
            cells[index] = Some(palette_index);
            let error = [
                adjusted[0] - palette_linear[palette_index][0],
                adjusted[1] - palette_linear[palette_index][1],
                adjusted[2] - palette_linear[palette_index][2],
            ];
            if x + 1 < width {
                add_error(&mut errors, index + 1, error, 7.0 / 16.0);
            }
            if y + 1 < height {
                if x > 0 {
                    add_error(&mut errors, index + width as usize - 1, error, 3.0 / 16.0);
                }
                add_error(&mut errors, index + width as usize, error, 5.0 / 16.0);
                if x + 1 < width {
                    add_error(&mut errors, index + width as usize + 1, error, 1.0 / 16.0);
                }
            }
        }
    }
    cells
}

fn nearest_color(target: Lab, selected: &[usize], palette_labs: &[Lab]) -> (usize, f32) {
    selected
        .iter()
        .map(|&index| (index, delta_e_2000(target, palette_labs[index])))
        .min_by(|left, right| left.1.partial_cmp(&right.1).unwrap_or(Ordering::Equal))
        .expect("selected palette is never empty")
}

fn cleanup_isolated(
    cells: &mut [Option<usize>],
    samples: &[Option<Sample>],
    width: u32,
    height: u32,
    palette_labs: &[Lab],
    cleanup: u8,
) {
    let threshold = if cleanup >= 2 { 9.0 } else { 4.0 };
    for _ in 0..cleanup.min(2) {
        let before = cells.to_owned();
        for y in 0..height {
            for x in 0..width {
                let index = (y * width + x) as usize;
                let (Some(current), Some(sample)) = (before[index], samples[index]) else {
                    continue;
                };
                let neighbors = neighbor_indices(x, y, width, height);
                if neighbors
                    .iter()
                    .any(|&neighbor| before[neighbor] == Some(current))
                {
                    continue;
                }
                let mut frequency = HashMap::<usize, u8>::new();
                for neighbor in neighbors {
                    if let Some(color) = before[neighbor] {
                        *frequency.entry(color).or_default() += 1;
                    }
                }
                let Some((&replacement, _)) = frequency.iter().max_by_key(|(_, count)| *count)
                else {
                    continue;
                };
                let current_error = delta_e_2000(sample.lab, palette_labs[current]);
                let replacement_error = delta_e_2000(sample.lab, palette_labs[replacement]);
                if replacement_error - current_error <= threshold {
                    cells[index] = Some(replacement);
                }
            }
        }
    }
}

fn rebalance_inventory(
    cells: &mut [Option<usize>],
    samples: &[Option<Sample>],
    selected: &[usize],
    palette: &[BeadColor],
    palette_labs: &[Lab],
    warnings: &mut Vec<String>,
) {
    let mut counts = vec![0u32; palette.len()];
    for color in cells.iter().flatten() {
        counts[*color] += 1;
    }
    let total_capacity: u64 = selected
        .iter()
        .map(|&index| palette[index].inventory as u64)
        .sum();
    let total_beads = cells.iter().filter(|cell| cell.is_some()).count() as u64;
    if total_capacity < total_beads {
        warnings.push(format!(
            "当前启用颜色总库存还缺 {} 颗",
            total_beads - total_capacity
        ));
    }

    for &overloaded in selected {
        let capacity = palette[overloaded].inventory;
        if counts[overloaded] <= capacity {
            continue;
        }
        let excess = counts[overloaded] - capacity;
        let mut positions: Vec<ReplacementCandidate> = cells
            .iter()
            .enumerate()
            .filter(|(_, cell)| **cell == Some(overloaded))
            .filter_map(|(position, _)| {
                let sample = samples[position]?;
                let current = delta_e_2000(sample.lab, palette_labs[overloaded]);
                let mut alternatives: Vec<PaletteAlternative> = selected
                    .iter()
                    .copied()
                    .filter(|&alternative| alternative != overloaded)
                    .map(|alternative| {
                        (
                            delta_e_2000(sample.lab, palette_labs[alternative]) - current,
                            alternative,
                        )
                    })
                    .collect();
                alternatives
                    .sort_by(|left, right| left.0.partial_cmp(&right.0).unwrap_or(Ordering::Equal));
                let best_delta = alternatives.first()?.0;
                Some((best_delta, position, alternatives))
            })
            .collect();
        positions.sort_by(|left, right| left.0.partial_cmp(&right.0).unwrap_or(Ordering::Equal));

        let mut moved = 0u32;
        for (_, position, alternatives) in positions {
            if moved >= excess {
                break;
            }
            let available = alternatives
                .into_iter()
                .find(|(_, alternative)| counts[*alternative] < palette[*alternative].inventory);
            if let Some((_, replacement)) = available {
                cells[position] = Some(replacement);
                counts[overloaded] -= 1;
                counts[replacement] += 1;
                moved += 1;
            }
        }
    }
}

fn build_usage(cells: &[Option<usize>], palette: &[BeadColor]) -> Vec<ColorUsage> {
    let mut counts = vec![0u32; palette.len()];
    for color in cells.iter().flatten() {
        counts[*color] += 1;
    }
    counts
        .into_iter()
        .enumerate()
        .filter(|(_, count)| *count > 0)
        .map(|(palette_index, count)| {
            let color = &palette[palette_index];
            let shortage = count.saturating_sub(color.inventory);
            ColorUsage {
                palette_index,
                count,
                inventory: color.inventory,
                shortage,
                bags_needed: if shortage == 0 {
                    0
                } else {
                    shortage.div_ceil(color.bag_size.max(1))
                },
            }
        })
        .collect()
}

fn neighbor_indices(x: u32, y: u32, width: u32, height: u32) -> Vec<usize> {
    let mut result = Vec::with_capacity(4);
    if x > 0 {
        result.push((y * width + x - 1) as usize);
    }
    if x + 1 < width {
        result.push((y * width + x + 1) as usize);
    }
    if y > 0 {
        result.push(((y - 1) * width + x) as usize);
    }
    if y + 1 < height {
        result.push(((y + 1) * width + x) as usize);
    }
    result
}

fn count_isolated(cells: &[Option<usize>], width: u32, height: u32) -> u32 {
    let mut count = 0;
    for y in 0..height {
        for x in 0..width {
            let index = (y * width + x) as usize;
            let Some(color) = cells[index] else {
                continue;
            };
            if !neighbor_indices(x, y, width, height)
                .iter()
                .any(|&neighbor| cells[neighbor] == Some(color))
            {
                count += 1;
            }
        }
    }
    count
}

fn mean_delta_e(cells: &[Option<usize>], samples: &[Option<Sample>], palette_labs: &[Lab]) -> f32 {
    let mut total = 0.0;
    let mut count = 0u32;
    for (cell, sample) in cells.iter().zip(samples.iter()) {
        if let (Some(color), Some(sample)) = (cell, sample) {
            total += delta_e_2000(sample.lab, palette_labs[*color]);
            count += 1;
        }
    }
    if count == 0 {
        0.0
    } else {
        total / count as f32
    }
}

fn srgb_channel_to_linear(value: f32) -> f32 {
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}

fn srgb_to_lab(rgb: [u8; 3]) -> Lab {
    linear_rgb_to_lab(rgb.map(|channel| srgb_channel_to_linear(channel as f32 / 255.0)))
}

fn linear_rgb_to_lab(rgb: [f32; 3]) -> Lab {
    let x = rgb[0] * 0.412_456_4 + rgb[1] * 0.357_576_1 + rgb[2] * 0.180_437_5;
    let y = rgb[0] * 0.212_672_9 + rgb[1] * 0.715_152_2 + rgb[2] * 0.072_175;
    let z = rgb[0] * 0.019_333_9 + rgb[1] * 0.119_192 + rgb[2] * 0.950_304_1;
    let f = |value: f32| {
        if value > 216.0 / 24_389.0 {
            value.cbrt()
        } else {
            (24_389.0 / 27.0 * value + 16.0) / 116.0
        }
    };
    let fx = f(x / 0.95047);
    let fy = f(y);
    let fz = f(z / 1.08883);
    Lab {
        l: 116.0 * fy - 16.0,
        a: 500.0 * (fx - fy),
        b: 200.0 * (fy - fz),
    }
}

fn delta_e_2000(first: Lab, second: Lab) -> f32 {
    let c1 = first.a.hypot(first.b);
    let c2 = second.a.hypot(second.b);
    let c_bar = (c1 + c2) / 2.0;
    let c_bar_7 = c_bar.powi(7);
    let g = 0.5 * (1.0 - (c_bar_7 / (c_bar_7 + 25.0f32.powi(7))).sqrt());
    let a1_prime = (1.0 + g) * first.a;
    let a2_prime = (1.0 + g) * second.a;
    let c1_prime = a1_prime.hypot(first.b);
    let c2_prime = a2_prime.hypot(second.b);
    let h = |a: f32, b: f32| {
        if a.abs() < f32::EPSILON && b.abs() < f32::EPSILON {
            0.0
        } else {
            b.atan2(a).to_degrees().rem_euclid(360.0)
        }
    };
    let h1_prime = h(a1_prime, first.b);
    let h2_prime = h(a2_prime, second.b);
    let delta_l = second.l - first.l;
    let delta_c = c2_prime - c1_prime;
    let delta_h_angle = if c1_prime * c2_prime == 0.0 {
        0.0
    } else if (h2_prime - h1_prime).abs() <= 180.0 {
        h2_prime - h1_prime
    } else if h2_prime <= h1_prime {
        h2_prime - h1_prime + 360.0
    } else {
        h2_prime - h1_prime - 360.0
    };
    let delta_h = 2.0 * (c1_prime * c2_prime).sqrt() * (delta_h_angle.to_radians() / 2.0).sin();
    let l_bar = (first.l + second.l) / 2.0;
    let c_prime_bar = (c1_prime + c2_prime) / 2.0;
    let h_prime_bar = if c1_prime * c2_prime == 0.0 {
        h1_prime + h2_prime
    } else if (h1_prime - h2_prime).abs() <= 180.0 {
        (h1_prime + h2_prime) / 2.0
    } else if h1_prime + h2_prime < 360.0 {
        (h1_prime + h2_prime + 360.0) / 2.0
    } else {
        (h1_prime + h2_prime - 360.0) / 2.0
    };
    let t = 1.0 - 0.17 * (h_prime_bar - 30.0).to_radians().cos()
        + 0.24 * (2.0 * h_prime_bar).to_radians().cos()
        + 0.32 * (3.0 * h_prime_bar + 6.0).to_radians().cos()
        - 0.20 * (4.0 * h_prime_bar - 63.0).to_radians().cos();
    let delta_theta = 30.0 * (-((h_prime_bar - 275.0) / 25.0).powi(2)).exp();
    let c_prime_bar_7 = c_prime_bar.powi(7);
    let r_c = 2.0 * (c_prime_bar_7 / (c_prime_bar_7 + 25.0f32.powi(7))).sqrt();
    let l_term = l_bar - 50.0;
    let s_l = 1.0 + (0.015 * l_term * l_term) / (20.0 + l_term * l_term).sqrt();
    let s_c = 1.0 + 0.045 * c_prime_bar;
    let s_h = 1.0 + 0.015 * c_prime_bar * t;
    let r_t = -r_c * (2.0 * delta_theta.to_radians()).sin();
    let l_normalized = delta_l / s_l;
    let c_normalized = delta_c / s_c;
    let h_normalized = delta_h / s_h;
    (l_normalized.powi(2)
        + c_normalized.powi(2)
        + h_normalized.powi(2)
        + r_t * c_normalized * h_normalized)
        .sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{FitMode, GenerationSettings};
    use image::{ImageBuffer, ImageFormat, Rgba};

    fn palette() -> Vec<BeadColor> {
        vec![
            BeadColor {
                id: "black".into(),
                brand: "Test".into(),
                series: "Solid".into(),
                code: "T01".into(),
                name: "Black".into(),
                hex: "#000000".into(),
                rgb: [0, 0, 0],
                inventory: 100,
                bag_size: 100,
                active: true,
            },
            BeadColor {
                id: "white".into(),
                brand: "Test".into(),
                series: "Solid".into(),
                code: "T02".into(),
                name: "White".into(),
                hex: "#ffffff".into(),
                rgb: [255, 255, 255],
                inventory: 100,
                bag_size: 100,
                active: true,
            },
        ]
    }

    fn settings() -> GenerationSettings {
        GenerationSettings {
            width: 2,
            height: 2,
            max_colors: 2,
            alpha_threshold: 0.15,
            cleanup: 0,
            dithering: false,
            respect_inventory: false,
            fit_mode: FitMode::Stretch,
            board_size: 29,
            bead_pitch_mm: 5.0,
        }
    }

    #[test]
    fn ciede2000_matches_reference_pair() {
        let first = Lab {
            l: 50.0,
            a: 2.6772,
            b: -79.7751,
        };
        let second = Lab {
            l: 50.0,
            a: 0.0,
            b: -82.7485,
        };
        assert!((delta_e_2000(first, second) - 2.0425).abs() < 0.0002);
    }

    #[test]
    fn transparent_pixels_become_empty_cells() {
        let mut image = ImageBuffer::from_pixel(2, 2, Rgba([255, 255, 255, 255]));
        image.put_pixel(0, 0, Rgba([0, 0, 0, 0]));
        let result =
            generate_from_image(&DynamicImage::ImageRgba8(image), &settings(), &palette()).unwrap();
        assert_eq!(result.cells[0], None);
        assert_eq!(result.metrics.total_beads, 3);
    }

    #[test]
    fn data_url_round_trip_generates_pattern() {
        let image = DynamicImage::ImageRgba8(ImageBuffer::from_fn(2, 2, |x, _| {
            if x == 0 {
                Rgba([0, 0, 0, 255])
            } else {
                Rgba([255, 255, 255, 255])
            }
        }));
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, ImageFormat::Png).unwrap();
        let request = GenerateRequest {
            image_base64: format!(
                "data:image/png;base64,{}",
                STANDARD.encode(bytes.into_inner())
            ),
            settings: settings(),
            palette: palette(),
        };
        let result = generate(request).unwrap();
        assert_eq!(result.metrics.total_beads, 4);
        assert_eq!(result.metrics.color_count, 2);
    }
}
