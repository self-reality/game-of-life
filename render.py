#!/usr/bin/env python3
import argparse
import json
import math
import os
import random
import subprocess
import sys
from pathlib import Path

import numpy as np


DEFAULT_SETTINGS = {
    "cols": 248,
    "rows": 136,
    "cellSize": 5,
    "speed": 18,
    "margin": 20,
    "gridThickness": 1,
    "bgColor": "#000000",
    "gridColor": "#2b2b2b",
    "alive1Color": "#ff3b3b",
    "alive2Color": "#16c172",
    "alive10Color": "#2f7cff",
    "injections": 2,
    "injectionPeriod": 80,
    "corridorMaxSteps": 120,
    "corridorMinLength": 40,
    "corridorAttempts": 24,
    "corridorEdgeAttempts": 8,
    "initialAliveProbability": 0.25,
}

DEFAULT_GLOW = {
    "blur": 4,
    "alpha": 1.0,
    "blendMode": "lighten",
    "fillAlpha": 0.9,
}

DEFAULT_VIDEO = {
    "durationHours": 0.01,
    "fps": 30,
    "width": None,
    "height": None,
    "outputPath": "output/game-of-life.mp4",
    "seed": 1337,
}


PATTERNS = {
    "glider": [(1, 0), (2, 1), (0, 2), (1, 2), (2, 2)],
    "lwss": [
        (1, 0),
        (4, 0),
        (0, 1),
        (0, 2),
        (4, 2),
        (0, 3),
        (1, 3),
        (2, 3),
        (3, 3),
    ],
    "mwss": [
        (2, 0),
        (3, 0),
        (4, 0),
        (0, 1),
        (4, 1),
        (0, 2),
        (4, 2),
        (0, 3),
        (3, 3),
        (1, 4),
        (2, 4),
        (3, 4),
    ],
    "hwss": [
        (2, 0),
        (3, 0),
        (4, 0),
        (5, 0),
        (0, 1),
        (5, 1),
        (0, 2),
        (5, 2),
        (0, 3),
        (4, 3),
        (1, 4),
        (2, 4),
        (3, 4),
        (4, 4),
    ],
}


def hex_to_rgb(value):
    value = value.strip().lstrip("#")
    if len(value) != 6:
        raise ValueError(f"Invalid hex color: {value}")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def load_config(path):
    if not path:
        return {}
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def merge_config(defaults, config, keys):
    merged = defaults.copy()
    for key in keys:
        if key in config:
            merged[key] = config[key]
    return merged


def normalize_settings(config):
    settings = merge_config(DEFAULT_SETTINGS, config, DEFAULT_SETTINGS.keys())
    settings.update(config.get("settings", {}))

    glow = merge_config(DEFAULT_GLOW, config, DEFAULT_GLOW.keys())
    glow.update(config.get("glow", {}))

    video = merge_config(DEFAULT_VIDEO, config, DEFAULT_VIDEO.keys())
    video.update(config.get("video", {}))
    return settings, glow, video


def compute_canvas_size(settings):
    field_width = settings["cols"] * settings["cellSize"]
    field_height = settings["rows"] * settings["cellSize"]
    width = field_width + settings["margin"] * 2
    height = field_height + settings["margin"] * 2
    return width, height, field_width, field_height


def rotate_pattern(pattern, times):
    rotated = [(x, y) for x, y in pattern]
    for _ in range(times):
        bounds = get_bounds(rotated)
        rotated = [(y - bounds["minY"], bounds["maxX"] - x) for x, y in rotated]
    return normalize_pattern(rotated)


def normalize_pattern(pattern):
    bounds = get_bounds(pattern)
    return [(x - bounds["minX"], y - bounds["minY"]) for x, y in pattern]


def get_bounds(pattern):
    min_x = math.inf
    max_x = -math.inf
    min_y = math.inf
    max_y = -math.inf
    for x, y in pattern:
        min_x = min(min_x, x)
        max_x = max(max_x, x)
        min_y = min(min_y, y)
        max_y = max(max_y, y)
    return {"minX": min_x, "maxX": max_x, "minY": min_y, "maxY": max_y}


def get_bounds_from_coords(coords):
    if not coords:
        return {"minX": 0, "maxX": 0, "minY": 0, "maxY": 0}
    min_x = min(x for x, _ in coords)
    max_x = max(x for x, _ in coords)
    min_y = min(y for _, y in coords)
    max_y = max(y for _, y in coords)
    return {"minX": min_x, "maxX": max_x, "minY": min_y, "maxY": max_y}


