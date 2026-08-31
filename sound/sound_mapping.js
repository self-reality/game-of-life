(() => {
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  // C0 (16.35 Hz) to C9 (8372 Hz): outside this a note is rumble or a squeak.
  const AUDIBLE_MIN_MIDI = 12;
  const AUDIBLE_MAX_MIDI = 120;

  const WAVEFORMS = ["sine", "triangle", "square", "sawtooth"];
  const MAX_REGIONS = 8;
  // Envelope defaults are written as multiples of one simulation cycle, so a
  // fallback is only needed when nobody passes the current cycle length in.
  const DEFAULT_CYCLE_MS = 1000 / 18;

  function randomBetween(min, max, rng) {
    const rand = typeof rng === "function" ? rng : Math.random;
    return min + (max - min) * rand();
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function midiToNoteName(midi) {
    const rounded = Math.round(midi);
    const noteIndex = ((rounded % 12) + 12) % 12;
    const octave = Math.floor(rounded / 12) - 1;
    return `${NOTE_NAMES[noteIndex]}${octave}`;
  }

  function getActiveRows({ cells, ages, snapshot, cols, rows }) {
    const active = new Set();
    if (snapshot) {
      for (let y = 0; y < rows; y += 1) {
        const rowOffset = y * cols;
        for (let x = 0; x < cols; x += 1) {
          const state = snapshot[rowOffset + x];
          if (state === 2) active.add(y);
        }
      }
      return active;
    }

    for (let y = 0; y < rows; y += 1) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x += 1) {
        const idx = rowOffset + x;
        if (cells[idx] !== 1) continue;
        const age = ages[idx];
        if (age >= 2 && age <= 9) {
          active.add(y);
        }
      }
    }
    return active;
  }

  function getPitchRange(soundSettings) {
    const octaves = Math.max(1, Number(soundSettings.numOctaves) || 1);
    const centerOctave = Number(soundSettings.centerOctave) || 0;
    const centerMidi = (centerOctave + 1) * 12;
    const totalSemitones = octaves * 12;
    return {
      minMidi: centerMidi - totalSemitones / 2,
      maxMidi: centerMidi + totalSemitones / 2,
      totalSemitones,
    };
  }

  function isAudibleMidi(midi) {
    return midi >= AUDIBLE_MIN_MIDI && midi <= AUDIBLE_MAX_MIDI;
  }

  // Pitch markers along the Y axis: t is 0 at the top row, 1 at the bottom row.
  function getPitchMarkers(soundSettings, semitoneStep) {
    const { minMidi, maxMidi, totalSemitones } = getPitchRange(soundSettings);
    const step = Math.max(1, Math.round(Number(semitoneStep) || 12));
    const markers = [];
    for (let midi = Math.ceil(minMidi / step) * step; midi <= maxMidi; midi += step) {
      markers.push({
        midi,
        note: midiToNoteName(midi),
        t: totalSemitones === 0 ? 0 : (midi - minMidi) / totalSemitones,
        audible: isAudibleMidi(midi),
      });
    }
    return markers;
  }

  function mapYToMidi(y, rows, soundSettings) {
    const safeRows = Math.max(1, rows);
    const t = safeRows === 1 ? 0 : y / (safeRows - 1);
    const { minMidi, totalSemitones } = getPitchRange(soundSettings);
    return minMidi + t * totalSemitones;
  }

  function mapToStartMs(soundSettings, rng) {
    const span = Math.max(0, Number(soundSettings.noteStartRandomMs) || 0);
    return span === 0 ? 0 : randomBetween(0, span, rng);
  }

  // Regions are horizontal bands of rows, numbered from the top of the field
  // down. Row 0 is the bottom of the pitch range, so region 0 is the bass band.
  function getRegionCount(soundSettings) {
    const raw = Math.round(Number(soundSettings && soundSettings.regionCount) || 1);
    return clamp(raw, 1, MAX_REGIONS);
  }

  function getRegionBounds(rows, regionCount) {
    const totalRows = Math.max(1, Math.round(rows) || 1);
    const count = clamp(Math.round(regionCount) || 1, 1, Math.min(MAX_REGIONS, totalRows));
    const bounds = [];
    for (let index = 0; index < count; index += 1) {
      bounds.push({
        index,
        startRow: Math.floor((index * totalRows) / count),
        endRow: Math.floor(((index + 1) * totalRows) / count),
      });
    }
    return bounds;
  }

  function getRegionIndexForRow(y, rows, regionCount) {
    const totalRows = Math.max(1, Math.round(rows) || 1);
    const count = clamp(Math.round(regionCount) || 1, 1, Math.min(MAX_REGIONS, totalRows));
    return clamp(Math.floor((y * count) / totalRows), 0, count - 1);
  }

  function getRegionMidiRange(index, rows, soundSettings) {
    const bounds = getRegionBounds(rows, getRegionCount(soundSettings));
    const band = bounds[clamp(index, 0, bounds.length - 1)];
    if (!band) return null;
    return {
      minMidi: mapYToMidi(band.startRow, rows, soundSettings),
      maxMidi: mapYToMidi(Math.max(band.startRow, band.endRow - 1), rows, soundSettings),
    };
  }

  // Defaults are tuned so a note is long enough to read as a pitch (research puts
  // stream segregation well above a 40 ms tone) yet clears before its own band
  // fires again. Everything scales with the cycle, and the register decides the
  // rest: bass bands get a slower attack, a longer tail and few voices, treble
  // bands get short quiet ticks that can afford to be dense.
  function createRegionDefaults(index, regionCount, cyclePeriodMs) {
    const count = clamp(Math.round(regionCount) || 1, 1, MAX_REGIONS);
    const cycle = Math.max(1, Number(cyclePeriodMs) || DEFAULT_CYCLE_MS);
    const safeIndex = clamp(Math.round(index) || 0, 0, count - 1);
    // t: 0 at the bass band, 1 at the treble band.
    const t = count === 1 ? 0.5 : (safeIndex + 0.5) / count;
    // Bands are staggered across the cycle so their onsets do not fuse.
    const spread = count === 1 ? 0 : safeIndex / (count - 1);

    return {
      // Triangle keeps the low end audible on small speakers without the extra
      // harmonics that make a cluster muddy; sine keeps the top from getting harsh.
      waveform: t < 0.5 ? "triangle" : "sine",
      attackMs: Math.round(lerp(16, 4, t)),
      decayMs: Math.round(lerp(1.8, 0.6, t) * cycle),
      sustain: Math.round(lerp(0.15, 0, t) * 100) / 100,
      releaseMs: Math.round(lerp(1.5, 0.6, t) * cycle),
      delayMs: Math.round(spread * 0.6 * cycle),
      volumeDb: Math.round(lerp(-10, -19, t) * 2) / 2,
      maxVoices: Math.max(1, Math.round(lerp(2, 5, t))),
    };
  }

  function createRegions(regionCount, cyclePeriodMs) {
    const count = clamp(Math.round(regionCount) || 1, 1, MAX_REGIONS);
    const regions = [];
    for (let index = 0; index < count; index += 1) {
      regions.push(createRegionDefaults(index, count, cyclePeriodMs));
    }
    return regions;
  }

  function normalizeRegion(region, index, regionCount, cyclePeriodMs) {
    const defaults = createRegionDefaults(index, regionCount, cyclePeriodMs);
    if (!region) return defaults;
    return {
      waveform: WAVEFORMS.includes(region.waveform) ? region.waveform : defaults.waveform,
      attackMs: clamp(Number(region.attackMs) || 0, 0, 2000),
      decayMs: clamp(Number(region.decayMs) || 0, 0, 4000),
      sustain: clamp(Number(region.sustain) || 0, 0, 1),
      releaseMs: clamp(Number(region.releaseMs) || 0, 0, 4000),
      delayMs: clamp(Number(region.delayMs) || 0, 0, 2000),
      volumeDb: clamp(Number(region.volumeDb) || 0, -60, 6),
      maxVoices: clamp(Math.round(Number(region.maxVoices) || 1), 1, 24),
    };
  }

  function getRegionConfigs(soundSettings, cyclePeriodMs) {
    const count = getRegionCount(soundSettings);
    const stored = Array.isArray(soundSettings && soundSettings.regions)
      ? soundSettings.regions
      : [];
    const configs = [];
    for (let index = 0; index < count; index += 1) {
      configs.push(normalizeRegion(stored[index], index, count, cyclePeriodMs));
    }
    return configs;
  }

  function limitRegionVoices(activeRows, rows, regionConfigs, rng) {
    const count = Math.max(1, regionConfigs.length);
    const regionMap = new Map();

    activeRows.forEach((y) => {
      const regionIndex = getRegionIndexForRow(y, rows, count);
      if (!regionMap.has(regionIndex)) regionMap.set(regionIndex, []);
      regionMap.get(regionIndex).push(y);
    });

    const selected = [];
    regionMap.forEach((ys, regionIndex) => {
      const maxVoices = Math.max(1, regionConfigs[regionIndex].maxVoices);
      ys.sort((a, b) => a - b);
      if (ys.length <= maxVoices) {
        ys.forEach((y) => selected.push({ y, regionIndex }));
        return;
      }
      const shuffled = ys.slice();
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(randomBetween(0, i + 1, rng));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      shuffled
        .slice(0, maxVoices)
        .sort((a, b) => a - b)
        .forEach((y) => selected.push({ y, regionIndex }));
    });

    return selected.sort((a, b) => a.y - b.y);
  }

  function getNoteEventsForCycle({
    cells,
    ages,
    snapshot,
    cols,
    rows,
    soundSettings,
    cyclePeriodMs,
    rng,
  }) {
    if (!soundSettings || cols <= 0 || rows <= 0) return [];
    const activeRows = getActiveRows({
      cells,
      ages,
      snapshot,
      cols,
      rows,
    });
    if (activeRows.size === 0) return [];

    const regionConfigs = getRegionConfigs(soundSettings, cyclePeriodMs);
    const limited = limitRegionVoices(activeRows, rows, regionConfigs, rng);
    return limited.map(({ y, regionIndex }) => {
      const midi = mapYToMidi(y, rows, soundSettings);
      return {
        y,
        midi,
        regionIndex,
        note: midiToNoteName(midi),
        // A band's fixed offset plus a per-note jitter: simultaneous onsets fuse
        // into one blurred event, staggered ones stay separately audible.
        startMs: regionConfigs[regionIndex].delayMs + mapToStartMs(soundSettings, rng),
      };
    });
  }

  const api = {
    MAX_REGIONS,
    WAVEFORMS,
    createRegionDefaults,
    createRegions,
    getNoteEventsForCycle,
    getPitchMarkers,
    getPitchRange,
    getRegionBounds,
    getRegionConfigs,
    getRegionCount,
    getRegionIndexForRow,
    getRegionMidiRange,
    isAudibleMidi,
    midiToNoteName,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof globalThis !== "undefined") {
    globalThis.SoundMapping = api;
  } else if (typeof window !== "undefined") {
    window.SoundMapping = api;
  }
})();
