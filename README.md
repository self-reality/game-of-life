# Game of Life

node render_precomputed.js --config input/render_config.json --input '/Volumes/Smartbuy P5/Media Production/Production Videos/Long/simulation.bin'

## Motivation

The simulation can be precomputed so later renders can process cycles in chunks,
addressing a desired cycle range without re-running the simulation. The export
format is compact and optimized for random access.

## Field topology

The left and right edges are stitched together, so the field is a cylinder: a
ship leaving one side re-enters the other at the same height. Top and bottom
stay walls. Set `settings.wrapHorizontal` to `false` for the old
walls-on-all-sides behaviour (below 3 columns the wrap is ignored, since a cell
would otherwise count the same neighbour twice).

Wrapping removes two of the four edges that used to destroy ships, so spaceships
survive much longer and keep circling until something collides with them. An
lwss laps a 248-column field every 496 cycles. Ships spawn at the bottom and
travel upward, so the top wall is what eventually retires them.

## Ship spawning

Every `injectionPeriod` cycles the simulator stamps `injections` ships onto the
bottom edge of the field:

- Pick a ship at random: 20% of the time a glider (up-left or up-right), otherwise
  a lightweight, middleweight, or heavyweight spaceship (lwss/mwss/hwss).
- All ships are stored pre-oriented to travel upward, so there is no rotation or
  direction inference.
- Pick a random column, flush the ship against the bottom row, clear its footprint
  plus a one-cell border so it is born intact, and stamp it in.

There is no search for a clear corridor: the column is random and the spawn always
succeeds. When `wrapHorizontal` is on the column may straddle the seam.

### Clicking the field

Clicking a cell in the browser stamps one ship there by hand: the same random
type as an automatic spawn, plus a random quarter turn, so it can head up, down,
left, or right (gliders diagonally). The ship is centred on the clicked cell and
pushed back inside the field if it would hang over a wall; on a wrapped field it
may straddle the seam. Clicks in the margin or the pitch ruler are ignored.

### Pitch ruler and region bands

The gutter left of the field carries two scales for the sound mapping. Ticks and
note names mark the octaves the field spans; notes outside C0-C9 are red, since
they are rumble or a squeak. The strip hugging the field alternates shade once
per voice region, so each block is one band of rows. The Status panel's
"Sounds at once" counts how many rows actually sounded on the latest cycle.

## Voice regions

Row height maps to pitch, and the field is split into `sound.regionCount`
horizontal bands (up to 8). Region 1 is the top of the field, which is the
bottom of the pitch range, so the regions run bass to treble. Each one is its
own instrument, with its own entry in `sound.regions`:

| Field | Meaning |
| --- | --- |
| `waveform` | `sine`, `triangle`, `square` or `sawtooth` |
| `attackMs`, `decayMs`, `sustain`, `releaseMs` | the band's ADSR envelope; sustain is a level from 0 to 1, the rest are times |
| `delayMs` | fixed offset from the start of the cycle before the band fires |
| `volumeDb` | band level |
| `maxVoices` | how many of the band's rows may sound on one cycle |

A cycle gates every note for exactly one cycle, so a band's own `releaseMs` is
what rings on past it. Under the hood each region drives a separate
`Tone.PolySynth`, and the sum runs through a limiter that only catches peaks:
keeping the mix in range is what the per-region levels are for.

### Why the defaults look the way they do

Every generation fires its notes at once, so a naive setting turns into mud
within a few cycles. "Reset to cycle" rebuilds all the regions from the current
speed, and the defaults it writes follow a few rules:

- **Envelopes scale with the cycle.** A tail longer than two or three cycles
  means a band is still ringing several generations later; the defaults keep a
  note's whole life at roughly 2.5 cycles.
- **Notes stay long enough to read as pitch.** Tones segregate into separate
  streams much better above ~100 ms than at 40 ms, so the tail is trimmed toward
  that floor, not below it.
- **The register sets the shape.** Bass bands get a slower attack (a fast one on
  a low note reads as a thump), a longer tail and few voices, since low clusters
  mask each other worst. Treble bands get short, quiet ticks and can afford to
  be dense.
- **Bands are staggered.** Simultaneous onsets fuse into a single blurred event,
  so each band's `delayMs` spreads it across the first ~60% of the cycle, and
  `sound.noteStartRandomMs` jitters individual notes on top of that.
- **Timbre splits the registers.** Triangle keeps the low end audible on small
  speakers without the harmonics that muddy a cluster; sine keeps the top from
  turning harsh.

Changing the speed does not rewrite envelopes you have already tuned - press
"Reset to cycle" to rescale them. Changing the region count keeps the settings
of the regions that still exist and gives new ones defaults.

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

The scan follows the export's `wrapHorizontal` header field, so on a wrapped
export it also finds matches straddling the seam. Exports written before the
field existed are scanned as walls.

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
- `wrapHorizontal`
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