def pad_corridor_cells(coords):
    padded = []
    seen = set()
    for x, y in coords:
        for dy in range(-1, 2):
            for dx in range(-1, 2):
                xx = x + dx
                yy = y + dy
                key = (xx, yy)
                if key in seen:
                    continue
                seen.add(key)
                padded.append((xx, yy))
    return padded


def simulate_pattern_steps(pattern, max_steps):
    bounds = get_bounds(pattern)
    width = bounds["maxX"] - bounds["minX"] + 1
    height = bounds["maxY"] - bounds["minY"] + 1
    pad = max_steps + 2
    cols = width + pad * 2
    rows = height + pad * 2

    grid = np.zeros(cols * rows, dtype=np.uint8)
    for x, y in pattern:
        xx = x - bounds["minX"] + pad
        yy = y - bounds["minY"] + pad
        grid[yy * cols + xx] = 1

    raw_steps = []
    padded_steps = []

    for _ in range(max_steps):
        live_cells = []
        for y in range(rows):
            row_offset = y * cols
            for x in range(cols):
                if grid[row_offset + x] != 1:
                    continue
                live_cells.append((x - pad, y - pad))
        raw_steps.append(live_cells)
        padded_steps.append(pad_corridor_cells(live_cells))

        next_grid = np.zeros(cols * rows, dtype=np.uint8)
        for y in range(rows):
            row_offset = y * cols
            for x in range(cols):
                neighbors = 0
                for dy in (-1, 0, 1):
                    yy = y + dy
                    if yy < 0 or yy >= rows:
                        continue
                    neighbor_row = yy * cols
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        xx = x + dx
                        if xx < 0 or xx >= cols:
                            continue
                        neighbors += grid[neighbor_row + xx]
                idx = row_offset + x
                alive = grid[idx] == 1
                next_alive = neighbors == 3 or (alive and neighbors == 2)
                if next_alive:
                    next_grid[idx] = 1
        grid = next_grid

    return {"rawSteps": raw_steps, "paddedSteps": padded_steps}


def get_centroid(coords):
    if not coords:
        return {"x": 0.0, "y": 0.0}
    x_sum = sum(x for x, _ in coords)
    y_sum = sum(y for _, y in coords)
    return {"x": x_sum / len(coords), "y": y_sum / len(coords)}


def get_entry_edges(dx, dy):
    edges = []
    if dx > 0:
        edges.append("left")
    if dx < 0:
        edges.append("right")
    if dy > 0:
        edges.append("top")
    if dy < 0:
        edges.append("bottom")
    if not edges:
        return ["left", "right", "top", "bottom"]
    return edges


def infer_direction_from_steps(raw_steps):
    first = next((step for step in raw_steps if step), None)
    last = next((step for step in reversed(raw_steps) if step), None)
    if not first or not last:
        return {"dx": 0, "dy": 0, "edges": ["left", "right", "top", "bottom"]}
    first_center = get_centroid(first)
    last_center = get_centroid(last)
    delta_x = last_center["x"] - first_center["x"]
    delta_y = last_center["y"] - first_center["y"]
    dx = 1 if delta_x > 0.1 else -1 if delta_x < -0.1 else 0
    dy = 1 if delta_y > 0.1 else -1 if delta_y < -0.1 else 0
    return {"dx": dx, "dy": dy, "edges": get_entry_edges(dx, dy)}


class CorridorCache:
    def __init__(self):
        self._cache = {}

    def get(self, key):
        return self._cache.get(key)

    def set(self, key, value):
        self._cache[key] = value


def get_corridor_cache_key(pattern_name, rotation, max_steps):
    return f"{pattern_name}:{rotation}:{max_steps}"


def get_corridor_for_pattern(pattern_name, rotation, settings, cache):
    max_steps = settings["corridorMaxSteps"]
    key = get_corridor_cache_key(pattern_name, rotation, max_steps)
    cached = cache.get(key)
    if cached:
        return cached

    base_pattern = PATTERNS[pattern_name]
    rotated = rotate_pattern(base_pattern, rotation)
    sim = simulate_pattern_steps(rotated, max_steps)
    corridor = {
        "pattern": rotated,
        "steps": sim["paddedSteps"],
        "step0Bounds": get_bounds_from_coords(sim["paddedSteps"][0] if sim["paddedSteps"] else []),
        "direction": infer_direction_from_steps(sim["rawSteps"]),
    }

    cache.set(key, corridor)
    return corridor


