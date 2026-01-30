# Game of Life

node render_precomputed.js --config input/render_config.json --input '/Volumes/Smartbuy P5/Media Production/Production Videos/Long/simulation.bin'

## Motivation

The simulation can be precomputed so later renders can process cycles in chunks,
addressing a desired cycle range without re-running the simulation. The export
format is compact and optimized for random access.

## Injection (corridor) method

When `injectionPeriod` is reached, the simulator attempts to inject a small
ship pattern by finding a clear corridor from an edge:

- Pick a ship pattern and random rotation (glider, lightweight spaceship (lwss), middleweight spaceship (mwss), heavyweight spaceship (hwss)).
- Simulate the pattern for up to `corridorMaxSteps` to estimate its travel
  direction and step-by-step footprint.
- Determine which edges are sensible entry points based on the direction, then
  try random entry positions along those edges.
- For each attempt, measure how many steps stay clear of existing live cells.
  Keep the best placement and require at least `corridorMinLength` steps.
- If a valid corridor is found, place the pattern at the entry position and
  repeat until `injections` are placed or no corridor can be found.

## Precompute export

Generate a precomputed simulation export:

```
node precompute.js --config input/render_config.json --out output/simulation.bin
```

The precompute step verifies that duration and frame timing align with
`durationHours` and `fps`.

## Precomputed render (video)

Render a video from the precomputed export (no glow/blending):

```
node render_precomputed.js --config input/render_config.json --input output/simulation.bin
```

The renderer writes video chunks and resumes from `outputPath.progress.json`.
Stop with `Ctrl+C` and rerun to continue from the last completed chunk.

## Concatenate superchunks

After rendering, join the `*.superchunk_*.mp4` files into one movie. Edit
`INPUT_DIR` in `concat_superchunks.js` to the folder containing the superchunks,
then run:

```
node concat_superchunks.js
```

## Paperclip scan

Scan the precomputed export for the paperclip still life (all rotations + reflections):

```
node tools/find_paperclip.js --input "/Volumes/Smartbuy P5/Media Production/Production Videos/Long/simulation.bin" --test
```

Matches are written to `tools/paperclip_hits.csv`. The script writes resume state to
`tools/paperclip_hits.resume.json` so you can rerun without rescanning completed cycles.

### Export format

The export file is a binary stream:

- 4-byte little-endian header length
- UTF-8 JSON header
- Cycle data: `totalCycles` blocks of `gridWidth * gridHeight` bytes

Header fields:

- `fps`
- `simulationSpeed`
- `totalCycles`
- `gridWidth`
- `gridHeight`
- `seed`
- `version`

Each cycle byte encodes a cell state index:

- `0`: dead
- `1`: alive, age 1
- `2`: alive, age 2-9
- `3`: alive, age 10+

Random access to cycle `n`:

```
offset = 4 + headerLength + (n * gridWidth * gridHeight)
```
