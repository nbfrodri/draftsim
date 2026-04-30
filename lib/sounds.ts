// Draft action sound effects sourced from CommunityDragon (live Riot client assets).
// Base path: rcp-fe-lol-champ-select/global/default/sounds/

const BASE =
  "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/sounds/";

// Note: all files are .ogg (Vorbis); Safari/iOS don't natively decode these,
// so sound will silently no-op on those browsers.
export const SOUND = {
  pickBlue: `${BASE}sfx-cs-draft-left-pick-single.ogg`,
  pickRed: `${BASE}sfx-cs-draft-right-pick-single.ogg`,
  banBlue: `${BASE}sfx-cs-draft-ban-your-team.ogg`,
  banRed: `${BASE}sfx-cs-draft-ban-enemy-team.ogg`,
  selectChampion: `${BASE}sfx-cs-button-thumbnail-click.ogg`,
  // Final-5 countdown tick from the actual Riot client. Plays once per
  // second when the action timer drops to ≤ 5s — the same audio cue the
  // user would hear in real champion select.
  timerTick: `${BASE}sfx-cs-timer-tick.ogg`,
} as const;

// Lightweight global player. Creates a fresh Audio element per play so
// rapid successive calls don't cut each other off. Caches a preloaded
// element per URL purely to warm up network/decoding.
//
// Volume model: each call to play() passes a per-sound `mix` (the natural
// loudness for that effect) which gets multiplied by the master volume the
// user controls from the UI. `enabled = false` is a hard mute regardless.
class SoundPlayer {
  private warm = new Map<string, HTMLAudioElement>();
  private _enabled = true;
  private _volume = 1.0;

  get enabled() {
    return this._enabled;
  }
  set enabled(v: boolean) {
    this._enabled = v;
  }

  get volume() {
    return this._volume;
  }
  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
  }

  preload(urls: readonly string[]) {
    if (typeof window === "undefined") return;
    for (const url of urls) {
      if (this.warm.has(url)) continue;
      const a = new Audio(url);
      a.preload = "auto";
      a.volume = 0;
      // Touching load() hints the browser to start fetching.
      a.load();
      this.warm.set(url, a);
    }
  }

  play(url: string, mix = 0.5) {
    if (!this._enabled || this._volume === 0) return;
    if (typeof window === "undefined") return;
    try {
      const a = new Audio(url);
      a.volume = Math.max(0, Math.min(1, mix * this._volume));
      void a.play().catch(() => {
        // Autoplay blocked; silent no-op until user interacts.
      });
    } catch {
      // Audio unsupported; ignore.
    }
  }
}

export const sounds = new SoundPlayer();

export function playActionSound(kind: "pick" | "ban", side: "blue" | "red") {
  if (kind === "pick") {
    sounds.play(side === "blue" ? SOUND.pickBlue : SOUND.pickRed, 0.55);
  } else {
    sounds.play(side === "blue" ? SOUND.banBlue : SOUND.banRed, 0.55);
  }
}

export function playSelectSound() {
  sounds.play(SOUND.selectChampion, 0.4);
}

// Plays the countdown tick. Called once per second when the action timer
// is in its last 5 seconds. Mix is louder than ambient clicks so it cuts
// through — it's an urgency cue, not background.
export function playTimerTick() {
  sounds.play(SOUND.timerTick, 0.7);
}

// ─── Match-event blips (synthesized via WebAudio) ──────────────────────────
// Plays a short tone when an event reveals during match playback. Three
// severities map to three sonic profiles:
//
//   minor — kill-level events (gank, solo-kill, plates, scuttle, etc.).
//           Soft blip at 620 Hz, ~80 ms.
//   mid   — objective events that affect map state (drake, herald, tower,
//           atakhan, grubs, inhibitor, teamfight, skirmish, etc.). Higher
//           blip at 780 Hz, ~110 ms.
//   major — game-defining events (soul, baron, elder, ace, shutdown,
//           backdoor, nexus). Two-note chord (root + fifth), ~220 ms.
//
// Sound is fully synthesized — no audio assets, no network. Respects the
// global sounds.enabled / sounds.volume the user controls. AudioContext
// is autoplay-blocked until first user gesture; the lazy init handles
// that gracefully (silent until the user clicks play/pause/etc).

let _audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (_audioCtx) return _audioCtx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    _audioCtx = new Ctor();
  } catch {
    return null;
  }
  return _audioCtx;
}

// One short tone: triangle wave with soft attack/release envelope so it
// doesn't pop. Durations and frequencies are tuned by ear at volume 0.5
// to feel like UI cues, not alarms.
function playTone(
  freq: number,
  durationMs: number,
  mix: number,
  startOffset = 0,
): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, now);
  // 8 ms attack, hold, 30 ms release. Linear ramps avoid click artifacts.
  const attack = 0.008;
  const release = 0.03;
  const peak = mix * sounds.volume;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + attack);
  gain.gain.setValueAtTime(peak, now + durationMs / 1000 - release);
  gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.01);
}

export type EventBlipSeverity = "minor" | "mid" | "major";

export function playEventBlip(severity: EventBlipSeverity): void {
  if (!sounds.enabled || sounds.volume === 0) return;
  if (severity === "minor") {
    playTone(620, 80, 0.18);
    return;
  }
  if (severity === "mid") {
    playTone(780, 110, 0.22);
    return;
  }
  // major: A-major chord (root, fifth, octave) staggered for drama.
  playTone(440, 220, 0.32, 0);
  playTone(660, 220, 0.22, 0.04);
  playTone(880, 180, 0.18, 0.08);
}
