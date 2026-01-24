(() => {
  function factory(Tone) {
    if (!Tone) return null;

    return class DriftEmulator {
      constructor() {
        this.synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: {
            type: "sine",
            phase: 0,
          },
          envelope: {
            attack: 0,
            attackCurve: "linear",
            decay: 0.0336,
            decayCurve: "exponential",
            sustain: 0,
            release: 0.507,
          },
          volume: -6,
        }).toDestination();
      }

      playNote(note = "C4", durationSeconds = 0.1, attackMs = 0, startDelayMs = 0) {
        const attackSeconds = Math.max(0, attackMs) / 1000;
        const startSeconds = Math.max(0, startDelayMs) / 1000;
        const time = Tone.now() + startSeconds;
        this.synth.set({ envelope: { attack: attackSeconds } });
        this.synth.triggerAttackRelease(note, durationSeconds, time);
      }

      setOscillatorType(type) {
        const types = ["sine", "square", "triangle", "sawtooth"];
        this.synth.set({ oscillator: { type: types[type - 1] || "triangle" } });
      }
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("tone"));
  } else if (typeof globalThis !== "undefined") {
    globalThis.DriftEmulator = factory(globalThis.Tone);
  } else if (typeof window !== "undefined") {
    window.DriftEmulator = factory(window.Tone);
  }
})();
