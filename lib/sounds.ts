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
