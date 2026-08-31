(() => {
  function factory(Tone) {
    if (!Tone) return null;

    // One PolySynth per voice region, so a band's waveform, envelope and level
    // belong to it alone: changing the bass band cannot retune the treble one.
    return class DriftEmulator {
      constructor(regionConfigs = []) {
        // Cycles fire every voice at once, so peaks stack. The limiter is a
        // safety net against clipping, not a mix tool; per-region levels are
        // what should keep the sum in range.
        this.limiter = new Tone.Limiter(-1).toDestination();
        this.synths = [];
        this.setRegions(regionConfigs);
      }

      static toSynthOptions(region) {
        return {
          oscillator: {
            type: region.waveform,
            phase: 0,
          },
          envelope: {
            attack: Math.max(0, region.attackMs) / 1000,
            attackCurve: "linear",
            decay: Math.max(0.001, region.decayMs / 1000),
            decayCurve: "exponential",
            sustain: Math.max(0, Math.min(1, region.sustain)),
            release: Math.max(0.001, region.releaseMs / 1000),
            releaseCurve: "exponential",
          },
        };
      }

      createSynth(region) {
        const synth = new Tone.PolySynth(
          Tone.Synth,
          DriftEmulator.toSynthOptions(region)
        );
        // A band's tail runs a few cycles long, so its voices overlap with the
        // next cycles' rather than replacing them.
        synth.maxPolyphony = 32;
        synth.volume.value = region.volumeDb;
        synth.connect(this.limiter);
        return synth;
      }

      setRegions(regionConfigs) {
        const configs = Array.isArray(regionConfigs) ? regionConfigs : [];

        while (this.synths.length > configs.length) {
          this.synths.pop().dispose();
        }

        configs.forEach((region, index) => {
          if (index >= this.synths.length) {
            this.synths.push(this.createSynth(region));
            return;
          }
          const synth = this.synths[index];
          synth.set(DriftEmulator.toSynthOptions(region));
          synth.volume.value = region.volumeDb;
        });
      }

      playNote(regionIndex, note = "C4", durationSeconds = 0.1, startDelayMs = 0) {
        const synth = this.synths[regionIndex];
        if (!synth) return;
        const time = Tone.now() + Math.max(0, startDelayMs) / 1000;
        synth.triggerAttackRelease(note, durationSeconds, time);
      }

      dispose() {
        this.synths.forEach((synth) => synth.dispose());
        this.synths = [];
        this.limiter.dispose();
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