def get_entry_position_for_edge(edge, step0_bounds, settings, rng):
    if edge == "left":
        pos_x = -step0_bounds["minX"]
        min_y = -step0_bounds["minY"]
        max_y = settings["rows"] - 1 - step0_bounds["maxY"]
        if min_y > max_y:
            return None
        return {"posX": pos_x, "posY": rng.randint(min_y, max_y)}
    if edge == "right":
        pos_x = settings["cols"] - 1 - step0_bounds["maxX"]
        min_y = -step0_bounds["minY"]
        max_y = settings["rows"] - 1 - step0_bounds["maxY"]
        if min_y > max_y:
            return None
        return {"posX": pos_x, "posY": rng.randint(min_y, max_y)}
    if edge == "top":
        pos_y = -step0_bounds["minY"]
        min_x = -step0_bounds["minX"]
        max_x = settings["cols"] - 1 - step0_bounds["maxX"]
        if min_x > max_x:
            return None
        return {"posX": rng.randint(min_x, max_x), "posY": pos_y}
    if edge == "bottom":
        pos_y = settings["rows"] - 1 - step0_bounds["maxY"]
        min_x = -step0_bounds["minX"]
        max_x = settings["cols"] - 1 - step0_bounds["maxX"]
        if min_x > max_x:
            return None
        return {"posX": rng.randint(min_x, max_x), "posY": pos_y}
    return None


def is_corridor_step_clear(step_cells, pos_x, pos_y, settings, cells):
    cols = settings["cols"]
    rows = settings["rows"]
    for x, y in step_cells:
        xx = pos_x + x
        yy = pos_y + y
        if xx < 0 or xx >= cols or yy < 0 or yy >= rows:
            return False
        if cells[yy * cols + xx] == 1:
            return False
    return True


def get_corridor_length(steps, pos_x, pos_y, settings, cells):
    length = 0
    for step_cells in steps:
        if not is_corridor_step_clear(step_cells, pos_x, pos_y, settings, cells):
            break
        length += 1
    return length


def find_best_corridor_placement(corridor, settings, cells, rng):
    edge_counts = {}
    edges = corridor["direction"]["edges"] or ["left", "right", "top", "bottom"]
    best = None

    for _ in range(settings["corridorAttempts"]):
        available_edges = [
            edge
            for edge in edges
            if edge_counts.get(edge, 0) < settings["corridorEdgeAttempts"]
        ]
        if not available_edges:
            break
        edge = rng.choice(available_edges)
        edge_counts[edge] = edge_counts.get(edge, 0) + 1

        entry = get_entry_position_for_edge(edge, corridor["step0Bounds"], settings, rng)
        if not entry:
            continue
        length = get_corridor_length(
            corridor["steps"], entry["posX"], entry["posY"], settings, cells
        )
        if not best or length > best["length"]:
            best = {"posX": entry["posX"], "posY": entry["posY"], "length": length}

    if best and best["length"] >= settings["corridorMinLength"]:
        return best
    return None


def place_pattern(pattern, pos_x, pos_y, settings, cells, ages):
    cols = settings["cols"]
    rows = settings["rows"]
    for x, y in pattern:
        xx = pos_x + x
        yy = pos_y + y
        if xx < 0 or xx >= cols or yy < 0 or yy >= rows:
            continue
        idx = yy * cols + xx
        cells[idx] = 1
        ages[idx] = 1


def pick_ship_pattern_name(rng):
    if rng.random() < 0.2:
        return "glider"
    ships = ["lwss", "mwss", "hwss"]
    return rng.choice(ships)


def inject_if_needed(cycle_count, settings, cells, ages, rng, cache):
    if cycle_count % settings["injectionPeriod"] != 0:
        return
    injected = 0
    while injected < settings["injections"]:
        pattern_name = pick_ship_pattern_name(rng)
        rotation = rng.randint(0, 3)
        corridor = get_corridor_for_pattern(pattern_name, rotation, settings, cache)
        placement = find_best_corridor_placement(corridor, settings, cells, rng)
        if placement:
            place_pattern(corridor["pattern"], placement["posX"], placement["posY"], settings, cells, ages)
            injected += 1
        else:
            break


