# Game of Life

## Motivation

The simulation can be precomputed so later renders can process cycles in chunks,
addressing a desired cycle range without re-running the simulation. The export
format is compact and optimized for random access.

## Precompute export

Generate a precomputed simulation export:

```
node precompute.js --config render_config.json --out output/simulation.bin
```

The precompute step verifies that duration and frame timing align with
`durationHours` and `fps`.

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
