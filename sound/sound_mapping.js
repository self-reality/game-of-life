(() => {
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  function randomBetween(min, max, rng) {
    const rand = typeof rng === "function" ? rng : Math.random;
    return min + (max - min) * rand();
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

  function mapYToMidi(y, rows, soundSettings) {
    const safeRows = Math.max(1, rows);
    const t = safeRows === 1 ? 0 : y / (safeRows - 1);
    const octaves = Math.max(1, Number(soundSettings.numOctaves) || 1);
    const centerOctave = Number(soundSettings.centerOctave) || 0;
    const centerMidi = (centerOctave + 1) * 12;
    const totalSemitones = octaves * 12;
    const minMidi = centerMidi - totalSemitones / 2;
    const midi = minMidi + t * totalSemitones;
    return midi;
  }

  function mapYToAttackMs(y, rows, soundSettings) {
    const safeRows = Math.max(1, rows);
    const t = safeRows === 1 ? 0 : y / (safeRows - 1);
    const minAttackMs = 1;
    const maxAttackMs = 2.67;
    return minAttackMs + t * (maxAttackMs - minAttackMs);
  }

  function mapToStartMs(soundSettings, rng) {
    const span = Math.max(0, Number(soundSettings.noteStartRandomMs) || 0);
    return span === 0 ? 0 : randomBetween(0, span, rng);
  }

  function limitRegionVoices(activeRows, soundSettings, rng) {
    const regionWidth = Math.max(1, Number(soundSettings.regionWidth) || 1);
    const maxVoices = Math.max(1, Number(soundSettings.maxVoicesPerRegion) || 1);
    const regionMap = new Map();

    activeRows.forEach((y) => {
      const regionIndex = Math.floor(y / regionWidth);
      if (!regionMap.has(regionIndex)) regionMap.set(regionIndex, []);
      regionMap.get(regionIndex).push(y);
    });

    const selected = [];
    regionMap.forEach((ys) => {
      ys.sort((a, b) => a - b);
      if (ys.length <= maxVoices) {
        selected.push(...ys);
        return;
      }
      const shuffled = ys.slice();
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(randomBetween(0, i + 1, rng));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const picked = shuffled.slice(0, maxVoices).sort((a, b) => a - b);
      selected.push(...picked);
    });

    return selected.sort((a, b) => a - b);
  }

  function getNoteEventsForCycle({
    cells,
    ages,
    snapshot,
    cols,
    rows,
    soundSettings,
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

    const limitedRows = limitRegionVoices(activeRows, soundSettings, rng);
    return limitedRows.map((y) => {
      const midi = mapYToMidi(y, rows, soundSettings);
      return {
        y,
        midi,
        note: midiToNoteName(midi),
        attackMs: mapYToAttackMs(y, rows, soundSettings),
        startMs: mapToStartMs(soundSettings, rng),
      };
    });
  }

  const api = {
    getNoteEventsForCycle,
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