def step_simulation(settings, cells, ages):
    rows = settings["rows"]
    cols = settings["cols"]
    grid = cells.reshape(rows, cols)
    ages_grid = ages.reshape(rows, cols)

    padded = np.pad(grid, 1, mode="constant", constant_values=0)
    neighbors = (
        padded[:-2, :-2]
        + padded[:-2, 1:-1]
        + padded[:-2, 2:]
        + padded[1:-1, :-2]
        + padded[1:-1, 2:]
        + padded[2:, :-2]
        + padded[2:, 1:-1]
        + padded[2:, 2:]
    )

    alive = grid == 1
    next_alive = (alive & ((neighbors == 2) | (neighbors == 3))) | (~alive & (neighbors == 3))
    next_cells = next_alive.astype(np.uint8)
    next_ages = np.where(
        next_alive,
        np.where(alive, ages_grid + 1, 1),
        0,
    ).astype(np.uint16)

    cells[:] = next_cells.reshape(-1)
    ages[:] = next_ages.reshape(-1)
    return int(next_cells.sum())


def build_base_frame(settings):
    width, height, field_width, field_height = compute_canvas_size(settings)
    bg_color = np.array(hex_to_rgb(settings["bgColor"]), dtype=np.uint8)
    grid_color = np.array(hex_to_rgb(settings["gridColor"]), dtype=np.uint8)

    frame = np.zeros((height, width, 3), dtype=np.uint8)
    frame[:] = bg_color

    thickness = int(round(settings["gridThickness"]))
    if thickness > 0:
        offset_x = settings["margin"]
        offset_y = settings["margin"]
        for x in range(settings["cols"] + 1):
            px = offset_x + x * settings["cellSize"]
            x0 = max(px - thickness // 2, 0)
            x1 = min(px + thickness // 2 + 1, width)
            frame[offset_y : offset_y + field_height, x0:x1] = grid_color
        for y in range(settings["rows"] + 1):
            py = offset_y + y * settings["cellSize"]
            y0 = max(py - thickness // 2, 0)
            y1 = min(py + thickness // 2 + 1, height)
            frame[y0:y1, offset_x : offset_x + field_width] = grid_color

    return frame


def render_frame(settings, glow, cells, ages, base_frame):
    width, height, field_width, field_height = compute_canvas_size(settings)
    offset_x = settings["margin"]
    offset_y = settings["margin"]

    frame = base_frame.copy()

    rows = settings["rows"]
    cols = settings["cols"]
    grid = cells.reshape(rows, cols)
    ages_grid = ages.reshape(rows, cols)

    alive = grid == 1
    color_grid = np.zeros((rows, cols, 3), dtype=np.uint8)
    color_grid[alive & (ages_grid >= 10)] = hex_to_rgb(settings["alive10Color"])
    color_grid[alive & (ages_grid >= 2) & (ages_grid < 10)] = hex_to_rgb(settings["alive2Color"])
    color_grid[alive & (ages_grid < 2)] = hex_to_rgb(settings["alive1Color"])

    cell_layer = np.repeat(np.repeat(color_grid, settings["cellSize"], axis=0), settings["cellSize"], axis=1)
    field_region = frame[offset_y : offset_y + field_height, offset_x : offset_x + field_width]
    mask = cell_layer.any(axis=2)
    field_region[mask] = cell_layer[mask]
    frame[offset_y : offset_y + field_height, offset_x : offset_x + field_width] = field_region

    glow_color_grid = (color_grid.astype(np.float32) * glow["fillAlpha"]).astype(np.uint8)
    glow_field = np.repeat(np.repeat(glow_color_grid, settings["cellSize"], axis=0), settings["cellSize"], axis=1)
    glow_full = np.zeros((height, width, 3), dtype=np.uint8)
    glow_full[offset_y : offset_y + field_height, offset_x : offset_x + field_width] = glow_field
    glow_pixels = gaussian_blur(glow_full, glow["blur"])

    if glow["blendMode"] == "screen":
        blended = 255 - ((255 - frame) * (255 - glow_pixels) // 255)
    else:
        blended = np.maximum(frame, glow_pixels)

    alpha = float(glow["alpha"])
    if alpha >= 1.0:
        frame = blended.astype(np.uint8)
    elif alpha <= 0.0:
        frame = frame.astype(np.uint8)
    else:
        frame = (frame.astype(np.float32) * (1 - alpha) + blended.astype(np.float32) * alpha).astype(np.uint8)

    return frame


def open_ffmpeg_stream(width, height, fps, output_path):
    command = [
        "ffmpeg",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{width}x{height}",
        "-r",
        str(fps),
        "-i",
        "-",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        "-preset",
        "slow",
        "-crf",
        "18",
        "-g",
        str(int(fps * 2)),
        "-keyint_min",
        str(int(fps * 2)),
        "-sc_threshold",
        "0",
        output_path,
    ]
    return subprocess.Popen(command, stdin=subprocess.PIPE)


def ensure_output_dir(path):
    output_dir = Path(path).expanduser().resolve().parent
    output_dir.mkdir(parents=True, exist_ok=True)


def parse_args():
    parser = argparse.ArgumentParser(description="Render Game of Life video with JSON config.")
    parser.add_argument("--config", type=str, default=None, help="Path to JSON config file.")
    return parser.parse_args()


def gaussian_blur(image, radius):
    radius = int(round(radius))
    if radius <= 0:
        return image
    sigma = max(radius / 2.0, 0.1)
    size = radius * 2 + 1
    ax = np.arange(-radius, radius + 1, dtype=np.float32)
    kernel = np.exp(-0.5 * (ax / sigma) ** 2)
    kernel /= kernel.sum()

    temp = np.zeros_like(image, dtype=np.float32)
    for channel in range(3):
        temp[:, :, channel] = np.apply_along_axis(
            lambda row: np.convolve(row, kernel, mode="same"),
            1,
            image[:, :, channel].astype(np.float32),
        )

    blurred = np.zeros_like(temp, dtype=np.float32)
    for channel in range(3):
        blurred[:, :, channel] = np.apply_along_axis(
            lambda col: np.convolve(col, kernel, mode="same"),
            0,
            temp[:, :, channel],
        )

    return np.clip(blurred, 0, 255).astype(np.uint8)


def resize_nearest(image, target_width, target_height):
    src_height, src_width = image.shape[:2]
    if src_width == target_width and src_height == target_height:
        return image
    x_idx = (np.linspace(0, src_width - 1, target_width)).astype(np.int32)
    y_idx = (np.linspace(0, src_height - 1, target_height)).astype(np.int32)
    return image[y_idx][:, x_idx]


def main():
    args = parse_args()
    config = load_config(args.config)
    settings, glow, video = normalize_settings(config)

    canvas_width, canvas_height, _, _ = compute_canvas_size(settings)
    target_width = video["width"] or canvas_width
    target_height = video["height"] or canvas_height
    fps = int(video["fps"])
    duration_hours = float(video["durationHours"])
    total_frames = int(duration_hours * 3600 * fps)
    output_path = video["outputPath"]
    seed = video["seed"]

    rng = random.Random(seed)
    size = settings["cols"] * settings["rows"]
    cells = np.zeros(size, dtype=np.uint8)
    ages = np.zeros(size, dtype=np.uint16)
    for i in range(size):
        alive = rng.random() < settings["initialAliveProbability"]
        cells[i] = 1 if alive else 0
        ages[i] = 1 if alive else 0

    base_frame = build_base_frame(settings)
    cache = CorridorCache()
    cycle_count = 0
    accumulator = 0.0
    step_time = 1.0 / settings["speed"]
    delta = 1.0 / fps

    ensure_output_dir(output_path)
    process = open_ffmpeg_stream(target_width, target_height, fps, output_path)
    if not process.stdin:
        raise RuntimeError("Failed to open ffmpeg stdin.")

    try:
        for frame_idx in range(total_frames):
            accumulator += delta
            while accumulator >= step_time:
                step_simulation(settings, cells, ages)
                cycle_count += 1
                inject_if_needed(cycle_count, settings, cells, ages, rng, cache)
                accumulator -= step_time

            frame = render_frame(settings, glow, cells, ages, base_frame)
            if frame.shape[1] != target_width or frame.shape[0] != target_height:
                frame = resize_nearest(frame, target_width, target_height)
            process.stdin.write(frame.tobytes())

            if frame_idx % (fps * 10) == 0:
                sys.stdout.write(f"\rRendered {frame_idx}/{total_frames} frames")
                sys.stdout.flush()

    finally:
        process.stdin.close()
        process.wait()
        sys.stdout.write("\n")


if __name__ == "__main__":
    main()
