"use strict";
(() => {
  // lib/teamStars.ts
  function normalizeTeamStars(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return 3;
    return Math.max(1, Math.min(5, Math.round(value * 2) / 2));
  }

  // lib/shareCodec.ts
  var MAX_SHARE_INPUT_CHARS = 64 * 1024 * 1024;
  var MAX_SHARE_OUTPUT_BYTES = 128 * 1024 * 1024;

  // lib/data/championMeta.json
  var championMeta_default = {
    Aatrox: {
      phase: "mid",
      archetypes: [
        "dive",
        "skirmish",
        "sustain"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        top: "S+"
      }
    },
    Ahri: {
      phase: "mid",
      archetypes: [
        "burst",
        "pick",
        "assassin"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        middle: "S"
      }
    },
    Akali: {
      phase: "mid",
      archetypes: [
        "assassin",
        "burst"
      ],
      cc: "none",
      mobility: "high",
      metaTiers: {
        middle: "S+",
        top: "A"
      }
    },
    Akshan: {
      phase: "mid",
      archetypes: [
        "skirmish",
        "pick"
      ],
      cc: "none",
      mobility: "high",
      metaTiers: {
        middle: "B",
        bottom: "A"
      }
    },
    Alistar: {
      phase: "mid",
      archetypes: [
        "tank",
        "engage",
        "peel"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        support: "S"
      }
    },
    Ambessa: {
      phase: "mid",
      archetypes: [
        "dive",
        "skirmish"
      ],
      cc: "soft",
      mobility: "high",
      metaTiers: {
        top: "S+"
      }
    },
    Amumu: {
      phase: "mid",
      archetypes: [
        "tank",
        "engage",
        "wombo"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "B",
        support: "C"
      }
    },
    Anivia: {
      phase: "late",
      archetypes: [
        "burst",
        "poke",
        "peel"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        middle: "A"
      }
    },
    Annie: {
      phase: "mid",
      archetypes: [
        "burst",
        "wombo"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        middle: "B",
        support: "A"
      }
    },
    Aphelios: {
      phase: "mid-late",
      archetypes: [
        "hyper-carry"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        bottom: "S"
      }
    },
    Ashe: {
      phase: "mid",
      archetypes: [
        "poke",
        "pick",
        "peel"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        bottom: "S",
        support: "B"
      }
    },
    AurelionSol: {
      phase: "late",
      archetypes: [
        "burst",
        "wombo",
        "poke"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        middle: "A"
      }
    },
    Aurora: {
      phase: "mid",
      archetypes: [
        "burst",
        "peel"
      ],
      cc: "soft",
      mobility: "medium",
      metaTiers: {
        middle: "S",
        top: "B"
      }
    },
    Azir: {
      phase: "late",
      archetypes: [
        "wombo",
        "poke",
        "peel"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        middle: "A"
      }
    },
    Bard: {
      phase: "mid",
      archetypes: [
        "pick",
        "peel",
        "wombo"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        support: "S+"
      }
    },
    Belveth: {
      phase: "mid-late",
      archetypes: [
        "skirmish",
        "dive",
        "hyper-carry"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        jungle: "S+"
      }
    },
    Blitzcrank: {
      phase: "mid",
      archetypes: [
        "pick",
        "engage"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "A"
      }
    },
    Brand: {
      phase: "mid",
      archetypes: [
        "burst",
        "wombo",
        "poke"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "A",
        middle: "B"
      }
    },
    Braum: {
      phase: "mid",
      archetypes: [
        "tank",
        "peel",
        "engage"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "S"
      }
    },
    Briar: {
      phase: "mid",
      archetypes: [
        "skirmish",
        "dive",
        "sustain"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "S+"
      }
    },
    Caitlyn: {
      phase: "mid-late",
      archetypes: [
        "poke",
        "hyper-carry"
      ],
      cc: "soft",
      mobility: "medium",
      metaTiers: {
        bottom: "S+"
      }
    },
    Camille: {
      phase: "mid",
      archetypes: [
        "splitpush",
        "dive",
        "skirmish"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        top: "S+",
        jungle: "B"
      }
    },
    Cassiopeia: {
      phase: "late",
      archetypes: [
        "poke",
        "burst",
        "skirmish"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        middle: "S",
        top: "B"
      }
    },
    Chogath: {
      phase: "mid",
      archetypes: [
        "tank",
        "engage"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        top: "B",
        jungle: "C"
      }
    },
    Corki: {
      phase: "mid-late",
      archetypes: [
        "poke",
        "burst"
      ],
      cc: "none",
      mobility: "medium",
      metaTiers: {
        middle: "B",
        bottom: "A"
      }
    },
    Darius: {
      phase: "early",
      archetypes: [
        "dive",
        "skirmish",
        "sustain"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        top: "S"
      }
    },
    Diana: {
      phase: "mid",
      archetypes: [
        "assassin",
        "dive",
        "wombo"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        jungle: "S",
        middle: "A"
      }
    },
    DrMundo: {
      phase: "late",
      archetypes: [
        "tank",
        "sustain"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        top: "B"
      }
    },
    Draven: {
      phase: "early",
      archetypes: [
        "hyper-carry",
        "skirmish"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        bottom: "A"
      }
    },
    Ekko: {
      phase: "mid",
      archetypes: [
        "assassin",
        "dive"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        jungle: "S",
        middle: "A"
      }
    },
    Elise: {
      phase: "early",
      archetypes: [
        "dive",
        "pick"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "B",
        support: "C"
      }
    },
    Evelynn: {
      phase: "mid",
      archetypes: [
        "assassin",
        "pick"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        jungle: "B"
      }
    },
    Ezreal: {
      phase: "mid-late",
      archetypes: [
        "poke",
        "skirmish"
      ],
      cc: "none",
      mobility: "high",
      metaTiers: {
        bottom: "S",
        middle: "B"
      }
    },
    Fiddlesticks: {
      phase: "mid",
      archetypes: [
        "wombo",
        "burst"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        jungle: "A",
        support: "C"
      }
    },
    Fiora: {
      phase: "mid",
      archetypes: [
        "splitpush",
        "skirmish"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        top: "S+"
      }
    },
    Fizz: {
      phase: "mid",
      archetypes: [
        "assassin",
        "burst"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        middle: "A",
        top: "C"
      }
    },
    Galio: {
      phase: "mid",
      archetypes: [
        "engage",
        "wombo",
        "tank"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        middle: "S",
        support: "A"
      }
    },
    Gangplank: {
      phase: "late",
      archetypes: [
        "splitpush",
        "poke"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        top: "A",
        middle: "C"
      }
    },
    Garen: {
      phase: "mid",
      archetypes: [
        "dive",
        "skirmish"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        top: "S",
        support: "C"
      }
    },
    Gnar: {
      phase: "mid",
      archetypes: [
        "poke",
        "wombo"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        top: "A"
      }
    },
    Gragas: {
      phase: "mid",
      archetypes: [
        "engage",
        "wombo"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "B",
        top: "C",
        middle: "C"
      }
    },
    Graves: {
      phase: "mid",
      archetypes: [
        "skirmish"
      ],
      cc: "soft",
      mobility: "medium",
      metaTiers: {
        jungle: "S"
      }
    },
    Gwen: {
      phase: "mid-late",
      archetypes: [
        "skirmish",
        "sustain",
        "splitpush"
      ],
      cc: "none",
      mobility: "medium",
      metaTiers: {
        top: "A",
        jungle: "C"
      }
    },
    Hecarim: {
      phase: "mid",
      archetypes: [
        "dive",
        "engage"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        jungle: "S+"
      }
    },
    Heimerdinger: {
      phase: "mid",
      archetypes: [
        "poke",
        "peel"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        top: "B",
        support: "A",
        middle: "C"
      }
    },
    Hwei: {
      phase: "mid",
      archetypes: [
        "burst",
        "poke",
        "peel"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        middle: "S",
        support: "B"
      }
    },
    Illaoi: {
      phase: "mid",
      archetypes: [
        "skirmish",
        "sustain"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        top: "B"
      }
    },
    Irelia: {
      phase: "mid",
      archetypes: [
        "skirmish",
        "dive"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        top: "A",
        middle: "B"
      }
    },
    Ivern: {
      phase: "mid",
      archetypes: [
        "peel",
        "enchanter"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        jungle: "B"
      }
    },
    Janna: {
      phase: "mid",
      archetypes: [
        "peel",
        "enchanter"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "S"
      }
    },
    JarvanIV: {
      phase: "mid",
      archetypes: [
        "engage",
        "dive"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "A"
      }
    },
    Jax: {
      phase: "mid-late",
      archetypes: [
        "splitpush",
        "skirmish"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        top: "S+",
        jungle: "B"
      }
    },
    Jayce: {
      phase: "mid",
      archetypes: [
        "poke"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        top: "A",
        middle: "C"
      }
    },
    Jhin: {
      phase: "mid",
      archetypes: [
        "poke",
        "hyper-carry",
        "pick"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        bottom: "S+"
      }
    },
    Jinx: {
      phase: "late",
      archetypes: [
        "hyper-carry"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        bottom: "S"
      }
    },
    KSante: {
      phase: "mid",
      archetypes: [
        "tank",
        "engage",
        "skirmish"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        top: "S"
      }
    },
    Kaisa: {
      phase: "mid-late",
      archetypes: [
        "hyper-carry",
        "dive"
      ],
      cc: "soft",
      mobility: "high",
      metaTiers: {
        bottom: "S+"
      }
    },
    Kalista: {
      phase: "mid",
      archetypes: [
        "hyper-carry",
        "pick"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        bottom: "B"
      }
    },
    Karma: {
      phase: "mid",
      archetypes: [
        "enchanter",
        "poke",
        "peel"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "S+",
        middle: "C"
      }
    },
    Karthus: {
      phase: "late",
      archetypes: [
        "wombo",
        "burst"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        jungle: "S",
        middle: "B"
      }
    },
    Kassadin: {
      phase: "late",
      archetypes: [
        "assassin",
        "skirmish"
      ],
      cc: "soft",
      mobility: "high",
      metaTiers: {
        middle: "A"
      }
    },
    Katarina: {
      phase: "mid",
      archetypes: [
        "assassin",
        "wombo"
      ],
      cc: "none",
      mobility: "high",
      metaTiers: {
        middle: "B"
      }
    },
    Kayle: {
      phase: "late",
      archetypes: [
        "hyper-carry",
        "splitpush"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        top: "A",
        middle: "C"
      }
    },
    Kayn: {
      phase: "mid",
      archetypes: [
        "assassin",
        "skirmish",
        "dive"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        jungle: "A"
      }
    },
    Kennen: {
      phase: "mid",
      archetypes: [
        "wombo",
        "burst"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        top: "B",
        middle: "C"
      }
    },
    Khazix: {
      phase: "mid",
      archetypes: [
        "assassin"
      ],
      cc: "soft",
      mobility: "high",
      metaTiers: {
        jungle: "S"
      }
    },
    Kindred: {
      phase: "mid-late",
      archetypes: [
        "hyper-carry",
        "skirmish"
      ],
      cc: "soft",
      mobility: "medium",
      metaTiers: {
        jungle: "A"
      }
    },
    Kled: {
      phase: "mid",
      archetypes: [
        "dive",
        "engage"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        top: "B",
        jungle: "C"
      }
    },
    KogMaw: {
      phase: "late",
      archetypes: [
        "hyper-carry"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        bottom: "A"
      }
    },
    Leblanc: {
      phase: "mid",
      archetypes: [
        "assassin",
        "burst",
        "pick"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        middle: "S"
      }
    },
    LeeSin: {
      phase: "early",
      archetypes: [
        "skirmish",
        "dive",
        "engage"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        jungle: "S"
      }
    },
    Leona: {
      phase: "mid",
      archetypes: [
        "tank",
        "engage"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        support: "S"
      }
    },
    Lillia: {
      phase: "mid",
      archetypes: [
        "skirmish",
        "wombo"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "S+",
        top: "C"
      }
    },
    Lissandra: {
      phase: "mid",
      archetypes: [
        "burst",
        "wombo"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        middle: "A"
      }
    },
    Locke: {
      phase: "mid",
      archetypes: [
        "burst",
        "assassin"
      ],
      cc: "soft",
      mobility: "high",
      metaTiers: {
        middle: "A"
      }
    },
    Lucian: {
      phase: "mid",
      archetypes: [
        "burst",
        "skirmish"
      ],
      cc: "none",
      mobility: "high",
      metaTiers: {
        middle: "A",
        bottom: "S"
      }
    },
    Lulu: {
      phase: "mid",
      archetypes: [
        "peel",
        "enchanter"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "S+",
        middle: "C",
        top: "C"
      }
    },
    Lux: {
      phase: "mid",
      archetypes: [
        "poke",
        "burst",
        "peel"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "A",
        middle: "B"
      }
    },
    Malphite: {
      phase: "mid",
      archetypes: [
        "tank",
        "engage",
        "wombo"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        top: "A",
        support: "B"
      }
    },
    Malzahar: {
      phase: "mid",
      archetypes: [
        "burst",
        "pick"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        middle: "A"
      }
    },
    Maokai: {
      phase: "mid",
      archetypes: [
        "tank",
        "engage"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "S",
        top: "A",
        jungle: "C"
      }
    },
    MasterYi: {
      phase: "mid-late",
      archetypes: [
        "skirmish",
        "splitpush"
      ],
      cc: "none",
      mobility: "high",
      metaTiers: {
        jungle: "S"
      }
    },
    Mel: {
      phase: "mid",
      archetypes: [
        "burst",
        "peel"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        middle: "S+",
        support: "B"
      }
    },
    Milio: {
      phase: "mid",
      archetypes: [
        "peel",
        "enchanter"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "S+"
      }
    },
    MissFortune: {
      phase: "mid",
      archetypes: [
        "wombo",
        "poke"
      ],
      cc: "soft",
      mobility: "medium",
      metaTiers: {
        bottom: "S",
        support: "B"
      }
    },
    MonkeyKing: {
      phase: "mid",
      archetypes: [
        "dive",
        "wombo"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        top: "B",
        jungle: "A"
      }
    },
    Mordekaiser: {
      phase: "mid",
      archetypes: [
        "dive",
        "skirmish",
        "sustain"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        top: "S",
        jungle: "C"
      }
    },
    Morgana: {
      phase: "mid",
      archetypes: [
        "peel",
        "pick"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "S",
        middle: "B"
      }
    },
    Naafiri: {
      phase: "mid",
      archetypes: [
        "assassin",
        "dive"
      ],
      cc: "none",
      mobility: "high",
      metaTiers: {
        middle: "S",
        jungle: "C"
      }
    },
    Nami: {
      phase: "mid",
      archetypes: [
        "enchanter",
        "peel",
        "wombo"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "S+"
      }
    },
    Nasus: {
      phase: "late",
      archetypes: [
        "splitpush",
        "skirmish",
        "sustain"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        top: "B"
      }
    },
    Nautilus: {
      phase: "mid",
      archetypes: [
        "tank",
        "engage",
        "pick"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        support: "S"
      }
    },
    Neeko: {
      phase: "mid",
      archetypes: [
        "burst",
        "wombo"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        middle: "A",
        support: "A"
      }
    },
    Nidalee: {
      phase: "early",
      archetypes: [
        "poke",
        "skirmish"
      ],
      cc: "soft",
      mobility: "high",
      metaTiers: {
        jungle: "B"
      }
    },
    Nilah: {
      phase: "mid-late",
      archetypes: [
        "hyper-carry",
        "skirmish"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        bottom: "A"
      }
    },
    Nocturne: {
      phase: "mid",
      archetypes: [
        "dive",
        "engage",
        "assassin"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        jungle: "A",
        middle: "C"
      }
    },
    Nunu: {
      phase: "mid",
      archetypes: [
        "engage",
        "peel"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        jungle: "A"
      }
    },
    Olaf: {
      phase: "early",
      archetypes: [
        "skirmish",
        "dive"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        top: "A",
        jungle: "S"
      }
    },
    Orianna: {
      phase: "mid",
      archetypes: [
        "wombo",
        "peel",
        "poke"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        middle: "S"
      }
    },
    Ornn: {
      phase: "mid",
      archetypes: [
        "tank",
        "engage",
        "wombo"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        top: "B"
      }
    },
    Pantheon: {
      phase: "early",
      archetypes: [
        "dive",
        "engage"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        support: "A",
        top: "B",
        middle: "C",
        jungle: "C"
      }
    },
    Poppy: {
      phase: "mid",
      archetypes: [
        "tank",
        "engage",
        "peel"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        top: "A",
        support: "A",
        jungle: "B"
      }
    },
    Pyke: {
      phase: "mid",
      archetypes: [
        "pick",
        "assassin",
        "engage"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        support: "S+",
        middle: "C"
      }
    },
    Qiyana: {
      phase: "mid",
      archetypes: [
        "assassin",
        "wombo"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        middle: "A"
      }
    },
    Quinn: {
      phase: "mid",
      archetypes: [
        "splitpush",
        "skirmish"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        top: "A",
        middle: "C"
      }
    },
    Rakan: {
      phase: "mid",
      archetypes: [
        "engage",
        "peel",
        "enchanter"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        support: "S+"
      }
    },
    Rammus: {
      phase: "mid",
      archetypes: [
        "tank",
        "engage"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "A",
        top: "C"
      }
    },
    RekSai: {
      phase: "mid",
      archetypes: [
        "skirmish",
        "dive"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "B"
      }
    },
    Rell: {
      phase: "mid",
      archetypes: [
        "tank",
        "engage",
        "wombo"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        support: "A",
        jungle: "C"
      }
    },
    Renata: {
      phase: "mid",
      archetypes: [
        "enchanter",
        "peel",
        "wombo"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "A"
      }
    },
    Renekton: {
      phase: "early",
      archetypes: [
        "dive",
        "skirmish"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        top: "A"
      }
    },
    Rengar: {
      phase: "mid",
      archetypes: [
        "assassin"
      ],
      cc: "soft",
      mobility: "high",
      metaTiers: {
        jungle: "S",
        top: "C"
      }
    },
    Riven: {
      phase: "mid-late",
      archetypes: [
        "skirmish",
        "dive"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        top: "S"
      }
    },
    Rumble: {
      phase: "mid",
      archetypes: [
        "wombo",
        "skirmish"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        top: "B",
        middle: "C"
      }
    },
    Ryze: {
      phase: "mid-late",
      archetypes: [
        "burst",
        "wombo"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        middle: "B",
        top: "C"
      }
    },
    Samira: {
      phase: "mid",
      archetypes: [
        "wombo",
        "skirmish",
        "hyper-carry"
      ],
      cc: "soft",
      mobility: "medium",
      metaTiers: {
        bottom: "A"
      }
    },
    Sejuani: {
      phase: "mid",
      archetypes: [
        "tank",
        "engage",
        "wombo"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "A"
      }
    },
    Senna: {
      phase: "late",
      archetypes: [
        "hyper-carry",
        "poke"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "S",
        bottom: "A"
      }
    },
    Seraphine: {
      phase: "mid-late",
      archetypes: [
        "wombo",
        "peel",
        "enchanter"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "A",
        middle: "B",
        bottom: "C"
      }
    },
    Sett: {
      phase: "mid",
      archetypes: [
        "dive",
        "skirmish",
        "engage"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        top: "S",
        support: "A",
        middle: "C"
      }
    },
    Shaco: {
      phase: "early",
      archetypes: [
        "assassin",
        "pick"
      ],
      cc: "none",
      mobility: "high",
      metaTiers: {
        jungle: "S",
        support: "B"
      }
    },
    Shen: {
      phase: "mid",
      archetypes: [
        "tank",
        "peel",
        "engage"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        top: "B",
        support: "B"
      }
    },
    Shyvana: {
      phase: "mid-late",
      archetypes: [
        "skirmish",
        "dive",
        "poke"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "A",
        top: "C"
      }
    },
    Singed: {
      phase: "mid",
      archetypes: [
        "splitpush"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        top: "B"
      }
    },
    Sion: {
      phase: "mid-late",
      archetypes: [
        "tank",
        "engage"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        top: "B",
        support: "C"
      }
    },
    Sivir: {
      phase: "mid-late",
      archetypes: [
        "hyper-carry",
        "peel"
      ],
      cc: "soft",
      mobility: "medium",
      metaTiers: {
        bottom: "A"
      }
    },
    Skarner: {
      phase: "mid",
      archetypes: [
        "tank",
        "engage"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "A",
        top: "C"
      }
    },
    Smolder: {
      phase: "late",
      archetypes: [
        "hyper-carry"
      ],
      cc: "soft",
      mobility: "medium",
      metaTiers: {
        bottom: "S"
      }
    },
    Sona: {
      phase: "mid",
      archetypes: [
        "enchanter",
        "peel",
        "wombo"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "A",
        middle: "C"
      }
    },
    Soraka: {
      phase: "mid",
      archetypes: [
        "enchanter",
        "peel"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        support: "S"
      }
    },
    Swain: {
      phase: "mid",
      archetypes: [
        "burst",
        "wombo",
        "sustain"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "A",
        top: "B",
        middle: "B"
      }
    },
    Sylas: {
      phase: "mid",
      archetypes: [
        "dive",
        "skirmish"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        middle: "S+",
        top: "A"
      }
    },
    Syndra: {
      phase: "mid-late",
      archetypes: [
        "burst",
        "wombo"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        middle: "A"
      }
    },
    TahmKench: {
      phase: "mid",
      archetypes: [
        "tank",
        "peel",
        "sustain"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        support: "A",
        top: "A"
      }
    },
    Taliyah: {
      phase: "mid",
      archetypes: [
        "wombo",
        "poke"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        middle: "A",
        jungle: "A"
      }
    },
    Talon: {
      phase: "mid",
      archetypes: [
        "assassin"
      ],
      cc: "soft",
      mobility: "high",
      metaTiers: {
        middle: "A",
        jungle: "B"
      }
    },
    Taric: {
      phase: "mid",
      archetypes: [
        "tank",
        "peel",
        "engage"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "A"
      }
    },
    Teemo: {
      phase: "mid-late",
      archetypes: [
        "splitpush",
        "poke"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        top: "B",
        middle: "C",
        support: "C"
      }
    },
    Thresh: {
      phase: "mid-late",
      archetypes: [
        "pick",
        "engage",
        "peel"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "S+"
      }
    },
    Tristana: {
      phase: "mid-late",
      archetypes: [
        "hyper-carry",
        "dive"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        bottom: "S",
        middle: "B"
      }
    },
    Trundle: {
      phase: "mid",
      archetypes: [
        "dive",
        "skirmish",
        "splitpush"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        jungle: "A",
        top: "A"
      }
    },
    Tryndamere: {
      phase: "mid-late",
      archetypes: [
        "splitpush",
        "skirmish"
      ],
      cc: "soft",
      mobility: "medium",
      metaTiers: {
        top: "A"
      }
    },
    TwistedFate: {
      phase: "mid",
      archetypes: [
        "pick",
        "wombo"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        middle: "A",
        support: "C"
      }
    },
    Twitch: {
      phase: "late",
      archetypes: [
        "hyper-carry",
        "poke"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        bottom: "S",
        jungle: "C"
      }
    },
    Udyr: {
      phase: "mid",
      archetypes: [
        "skirmish",
        "dive"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "A"
      }
    },
    Urgot: {
      phase: "mid",
      archetypes: [
        "dive",
        "sustain"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        top: "A"
      }
    },
    Varus: {
      phase: "mid",
      archetypes: [
        "poke",
        "hyper-carry"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        bottom: "A",
        support: "B"
      }
    },
    Vayne: {
      phase: "late",
      archetypes: [
        "hyper-carry",
        "splitpush"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        bottom: "S+",
        top: "C"
      }
    },
    Veigar: {
      phase: "late",
      archetypes: [
        "burst",
        "wombo"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        middle: "S",
        support: "B"
      }
    },
    Velkoz: {
      phase: "mid",
      archetypes: [
        "poke",
        "burst"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        middle: "A",
        support: "A"
      }
    },
    Vex: {
      phase: "mid",
      archetypes: [
        "burst",
        "peel"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        middle: "A",
        support: "B"
      }
    },
    Vi: {
      phase: "mid",
      archetypes: [
        "engage",
        "dive"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "A"
      }
    },
    Viego: {
      phase: "mid",
      archetypes: [
        "skirmish",
        "dive"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "A"
      }
    },
    Viktor: {
      phase: "mid-late",
      archetypes: [
        "wombo",
        "burst"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        middle: "A"
      }
    },
    Vladimir: {
      phase: "mid-late",
      archetypes: [
        "sustain",
        "burst",
        "wombo"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        middle: "B",
        top: "B"
      }
    },
    Volibear: {
      phase: "mid",
      archetypes: [
        "dive",
        "skirmish"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        top: "A",
        jungle: "A"
      }
    },
    Warwick: {
      phase: "mid",
      archetypes: [
        "dive",
        "skirmish",
        "sustain"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "A",
        top: "B"
      }
    },
    Xayah: {
      phase: "mid-late",
      archetypes: [
        "hyper-carry",
        "peel"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        bottom: "S"
      }
    },
    Xerath: {
      phase: "mid",
      archetypes: [
        "poke",
        "burst"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        middle: "B",
        support: "A"
      }
    },
    XinZhao: {
      phase: "mid",
      archetypes: [
        "engage",
        "dive"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "A"
      }
    },
    Yasuo: {
      phase: "mid",
      archetypes: [
        "skirmish",
        "wombo"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        middle: "S+",
        top: "A"
      }
    },
    Yone: {
      phase: "mid",
      archetypes: [
        "skirmish",
        "dive"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        middle: "S+",
        top: "A"
      }
    },
    Yorick: {
      phase: "mid-late",
      archetypes: [
        "splitpush",
        "sustain"
      ],
      cc: "soft",
      mobility: "low",
      metaTiers: {
        top: "A"
      }
    },
    Yunara: {
      phase: "mid-late",
      archetypes: [
        "hyper-carry",
        "skirmish"
      ],
      cc: "soft",
      mobility: "medium",
      metaTiers: {
        bottom: "S+"
      }
    },
    Yuumi: {
      phase: "mid",
      archetypes: [
        "enchanter",
        "peel"
      ],
      cc: "hard",
      mobility: "high",
      metaTiers: {
        support: "S+"
      }
    },
    Zac: {
      phase: "mid",
      archetypes: [
        "tank",
        "engage",
        "wombo"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        jungle: "A",
        support: "C"
      }
    },
    Zaahen: {
      phase: "mid-late",
      archetypes: [
        "skirmish",
        "dive",
        "sustain"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        top: "S+",
        jungle: "A"
      }
    },
    Zed: {
      phase: "mid",
      archetypes: [
        "assassin"
      ],
      cc: "soft",
      mobility: "high",
      metaTiers: {
        middle: "A"
      }
    },
    Zeri: {
      phase: "mid-late",
      archetypes: [
        "hyper-carry",
        "skirmish"
      ],
      cc: "soft",
      mobility: "high",
      metaTiers: {
        bottom: "S+"
      }
    },
    Ziggs: {
      phase: "mid-late",
      archetypes: [
        "poke",
        "burst"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        middle: "B",
        bottom: "A"
      }
    },
    Zilean: {
      phase: "mid",
      archetypes: [
        "peel",
        "enchanter"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "A",
        middle: "C"
      }
    },
    Zoe: {
      phase: "mid",
      archetypes: [
        "burst",
        "pick"
      ],
      cc: "hard",
      mobility: "medium",
      metaTiers: {
        middle: "A"
      }
    },
    Zyra: {
      phase: "mid",
      archetypes: [
        "burst",
        "wombo"
      ],
      cc: "hard",
      mobility: "low",
      metaTiers: {
        support: "A",
        middle: "C"
      }
    }
  };

  // lib/data/championSynergies.json
  var championSynergies_default = [
    {
      champs: [
        "Malphite",
        "Yasuo"
      ],
      bonus: 3,
      tag: "Knockup Wombo"
    },
    {
      champs: [
        "Orianna",
        "Yasuo"
      ],
      bonus: 3,
      tag: "Shockwave Combo"
    },
    {
      champs: [
        "Kennen",
        "Malphite"
      ],
      bonus: 2,
      tag: "Wombo AOE"
    },
    {
      champs: [
        "Malphite",
        "Orianna"
      ],
      bonus: 2,
      tag: "Wombo AOE"
    },
    {
      champs: [
        "Malphite",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Knockup \u2192 Bullet Time"
    },
    {
      champs: [
        "Diana",
        "Kennen"
      ],
      bonus: 2,
      tag: "Pull + AOE Stun"
    },
    {
      champs: [
        "Diana",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Wombo Combo"
    },
    {
      champs: [
        "Sejuani",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Glacial \u2192 Last Breath"
    },
    {
      champs: [
        "JarvanIV",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Cataclysm \u2192 Last Breath"
    },
    {
      champs: [
        "MonkeyKing",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Cyclone \u2192 Last Breath"
    },
    {
      champs: [
        "Galio",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Engage Wombo"
    },
    {
      champs: [
        "Galio",
        "Kennen"
      ],
      bonus: 2,
      tag: "Multi-engage"
    },
    {
      champs: [
        "Amumu",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Curse \u2192 Bullet Time"
    },
    {
      champs: [
        "Amumu",
        "Kennen"
      ],
      bonus: 2,
      tag: "Bandage Wombo"
    },
    {
      champs: [
        "Rell",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Crash \u2192 Last Breath"
    },
    {
      champs: [
        "Gnar",
        "Malphite"
      ],
      bonus: 2,
      tag: "Wall Wombo"
    },
    {
      champs: [
        "Zac",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Slingshot \u2192 Last Breath"
    },
    {
      champs: [
        "Rakan",
        "Xayah"
      ],
      bonus: 2,
      tag: "Lovers"
    },
    {
      champs: [
        "Lulu",
        "Vayne"
      ],
      bonus: 3,
      tag: "Hyper-Protect"
    },
    {
      champs: [
        "Lulu",
        "Twitch"
      ],
      bonus: 2,
      tag: "Polymorph + Stealth"
    },
    {
      champs: [
        "Jinx",
        "Lulu"
      ],
      bonus: 2,
      tag: "Polymorph + Hyper-Carry"
    },
    {
      champs: [
        "KogMaw",
        "Lulu"
      ],
      bonus: 2,
      tag: "Untouchable Carry"
    },
    {
      champs: [
        "Janna",
        "Vayne"
      ],
      bonus: 2,
      tag: "Disengage Carry"
    },
    {
      champs: [
        "Janna",
        "Tristana"
      ],
      bonus: 2,
      tag: "Peel Hyper"
    },
    {
      champs: [
        "MasterYi",
        "Yuumi"
      ],
      bonus: 3,
      tag: "Untargetable Splitpush"
    },
    {
      champs: [
        "Vayne",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Attached Hyper-Carry"
    },
    {
      champs: [
        "Kayn",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Attached Skirmish"
    },
    {
      champs: [
        "Soraka",
        "Twitch"
      ],
      bonus: 2,
      tag: "Heal + Invisible Carry"
    },
    {
      champs: [
        "Senna",
        "Soraka"
      ],
      bonus: 2,
      tag: "Sustain + Scaling"
    },
    {
      champs: [
        "Milio",
        "Vayne"
      ],
      bonus: 2,
      tag: "Cleanse + Hyper-Carry"
    },
    {
      champs: [
        "Aphelios",
        "Milio"
      ],
      bonus: 2,
      tag: "Cleanse Hyper"
    },
    {
      champs: [
        "Lucian",
        "Nami"
      ],
      bonus: 3,
      tag: "Tidecaller's Blessing"
    },
    {
      champs: [
        "Karma",
        "Lucian"
      ],
      bonus: 2,
      tag: "Mantra Burst"
    },
    {
      champs: [
        "Braum",
        "Lucian"
      ],
      bonus: 2,
      tag: "Concussive Combo"
    },
    {
      champs: [
        "Caitlyn",
        "Lulu"
      ],
      bonus: 2,
      tag: "Trap Cage Lockdown"
    },
    {
      champs: [
        "Caitlyn",
        "Morgana"
      ],
      bonus: 2,
      tag: "Bind into Trap"
    },
    {
      champs: [
        "Kalista",
        "Thresh"
      ],
      bonus: 3,
      tag: "Soul Bond"
    },
    {
      champs: [
        "Caitlyn",
        "Thresh"
      ],
      bonus: 2,
      tag: "Hook into Trap"
    },
    {
      champs: [
        "Thresh",
        "Vayne"
      ],
      bonus: 2,
      tag: "Hook into Stun"
    },
    {
      champs: [
        "Lucian",
        "Pyke"
      ],
      bonus: 2,
      tag: "Hook + Execute"
    },
    {
      champs: [
        "Pyke",
        "Tristana"
      ],
      bonus: 2,
      tag: "Hook + Burst"
    },
    {
      champs: [
        "Blitzcrank",
        "Brand"
      ],
      bonus: 3,
      tag: "Hook into Triple Proc"
    },
    {
      champs: [
        "Blitzcrank",
        "Veigar"
      ],
      bonus: 2,
      tag: "Hook into Stun Cage"
    },
    {
      champs: [
        "Nautilus",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Hook into Wombo"
    },
    {
      champs: [
        "Lucian",
        "Nautilus"
      ],
      bonus: 2,
      tag: "Hook + Burst"
    },
    {
      champs: [
        "Leona",
        "Lucian"
      ],
      bonus: 2,
      tag: "Solar Flare + Burst"
    },
    {
      champs: [
        "Leona",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Engage + Wombo"
    },
    {
      champs: [
        "Alistar",
        "Tristana"
      ],
      bonus: 2,
      tag: "Headbutt Combo"
    },
    {
      champs: [
        "Diana",
        "Rakan"
      ],
      bonus: 2,
      tag: "Engage + Pull"
    },
    {
      champs: [
        "Tryndamere",
        "TwistedFate"
      ],
      bonus: 2,
      tag: "1-3-1 with Global"
    },
    {
      champs: [
        "Camille",
        "TwistedFate"
      ],
      bonus: 2,
      tag: "Splitpush + Map Pressure"
    },
    {
      champs: [
        "Jhin",
        "Senna"
      ],
      bonus: 2,
      tag: "Crit + Scaling Botlane"
    },
    {
      champs: [
        "LeeSin",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Insec \u2192 Last Breath"
    },
    {
      champs: [
        "Hecarim",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Charge Wombo"
    },
    {
      champs: [
        "Maokai",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Wave Wombo"
    },
    {
      champs: [
        "Volibear",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Stun Wombo"
    },
    {
      champs: [
        "Annie",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Tibbers Wombo"
    },
    {
      champs: [
        "Veigar",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Cage Wombo"
    },
    {
      champs: [
        "Alistar",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Pulverize \u2192 Last Breath"
    },
    {
      champs: [
        "Nautilus",
        "Veigar"
      ],
      bonus: 2,
      tag: "Hook into Cage"
    },
    {
      champs: [
        "Caitlyn",
        "Leona"
      ],
      bonus: 2,
      tag: "Sun + Trap Lockdown"
    },
    {
      champs: [
        "Caitlyn",
        "Nautilus"
      ],
      bonus: 2,
      tag: "Root + Trap"
    },
    {
      champs: [
        "Skarner",
        "Veigar"
      ],
      bonus: 2,
      tag: "Drag into Cage"
    },
    {
      champs: [
        "Bard",
        "Twitch"
      ],
      bonus: 2,
      tag: "Stasis + Invisible Carry"
    },
    {
      champs: [
        "Talon",
        "TwistedFate"
      ],
      bonus: 3,
      tag: "Double Global Roam"
    },
    {
      champs: [
        "Pantheon",
        "TwistedFate"
      ],
      bonus: 2,
      tag: "Global Engage"
    },
    {
      champs: [
        "Jhin",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Attached Crit Hyper"
    },
    {
      champs: [
        "Karma",
        "Senna"
      ],
      bonus: 2,
      tag: "Mantra Poke + Scaling"
    },
    {
      champs: [
        "Pantheon",
        "Kayle"
      ],
      bonus: 2,
      tag: "Bully + Scaling Carry"
    },
    {
      champs: [
        "Kayle",
        "Rakan"
      ],
      bonus: 2,
      tag: "Engage + Scaling Protect"
    },
    {
      champs: [
        "Amumu",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Curse Wombo"
    },
    {
      champs: [
        "Skarner",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Drag \u2192 Last Breath"
    },
    {
      champs: [
        "Pantheon",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Stun \u2192 Last Breath"
    },
    {
      champs: [
        "KSante",
        "Yasuo"
      ],
      bonus: 2,
      tag: "All Out Wombo"
    },
    {
      champs: [
        "Diana",
        "MonkeyKing"
      ],
      bonus: 2,
      tag: "Spin + Pull AOE"
    },
    {
      champs: [
        "JarvanIV",
        "Orianna"
      ],
      bonus: 2,
      tag: "Cataclysm Shockwave"
    },
    {
      champs: [
        "Sejuani",
        "Orianna"
      ],
      bonus: 2,
      tag: "Glacial Shockwave"
    },
    {
      champs: [
        "MonkeyKing",
        "Orianna"
      ],
      bonus: 2,
      tag: "Cyclone Shockwave"
    },
    {
      champs: [
        "Amumu",
        "Orianna"
      ],
      bonus: 2,
      tag: "Bandage Shockwave"
    },
    {
      champs: [
        "Galio",
        "Orianna"
      ],
      bonus: 2,
      tag: "Engage Shockwave"
    },
    {
      champs: [
        "Nautilus",
        "Orianna"
      ],
      bonus: 2,
      tag: "Hook Shockwave"
    },
    {
      champs: [
        "Karthus",
        "Maokai"
      ],
      bonus: 2,
      tag: "Root + Requiem"
    },
    {
      champs: [
        "Karthus",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Slow + Requiem"
    },
    {
      champs: [
        "Karthus",
        "Nautilus"
      ],
      bonus: 2,
      tag: "Hook + Requiem"
    },
    {
      champs: [
        "Amumu",
        "Karthus"
      ],
      bonus: 2,
      tag: "Curse + Requiem"
    },
    {
      champs: [
        "Karthus",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Wombo + Global"
    },
    {
      champs: [
        "Brand",
        "Pyke"
      ],
      bonus: 2,
      tag: "Hook + Triple Proc"
    },
    {
      champs: [
        "Brand",
        "Nautilus"
      ],
      bonus: 2,
      tag: "Hook + AOE Burn"
    },
    {
      champs: [
        "Brand",
        "Morgana"
      ],
      bonus: 2,
      tag: "Root + Triple Proc"
    },
    {
      champs: [
        "Brand",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Slow + Triple Proc"
    },
    {
      champs: [
        "KogMaw",
        "Soraka"
      ],
      bonus: 2,
      tag: "Heal + Late Carry"
    },
    {
      champs: [
        "Kayle",
        "Soraka"
      ],
      bonus: 2,
      tag: "Heal + Scaling"
    },
    {
      champs: [
        "Kayle",
        "Lulu"
      ],
      bonus: 2,
      tag: "Polymorph + Scaling"
    },
    {
      champs: [
        "Kayle",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Attached Scaling"
    },
    {
      champs: [
        "KogMaw",
        "Milio"
      ],
      bonus: 2,
      tag: "Cleanse + Late Carry"
    },
    {
      champs: [
        "Milio",
        "Twitch"
      ],
      bonus: 2,
      tag: "Cleanse + Stealth"
    },
    {
      champs: [
        "Aphelios",
        "Soraka"
      ],
      bonus: 2,
      tag: "Heal + Hyper"
    },
    {
      champs: [
        "TahmKench",
        "Vayne"
      ],
      bonus: 2,
      tag: "Devour Hyper-Carry"
    },
    {
      champs: [
        "KogMaw",
        "TahmKench"
      ],
      bonus: 2,
      tag: "Devour Late-Carry"
    },
    {
      champs: [
        "TahmKench",
        "Twitch"
      ],
      bonus: 2,
      tag: "Devour Stealth Carry"
    },
    {
      champs: [
        "Quinn",
        "TwistedFate"
      ],
      bonus: 2,
      tag: "Sidelane + Global"
    },
    {
      champs: [
        "Fiora",
        "TwistedFate"
      ],
      bonus: 2,
      tag: "1v1 + Map Pressure"
    },
    {
      champs: [
        "Singed",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Proxy + Untargetable"
    },
    {
      champs: [
        "Camille",
        "Fiora"
      ],
      bonus: 2,
      tag: "Top + Jungle Splitpush"
    },
    {
      champs: [
        "Sion",
        "TwistedFate"
      ],
      bonus: 2,
      tag: "Charge + Global"
    },
    {
      champs: [
        "Talon",
        "Zed"
      ],
      bonus: 3,
      tag: "Double Roam Burst"
    },
    {
      champs: [
        "Khazix",
        "Rengar"
      ],
      bonus: 2,
      tag: "Predator Pair"
    },
    {
      champs: [
        "Akali",
        "Talon"
      ],
      bonus: 2,
      tag: "Coordinated Assassins"
    },
    {
      champs: [
        "Akali",
        "Zed"
      ],
      bonus: 2,
      tag: "Mid + Jungle Burst"
    },
    {
      champs: [
        "Khazix",
        "Leblanc"
      ],
      bonus: 2,
      tag: "Isolate + Burst"
    },
    {
      champs: [
        "Anivia",
        "Veigar"
      ],
      bonus: 2,
      tag: "Wall + Cage"
    },
    {
      champs: [
        "Anivia",
        "Karthus"
      ],
      bonus: 2,
      tag: "Wall + Requiem"
    },
    {
      champs: [
        "Maokai",
        "Veigar"
      ],
      bonus: 2,
      tag: "Root + Cage"
    },
    {
      champs: [
        "Sejuani",
        "Veigar"
      ],
      bonus: 2,
      tag: "Slow + Cage"
    },
    {
      champs: [
        "Leona",
        "Veigar"
      ],
      bonus: 2,
      tag: "Sun + Cage"
    },
    {
      champs: [
        "Pyke",
        "Thresh"
      ],
      bonus: 2,
      tag: "Double Hook"
    },
    {
      champs: [
        "Leona",
        "Morgana"
      ],
      bonus: 2,
      tag: "Sun + Root"
    },
    {
      champs: [
        "Morgana",
        "Nautilus"
      ],
      bonus: 2,
      tag: "Hook Root Chain"
    },
    {
      champs: [
        "Lissandra",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Frozen Tomb Lockdown"
    },
    {
      champs: [
        "Briar",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Rabid Splitpush"
    },
    {
      champs: [
        "Olaf",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Berserker Attached"
    },
    {
      champs: [
        "Jax",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Splitpush Attached"
    },
    {
      champs: [
        "Renata",
        "Vayne"
      ],
      bonus: 2,
      tag: "Berserk + Hyper-Carry"
    },
    {
      champs: [
        "Lucian",
        "Lulu"
      ],
      bonus: 2,
      tag: "Polymorph + Burst"
    },
    {
      champs: [
        "Lucian",
        "Milio"
      ],
      bonus: 2,
      tag: "Cleanse + Burst"
    },
    {
      champs: [
        "JarvanIV",
        "Rumble"
      ],
      bonus: 3,
      tag: "Cataclysm + Equalizer"
    },
    {
      champs: [
        "Galio",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Cataclysm + Idol Durand"
    },
    {
      champs: [
        "JarvanIV",
        "Lissandra"
      ],
      bonus: 2,
      tag: "Cataclysm + Frozen Tomb"
    },
    {
      champs: [
        "Anivia",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Cataclysm + Glacial Storm"
    },
    {
      champs: [
        "JarvanIV",
        "Kennen"
      ],
      bonus: 2,
      tag: "Cataclysm + Maelstrom"
    },
    {
      champs: [
        "JarvanIV",
        "Ziggs"
      ],
      bonus: 2,
      tag: "Cataclysm + Mega Inferno"
    },
    {
      champs: [
        "Brand",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Cataclysm + Pyroclasm"
    },
    {
      champs: [
        "Diana",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Cataclysm + Moonfall"
    },
    {
      champs: [
        "JarvanIV",
        "Veigar"
      ],
      bonus: 2,
      tag: "Cataclysm + Cage"
    },
    {
      champs: [
        "Ahri",
        "Vi"
      ],
      bonus: 3,
      tag: "Charm + Vault Breaker"
    },
    {
      champs: [
        "Ahri",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Charm + Cataclysm"
    },
    {
      champs: [
        "Ahri",
        "Rumble"
      ],
      bonus: 2,
      tag: "Charm + Equalizer"
    },
    {
      champs: [
        "Ahri",
        "LeeSin"
      ],
      bonus: 2,
      tag: "Charm + Insec"
    },
    {
      champs: [
        "Ahri",
        "Talon"
      ],
      bonus: 2,
      tag: "Charm Roam Pair"
    },
    {
      champs: [
        "Ahri",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Charm + Glacial"
    },
    {
      champs: [
        "Ahri",
        "Pyke"
      ],
      bonus: 2,
      tag: "Charm + Execute"
    },
    {
      champs: [
        "Ahri",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Charm + Charge"
    },
    {
      champs: [
        "Ahri",
        "Diana"
      ],
      bonus: 2,
      tag: "Charm + Moonfall"
    },
    {
      champs: [
        "Orianna",
        "Vi"
      ],
      bonus: 3,
      tag: "Vault Breaker + Shockwave"
    },
    {
      champs: [
        "Karthus",
        "Vi"
      ],
      bonus: 2,
      tag: "Vault + Requiem"
    },
    {
      champs: [
        "Vi",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Vault \u2192 Last Breath"
    },
    {
      champs: [
        "Brand",
        "Vi"
      ],
      bonus: 2,
      tag: "Vault + Pyroclasm"
    },
    {
      champs: [
        "Veigar",
        "Vi"
      ],
      bonus: 2,
      tag: "Vault + Cage"
    },
    {
      champs: [
        "Caitlyn",
        "Karma"
      ],
      bonus: 2,
      tag: "Mantra E + Trap Range"
    },
    {
      champs: [
        "Caitlyn",
        "Sona"
      ],
      bonus: 2,
      tag: "Crescendo + Traps"
    },
    {
      champs: [
        "Caitlyn",
        "Janna"
      ],
      bonus: 2,
      tag: "Disengage + Traps"
    },
    {
      champs: [
        "Bard",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Stasis + Traps"
    },
    {
      champs: [
        "Hecarim",
        "Karthus"
      ],
      bonus: 2,
      tag: "Charge + Requiem"
    },
    {
      champs: [
        "Hecarim",
        "Kennen"
      ],
      bonus: 2,
      tag: "Onslaught + Maelstrom"
    },
    {
      champs: [
        "Brand",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Charge + Pyroclasm"
    },
    {
      champs: [
        "Hecarim",
        "Orianna"
      ],
      bonus: 2,
      tag: "Charge + Shockwave"
    },
    {
      champs: [
        "Brand",
        "Diana"
      ],
      bonus: 2,
      tag: "Moonfall + Pyroclasm"
    },
    {
      champs: [
        "Diana",
        "Karthus"
      ],
      bonus: 2,
      tag: "Moonfall + Requiem"
    },
    {
      champs: [
        "Diana",
        "Veigar"
      ],
      bonus: 2,
      tag: "Moonfall + Cage"
    },
    {
      champs: [
        "Diana",
        "Orianna"
      ],
      bonus: 2,
      tag: "Moonfall + Shockwave"
    },
    {
      champs: [
        "Karthus",
        "Lillia"
      ],
      bonus: 3,
      tag: "Sleep + Requiem"
    },
    {
      champs: [
        "Lillia",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Sleep \u2192 Last Breath"
    },
    {
      champs: [
        "Lillia",
        "Veigar"
      ],
      bonus: 2,
      tag: "Sleep + Cage"
    },
    {
      champs: [
        "Brand",
        "Lillia"
      ],
      bonus: 2,
      tag: "Sleep + Pyroclasm"
    },
    {
      champs: [
        "Yasuo",
        "Yone"
      ],
      bonus: 2,
      tag: "Twin Breath"
    },
    {
      champs: [
        "Vi",
        "Yone"
      ],
      bonus: 2,
      tag: "Vault + Twin"
    },
    {
      champs: [
        "Akali",
        "Vi"
      ],
      bonus: 2,
      tag: "Mid + JG Burst"
    },
    {
      champs: [
        "LeeSin",
        "Veigar"
      ],
      bonus: 2,
      tag: "Cage on Insec"
    },
    {
      champs: [
        "Kassadin",
        "LeeSin"
      ],
      bonus: 2,
      tag: "R Blink + Insec"
    },
    {
      champs: [
        "Blitzcrank",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Hook + Trap"
    },
    {
      champs: [
        "Blitzcrank",
        "Vayne"
      ],
      bonus: 2,
      tag: "Hook + Crit Hyper"
    },
    {
      champs: [
        "Blitzcrank",
        "Jhin"
      ],
      bonus: 2,
      tag: "Hook + Killshot"
    },
    {
      champs: [
        "Blitzcrank",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Hook + Bullet Time"
    },
    {
      champs: [
        "Jhin",
        "Thresh"
      ],
      bonus: 2,
      tag: "Hook + Killshot"
    },
    {
      champs: [
        "Lucian",
        "Thresh"
      ],
      bonus: 3,
      tag: "Lantern Dash + Burst"
    },
    {
      champs: [
        "Pyke",
        "Vayne"
      ],
      bonus: 2,
      tag: "Hook + Crit Stun"
    },
    {
      champs: [
        "Pyke",
        "Twitch"
      ],
      bonus: 2,
      tag: "Stealth Pick"
    },
    {
      champs: [
        "Caitlyn",
        "Pyke"
      ],
      bonus: 2,
      tag: "Hook + Trap"
    },
    {
      champs: [
        "Lucian",
        "Morgana"
      ],
      bonus: 2,
      tag: "Root + Burst"
    },
    {
      champs: [
        "MissFortune",
        "Morgana"
      ],
      bonus: 2,
      tag: "Root + Bullet Time"
    },
    {
      champs: [
        "Karthus",
        "Morgana"
      ],
      bonus: 2,
      tag: "Root + Requiem"
    },
    {
      champs: [
        "Lux",
        "Morgana"
      ],
      bonus: 2,
      tag: "Root + Finales"
    },
    {
      champs: [
        "Maokai",
        "Morgana"
      ],
      bonus: 2,
      tag: "Root Chain"
    },
    {
      champs: [
        "MissFortune",
        "Nautilus"
      ],
      bonus: 2,
      tag: "Hook + Bullet Time"
    },
    {
      champs: [
        "Nautilus",
        "Twitch"
      ],
      bonus: 2,
      tag: "Hook + Spray"
    },
    {
      champs: [
        "Lissandra",
        "Nautilus"
      ],
      bonus: 2,
      tag: "Hook + Frozen Tomb"
    },
    {
      champs: [
        "Jhin",
        "Karma"
      ],
      bonus: 2,
      tag: "Mantra Speed + Crit"
    },
    {
      champs: [
        "Karma",
        "Vayne"
      ],
      bonus: 2,
      tag: "Mantra Speed + Mobile"
    },
    {
      champs: [
        "Ezreal",
        "Karma"
      ],
      bonus: 2,
      tag: "Mantra E Empower"
    },
    {
      champs: [
        "Rakan",
        "Twitch"
      ],
      bonus: 2,
      tag: "Engage + Stealth"
    },
    {
      champs: [
        "Rakan",
        "Vayne"
      ],
      bonus: 2,
      tag: "Engage + Crit"
    },
    {
      champs: [
        "MissFortune",
        "Rakan"
      ],
      bonus: 2,
      tag: "Engage + Bullet Time"
    },
    {
      champs: [
        "Aphelios",
        "Rakan"
      ],
      bonus: 2,
      tag: "Engage + Late Carry"
    },
    {
      champs: [
        "Rakan",
        "Tristana"
      ],
      bonus: 2,
      tag: "Engage + Reset"
    },
    {
      champs: [
        "Jinx",
        "Rakan"
      ],
      bonus: 2,
      tag: "Engage + Hyper"
    },
    {
      champs: [
        "Jhin",
        "Soraka"
      ],
      bonus: 2,
      tag: "Heal + Crit"
    },
    {
      champs: [
        "Soraka",
        "Tristana"
      ],
      bonus: 2,
      tag: "Heal + Reset Hyper"
    },
    {
      champs: [
        "Soraka",
        "Vayne"
      ],
      bonus: 2,
      tag: "Heal + Late Hyper"
    },
    {
      champs: [
        "Janna",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Disengage + Late Carry"
    },
    {
      champs: [
        "Aphelios",
        "Janna"
      ],
      bonus: 2,
      tag: "Disengage + Hyper"
    },
    {
      champs: [
        "Janna",
        "Jhin"
      ],
      bonus: 2,
      tag: "Disengage + Crit"
    },
    {
      champs: [
        "Janna",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Disengage + Bullet Time"
    },
    {
      champs: [
        "Warwick",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Bloodthirst Attached"
    },
    {
      champs: [
        "Garen",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Spin Attached"
    },
    {
      champs: [
        "Rengar",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Predator Attached"
    },
    {
      champs: [
        "Hecarim",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Charge Attached"
    },
    {
      champs: [
        "Camille",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Hookshot Attached"
    },
    {
      champs: [
        "Fiora",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Splitpush Attached"
    },
    {
      champs: [
        "Trundle",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Splitpush Sustain"
    },
    {
      champs: [
        "TwistedFate",
        "Yorick"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Gangplank",
        "TwistedFate"
      ],
      bonus: 3,
      tag: "Double Global"
    },
    {
      champs: [
        "Camille",
        "Tryndamere"
      ],
      bonus: 2,
      tag: "Top + JG Splitpush"
    },
    {
      champs: [
        "Leona",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Engage Stack"
    },
    {
      champs: [
        "Lissandra",
        "Rell"
      ],
      bonus: 2,
      tag: "Stun + Frozen Tomb"
    },
    {
      champs: [
        "Lissandra",
        "Maokai"
      ],
      bonus: 2,
      tag: "Root + Frozen Tomb"
    },
    {
      champs: [
        "KSante",
        "Orianna"
      ],
      bonus: 2,
      tag: "All Out + Shockwave"
    },
    {
      champs: [
        "Karthus",
        "MonkeyKing"
      ],
      bonus: 2,
      tag: "Cyclone + Requiem"
    },
    {
      champs: [
        "MonkeyKing",
        "Veigar"
      ],
      bonus: 2,
      tag: "Cyclone + Cage"
    },
    {
      champs: [
        "Brand",
        "MonkeyKing"
      ],
      bonus: 2,
      tag: "Cyclone + Pyroclasm"
    },
    {
      champs: [
        "Karthus",
        "Volibear"
      ],
      bonus: 2,
      tag: "Stun + Requiem"
    },
    {
      champs: [
        "Veigar",
        "Volibear"
      ],
      bonus: 2,
      tag: "Stun + Cage"
    },
    {
      champs: [
        "Aphelios",
        "Thresh"
      ],
      bonus: 3,
      tag: "Hook + Late Carry"
    },
    {
      champs: [
        "Ashe",
        "Seraphine"
      ],
      bonus: 3,
      tag: "Stun Chain Wombo"
    },
    {
      champs: [
        "MissFortune",
        "Rell"
      ],
      bonus: 3,
      tag: "Crash + Bullet Time"
    },
    {
      champs: [
        "Janna",
        "Sivir"
      ],
      bonus: 2,
      tag: "Spell Shield + Disengage"
    },
    {
      champs: [
        "Leona",
        "Vayne"
      ],
      bonus: 2,
      tag: "Sun + Crit Stun"
    },
    {
      champs: [
        "Leona",
        "Tristana"
      ],
      bonus: 2,
      tag: "Engage + Reset"
    },
    {
      champs: [
        "Jhin",
        "Leona"
      ],
      bonus: 2,
      tag: "Engage + Killshot"
    },
    {
      champs: [
        "Kaisa",
        "Leona"
      ],
      bonus: 2,
      tag: "Engage + Dive"
    },
    {
      champs: [
        "Aphelios",
        "Leona"
      ],
      bonus: 2,
      tag: "Engage + Late Carry"
    },
    {
      champs: [
        "Leona",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Sun + Bullet Time"
    },
    {
      champs: [
        "Ezreal",
        "Leona"
      ],
      bonus: 2,
      tag: "Sun + Skillshot"
    },
    {
      champs: [
        "Nautilus",
        "Vayne"
      ],
      bonus: 2,
      tag: "Root + Crit Stun"
    },
    {
      champs: [
        "Nautilus",
        "Tristana"
      ],
      bonus: 2,
      tag: "Hook + Reset"
    },
    {
      champs: [
        "Aphelios",
        "Nautilus"
      ],
      bonus: 2,
      tag: "Hook + Late Carry"
    },
    {
      champs: [
        "Ezreal",
        "Nautilus"
      ],
      bonus: 2,
      tag: "Hook + Skillshot"
    },
    {
      champs: [
        "Kaisa",
        "Nautilus"
      ],
      bonus: 2,
      tag: "Hook + Dive"
    },
    {
      champs: [
        "Jinx",
        "Nautilus"
      ],
      bonus: 2,
      tag: "Hook + Hyper-Carry"
    },
    {
      champs: [
        "Ashe",
        "Nautilus"
      ],
      bonus: 2,
      tag: "Hook + Slow Chain"
    },
    {
      champs: [
        "Alistar",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Pulverize + Dive"
    },
    {
      champs: [
        "Alistar",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Peel + Late Carry"
    },
    {
      champs: [
        "Alistar",
        "Twitch"
      ],
      bonus: 2,
      tag: "Engage + Stealth Spray"
    },
    {
      champs: [
        "Alistar",
        "Jinx"
      ],
      bonus: 2,
      tag: "Headbutt + Hyper"
    },
    {
      champs: [
        "Ezreal",
        "Thresh"
      ],
      bonus: 2,
      tag: "Lantern + Skillshot"
    },
    {
      champs: [
        "Kaisa",
        "Thresh"
      ],
      bonus: 2,
      tag: "Hook + R Reset"
    },
    {
      champs: [
        "Ashe",
        "Thresh"
      ],
      bonus: 2,
      tag: "Slow + Hook Chain"
    },
    {
      champs: [
        "Blitzcrank",
        "Ezreal"
      ],
      bonus: 2,
      tag: "Hook + Skillshot"
    },
    {
      champs: [
        "Blitzcrank",
        "Senna"
      ],
      bonus: 2,
      tag: "Hook + Global Stun"
    },
    {
      champs: [
        "Ashe",
        "Blitzcrank"
      ],
      bonus: 2,
      tag: "Hook + Crystal Arrow"
    },
    {
      champs: [
        "Aphelios",
        "Pyke"
      ],
      bonus: 2,
      tag: "Hook + Late Carry"
    },
    {
      champs: [
        "Pyke",
        "Senna"
      ],
      bonus: 2,
      tag: "Hook + Global"
    },
    {
      champs: [
        "Kaisa",
        "Pyke"
      ],
      bonus: 2,
      tag: "Hook + Dive"
    },
    {
      champs: [
        "Caitlyn",
        "Lux"
      ],
      bonus: 2,
      tag: "Root + Trap"
    },
    {
      champs: [
        "Jhin",
        "Lux"
      ],
      bonus: 2,
      tag: "Root + Killshot"
    },
    {
      champs: [
        "Ashe",
        "Lux"
      ],
      bonus: 2,
      tag: "Double Lockdown"
    },
    {
      champs: [
        "Caitlyn",
        "Xerath"
      ],
      bonus: 2,
      tag: "Siege Poke"
    },
    {
      champs: [
        "Ashe",
        "Xerath"
      ],
      bonus: 2,
      tag: "Long Range Poke"
    },
    {
      champs: [
        "Jhin",
        "Xerath"
      ],
      bonus: 2,
      tag: "Long Range Snipes"
    },
    {
      champs: [
        "Brand",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Burn + Range"
    },
    {
      champs: [
        "Ashe",
        "Brand"
      ],
      bonus: 2,
      tag: "Slow + Triple Proc"
    },
    {
      champs: [
        "Brand",
        "Jhin"
      ],
      bonus: 2,
      tag: "Burn + Crit"
    },
    {
      champs: [
        "Caitlyn",
        "Heimerdinger"
      ],
      bonus: 2,
      tag: "Turret Siege"
    },
    {
      champs: [
        "Heimerdinger",
        "Jhin"
      ],
      bonus: 2,
      tag: "Turret + Crit"
    },
    {
      champs: [
        "Ezreal",
        "Nami"
      ],
      bonus: 2,
      tag: "Tidecaller's Q"
    },
    {
      champs: [
        "Nami",
        "Twitch"
      ],
      bonus: 2,
      tag: "Tidecaller's Spray"
    },
    {
      champs: [
        "Nami",
        "Vayne"
      ],
      bonus: 2,
      tag: "Tidecaller's Crit"
    },
    {
      champs: [
        "Jinx",
        "Nami"
      ],
      bonus: 2,
      tag: "Slow + Hyper"
    },
    {
      champs: [
        "Aphelios",
        "Nami"
      ],
      bonus: 2,
      tag: "Tidecaller's Late"
    },
    {
      champs: [
        "Renata",
        "Twitch"
      ],
      bonus: 2,
      tag: "Berserk + Spray"
    },
    {
      champs: [
        "Jinx",
        "Renata"
      ],
      bonus: 2,
      tag: "Berserk + Hyper"
    },
    {
      champs: [
        "KogMaw",
        "Renata"
      ],
      bonus: 2,
      tag: "Berserk + Late Carry"
    },
    {
      champs: [
        "Caitlyn",
        "Milio"
      ],
      bonus: 2,
      tag: "Cleanse + Range"
    },
    {
      champs: [
        "Jhin",
        "Milio"
      ],
      bonus: 2,
      tag: "Cleanse + Crit"
    },
    {
      champs: [
        "Caitlyn",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Attached Siege"
    },
    {
      champs: [
        "Aphelios",
        "Karma"
      ],
      bonus: 2,
      tag: "Mantra + Late Carry"
    },
    {
      champs: [
        "Hecarim",
        "Lissandra"
      ],
      bonus: 2,
      tag: "Charge + Frozen Tomb"
    },
    {
      champs: [
        "Anivia",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Charge + Glacial Storm"
    },
    {
      champs: [
        "Hecarim",
        "Veigar"
      ],
      bonus: 2,
      tag: "Charge + Cage"
    },
    {
      champs: [
        "Mel",
        "Vi"
      ],
      bonus: 2,
      tag: "Vault + Sphere"
    },
    {
      champs: [
        "Anivia",
        "Vi"
      ],
      bonus: 2,
      tag: "Vault + Wall Trap"
    },
    {
      champs: [
        "Cassiopeia",
        "Vi"
      ],
      bonus: 2,
      tag: "Vault + R AOE Stun"
    },
    {
      champs: [
        "Lissandra",
        "Vi"
      ],
      bonus: 2,
      tag: "Vault + Frozen Tomb"
    },
    {
      champs: [
        "LeeSin",
        "Lux"
      ],
      bonus: 2,
      tag: "Kick + Finales"
    },
    {
      champs: [
        "Cassiopeia",
        "LeeSin"
      ],
      bonus: 2,
      tag: "Kick + R AOE Stun"
    },
    {
      champs: [
        "Galio",
        "LeeSin"
      ],
      bonus: 2,
      tag: "Kick + Idol Durand"
    },
    {
      champs: [
        "Karthus",
        "LeeSin"
      ],
      bonus: 2,
      tag: "Kick + Requiem"
    },
    {
      champs: [
        "LeeSin",
        "Lissandra"
      ],
      bonus: 2,
      tag: "Kick + Frozen Tomb"
    },
    {
      champs: [
        "Anivia",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Glacial + Storm"
    },
    {
      champs: [
        "Sejuani",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Slow + Beam"
    },
    {
      champs: [
        "Sejuani",
        "Xerath"
      ],
      bonus: 2,
      tag: "Slow + Snipes"
    },
    {
      champs: [
        "Cassiopeia",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Slow + R AOE Stun"
    },
    {
      champs: [
        "JarvanIV",
        "Lux"
      ],
      bonus: 2,
      tag: "Cataclysm + Finales"
    },
    {
      champs: [
        "JarvanIV",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Cataclysm + Beam"
    },
    {
      champs: [
        "Cassiopeia",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Cataclysm + R Stun"
    },
    {
      champs: [
        "JarvanIV",
        "Xerath"
      ],
      bonus: 2,
      tag: "Cataclysm + Snipes"
    },
    {
      champs: [
        "Anivia",
        "Maokai"
      ],
      bonus: 2,
      tag: "Root + Glacial Storm"
    },
    {
      champs: [
        "Lux",
        "Maokai"
      ],
      bonus: 2,
      tag: "Root + Finales"
    },
    {
      champs: [
        "Diana",
        "Lux"
      ],
      bonus: 2,
      tag: "Moonfall + Finales"
    },
    {
      champs: [
        "Lillia",
        "Lux"
      ],
      bonus: 2,
      tag: "Sleep + Finales"
    },
    {
      champs: [
        "Lux",
        "MonkeyKing"
      ],
      bonus: 2,
      tag: "Cyclone + Finales"
    },
    {
      champs: [
        "Briar",
        "Karthus"
      ],
      bonus: 2,
      tag: "Fear + Requiem"
    },
    {
      champs: [
        "Briar",
        "Veigar"
      ],
      bonus: 2,
      tag: "Fear + Cage"
    },
    {
      champs: [
        "Briar",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Fear \u2192 Last Breath"
    },
    {
      champs: [
        "Karthus",
        "Skarner"
      ],
      bonus: 2,
      tag: "Drag + Requiem"
    },
    {
      champs: [
        "Lissandra",
        "Skarner"
      ],
      bonus: 2,
      tag: "Drag + Frozen Tomb"
    },
    {
      champs: [
        "Ahri",
        "Khazix"
      ],
      bonus: 2,
      tag: "Charm + Isolate"
    },
    {
      champs: [
        "Khazix",
        "Veigar"
      ],
      bonus: 2,
      tag: "Cage + Isolate"
    },
    {
      champs: [
        "Galio",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Multi-engage"
    },
    {
      champs: [
        "Galio",
        "Vi"
      ],
      bonus: 2,
      tag: "Multi-engage"
    },
    {
      champs: [
        "Galio",
        "Veigar"
      ],
      bonus: 2,
      tag: "Engage + Cage"
    },
    {
      champs: [
        "Brand",
        "Galio"
      ],
      bonus: 2,
      tag: "Engage + Pyroclasm"
    },
    {
      champs: [
        "Galio",
        "Karthus"
      ],
      bonus: 2,
      tag: "Engage + Requiem"
    },
    {
      champs: [
        "Cassiopeia",
        "Karthus"
      ],
      bonus: 2,
      tag: "R Stun + Requiem"
    },
    {
      champs: [
        "Cassiopeia",
        "Veigar"
      ],
      bonus: 2,
      tag: "R Stun + Cage"
    },
    {
      champs: [
        "Cassiopeia",
        "Yasuo"
      ],
      bonus: 2,
      tag: "R Stun + Wombo"
    },
    {
      champs: [
        "Karthus",
        "Yone"
      ],
      bonus: 2,
      tag: "Wombo + Requiem"
    },
    {
      champs: [
        "Veigar",
        "Yone"
      ],
      bonus: 2,
      tag: "Wombo + Cage"
    },
    {
      champs: [
        "Aurora",
        "Sett"
      ],
      bonus: 2,
      tag: "Engage + Brawl"
    },
    {
      champs: [
        "Aurora",
        "Ambessa"
      ],
      bonus: 2,
      tag: "Mid + Top Dive"
    },
    {
      champs: [
        "Aurora",
        "Briar"
      ],
      bonus: 2,
      tag: "AOE + Bloodthirst"
    },
    {
      champs: [
        "Aurora",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Cataclysm + AOE"
    },
    {
      champs: [
        "Aurora",
        "Vi"
      ],
      bonus: 2,
      tag: "Vault + Knockback"
    },
    {
      champs: [
        "Smolder",
        "Lulu"
      ],
      bonus: 3,
      tag: "Late Carry + Peel"
    },
    {
      champs: [
        "Smolder",
        "Janna"
      ],
      bonus: 2,
      tag: "Disengage + Late Carry"
    },
    {
      champs: [
        "Smolder",
        "Soraka"
      ],
      bonus: 2,
      tag: "Heal + Late Carry"
    },
    {
      champs: [
        "Smolder",
        "Milio"
      ],
      bonus: 2,
      tag: "Cleanse + Late Carry"
    },
    {
      champs: [
        "Smolder",
        "TahmKench"
      ],
      bonus: 2,
      tag: "Devour + Stacking Carry"
    },
    {
      champs: [
        "Smolder",
        "Yuumi"
      ],
      bonus: 3,
      tag: "Attached Stacking Carry"
    },
    {
      champs: [
        "Mel",
        "Malphite"
      ],
      bonus: 2,
      tag: "Reflect + Wombo"
    },
    {
      champs: [
        "Mel",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Reflect + Cataclysm"
    },
    {
      champs: [
        "Mel",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Reflect + Glacial"
    },
    {
      champs: [
        "Mel",
        "Amumu"
      ],
      bonus: 2,
      tag: "Reflect + Bandage"
    },
    {
      champs: [
        "Ambessa",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Dash \u2192 Last Breath"
    },
    {
      champs: [
        "Ambessa",
        "Ahri"
      ],
      bonus: 2,
      tag: "Charm + Dive"
    },
    {
      champs: [
        "Ambessa",
        "Karthus"
      ],
      bonus: 2,
      tag: "Dive + Requiem"
    },
    {
      champs: [
        "Ambessa",
        "Orianna"
      ],
      bonus: 2,
      tag: "Dive + Shockwave"
    },
    {
      champs: [
        "Briar",
        "Lulu"
      ],
      bonus: 2,
      tag: "Bloodthirst + Polymorph"
    },
    {
      champs: [
        "Briar",
        "Janna"
      ],
      bonus: 2,
      tag: "Speed Up + Berserker"
    },
    {
      champs: [
        "Briar",
        "Galio"
      ],
      bonus: 2,
      tag: "Engage + Berserker"
    },
    {
      champs: [
        "Zaahen",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Darkin \u2192 Last Breath"
    },
    {
      champs: [
        "Zaahen",
        "Karthus"
      ],
      bonus: 2,
      tag: "Dive + Requiem"
    },
    {
      champs: [
        "Zaahen",
        "Orianna"
      ],
      bonus: 2,
      tag: "Dive + Shockwave"
    },
    {
      champs: [
        "Zaahen",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Cataclysm + Skirmish"
    },
    {
      champs: [
        "Zaahen",
        "Lulu"
      ],
      bonus: 2,
      tag: "Polymorph + Sustain Brawl"
    },
    {
      champs: [
        "Zaahen",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Glacial + Skirmish"
    },
    {
      champs: [
        "Zaahen",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Attached Bruiser"
    },
    {
      champs: [
        "Hwei",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Multi-CC + Wombo"
    },
    {
      champs: [
        "Hwei",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Multi-CC + Cataclysm"
    },
    {
      champs: [
        "Hwei",
        "Karthus"
      ],
      bonus: 2,
      tag: "Multi-CC + Requiem"
    },
    {
      champs: [
        "Naafiri",
        "Talon"
      ],
      bonus: 2,
      tag: "Pack Roam + Assassin"
    },
    {
      champs: [
        "Naafiri",
        "Vi"
      ],
      bonus: 2,
      tag: "Pack + Vault"
    },
    {
      champs: [
        "Naafiri",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Pack + Wombo"
    },
    {
      champs: [
        "KSante",
        "Karthus"
      ],
      bonus: 2,
      tag: "All Out + Requiem"
    },
    {
      champs: [
        "KSante",
        "Lillia"
      ],
      bonus: 2,
      tag: "All Out + Sleep"
    },
    {
      champs: [
        "KSante",
        "Veigar"
      ],
      bonus: 2,
      tag: "Knockback + Cage"
    },
    {
      champs: [
        "Rell",
        "Karthus"
      ],
      bonus: 2,
      tag: "Crash + Requiem"
    },
    {
      champs: [
        "Rell",
        "Veigar"
      ],
      bonus: 2,
      tag: "Crash + Cage"
    },
    {
      champs: [
        "Rell",
        "Orianna"
      ],
      bonus: 2,
      tag: "Crash + Shockwave"
    },
    {
      champs: [
        "Rell",
        "Brand"
      ],
      bonus: 2,
      tag: "Crash + Pyroclasm"
    },
    {
      champs: [
        "Zac",
        "Karthus"
      ],
      bonus: 2,
      tag: "Slingshot + Requiem"
    },
    {
      champs: [
        "Zac",
        "Veigar"
      ],
      bonus: 2,
      tag: "Slingshot + Cage"
    },
    {
      champs: [
        "Zac",
        "Orianna"
      ],
      bonus: 2,
      tag: "Slingshot + Shockwave"
    },
    {
      champs: [
        "Zac",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Slingshot + Bullet Time"
    },
    {
      champs: [
        "Morgana",
        "Twitch"
      ],
      bonus: 2,
      tag: "Root + Stealth Spray"
    },
    {
      champs: [
        "Morgana",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Root + Late Carry"
    },
    {
      champs: [
        "Morgana",
        "Jhin"
      ],
      bonus: 2,
      tag: "Root + Killshot"
    },
    {
      champs: [
        "Morgana",
        "Kalista"
      ],
      bonus: 2,
      tag: "Root + Bond"
    },
    {
      champs: [
        "Pantheon",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Stun + Trap"
    },
    {
      champs: [
        "Fiora",
        "Trundle"
      ],
      bonus: 2,
      tag: "Top + JG Duel"
    },
    {
      champs: [
        "Jax",
        "Tryndamere"
      ],
      bonus: 2,
      tag: "Late-game Splitpush"
    },
    {
      champs: [
        "Pantheon",
        "Shen"
      ],
      bonus: 3,
      tag: "Double Global TP"
    },
    {
      champs: [
        "Galio",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Global Engage Pair"
    },
    {
      champs: [
        "Karthus",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Global Pair"
    },
    {
      champs: [
        "Shen",
        "TwistedFate"
      ],
      bonus: 2,
      tag: "Double Global"
    },
    {
      champs: [
        "Sejuani",
        "Maokai"
      ],
      bonus: 2,
      tag: "Slow + Roots Chain"
    },
    {
      champs: [
        "Lissandra",
        "Veigar"
      ],
      bonus: 2,
      tag: "Tomb + Cage"
    },
    {
      champs: [
        "Leona",
        "Lissandra"
      ],
      bonus: 2,
      tag: "Sun + Tomb"
    },
    {
      champs: [
        "Amumu",
        "Veigar"
      ],
      bonus: 2,
      tag: "Bandage + Cage"
    },
    {
      champs: [
        "Kayle",
        "Senna"
      ],
      bonus: 2,
      tag: "Late + Late Scaling"
    },
    {
      champs: [
        "KogMaw",
        "Karma"
      ],
      bonus: 2,
      tag: "Mantra + Late Carry"
    },
    {
      champs: [
        "Veigar",
        "Senna"
      ],
      bonus: 2,
      tag: "Stacking Pair"
    },
    {
      champs: [
        "Smolder",
        "Kayle"
      ],
      bonus: 2,
      tag: "Hyper Scaling Duo"
    },
    {
      champs: [
        "AurelionSol",
        "Kayle"
      ],
      bonus: 2,
      tag: "Hyper Scaling Duo"
    },
    {
      champs: [
        "Diana",
        "Vi"
      ],
      bonus: 2,
      tag: "Pull + Vault Combo"
    },
    {
      champs: [
        "Sylas",
        "Vi"
      ],
      bonus: 2,
      tag: "Steal + Vault"
    },
    {
      champs: [
        "Sylas",
        "Karthus"
      ],
      bonus: 2,
      tag: "Steal + Requiem"
    },
    {
      champs: [
        "Talon",
        "Khazix"
      ],
      bonus: 2,
      tag: "Double Roam Burst"
    },
    {
      champs: [
        "Talon",
        "Diana"
      ],
      bonus: 2,
      tag: "Roam + Pull"
    },
    {
      champs: [
        "Zed",
        "Khazix"
      ],
      bonus: 2,
      tag: "Mid + JG Assassins"
    },
    {
      champs: [
        "Riven",
        "LeeSin"
      ],
      bonus: 2,
      tag: "Top + JG Skirmish"
    },
    {
      champs: [
        "Aatrox",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Top + JG Charge"
    },
    {
      champs: [
        "Sett",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Top + JG Engage"
    },
    {
      champs: [
        "Mordekaiser",
        "Maokai"
      ],
      bonus: 2,
      tag: "Death Realm + Roots"
    },
    {
      champs: [
        "Caitlyn",
        "Vi"
      ],
      bonus: 2,
      tag: "ADC + JG Lockdown"
    },
    {
      champs: [
        "Jhin",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Crit + Slow"
    },
    {
      champs: [
        "Vayne",
        "Karthus"
      ],
      bonus: 2,
      tag: "Hyper + Global"
    },
    {
      champs: [
        "Janna",
        "Lulu"
      ],
      bonus: 2,
      tag: "Double Disengage"
    },
    {
      champs: [
        "Lulu",
        "Sivir"
      ],
      bonus: 2,
      tag: "Polymorph + Spell Shield"
    },
    {
      champs: [
        "Karma",
        "Sivir"
      ],
      bonus: 2,
      tag: "Mantra + Spell Shield"
    },
    {
      champs: [
        "Maokai",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "Sejuani",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "Amumu",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "Alistar",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "Rell",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "Galio",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "Hecarim",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "JarvanIV",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "Diana",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "Zac",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "KSante",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "Skarner",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "Lillia",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "Nautilus",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "Pantheon",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "Volibear",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "Lissandra",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Engage to Last Breath"
    },
    {
      champs: [
        "Lissandra",
        "Yone"
      ],
      bonus: 2,
      tag: "Engage + Twin Breath"
    },
    {
      champs: [
        "Maokai",
        "Brand"
      ],
      bonus: 2,
      tag: "Engage + Pyroclasm"
    },
    {
      champs: [
        "Maokai",
        "Orianna"
      ],
      bonus: 2,
      tag: "Engage + Shockwave"
    },
    {
      champs: [
        "Maokai",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "Maokai",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Engage + Bullet Time"
    },
    {
      champs: [
        "Maokai",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "Maokai",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Maokai",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "Maokai",
        "Mel"
      ],
      bonus: 2,
      tag: "Engage + Reflection"
    },
    {
      champs: [
        "Sejuani",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "Sejuani",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Engage + Bullet Time"
    },
    {
      champs: [
        "Sejuani",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "Sejuani",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Sejuani",
        "Lux"
      ],
      bonus: 2,
      tag: "Engage + Final Spark"
    },
    {
      champs: [
        "Amumu",
        "Brand"
      ],
      bonus: 2,
      tag: "Engage + Pyroclasm"
    },
    {
      champs: [
        "Amumu",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "Amumu",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "Amumu",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Amumu",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "Amumu",
        "Lux"
      ],
      bonus: 2,
      tag: "Engage + Final Spark"
    },
    {
      champs: [
        "Alistar",
        "Karthus"
      ],
      bonus: 2,
      tag: "Engage + Requiem"
    },
    {
      champs: [
        "Alistar",
        "Veigar"
      ],
      bonus: 2,
      tag: "Engage + Cage"
    },
    {
      champs: [
        "Alistar",
        "Brand"
      ],
      bonus: 2,
      tag: "Engage + Pyroclasm"
    },
    {
      champs: [
        "Alistar",
        "Orianna"
      ],
      bonus: 2,
      tag: "Engage + Shockwave"
    },
    {
      champs: [
        "Alistar",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "Alistar",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Engage + Bullet Time"
    },
    {
      champs: [
        "Alistar",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "Alistar",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Alistar",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "Alistar",
        "Lux"
      ],
      bonus: 2,
      tag: "Engage + Final Spark"
    },
    {
      champs: [
        "Alistar",
        "Mel"
      ],
      bonus: 2,
      tag: "Engage + Reflection"
    },
    {
      champs: [
        "Rell",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "Rell",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "Rell",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Rell",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "Rell",
        "Lux"
      ],
      bonus: 2,
      tag: "Engage + Final Spark"
    },
    {
      champs: [
        "Rell",
        "Mel"
      ],
      bonus: 2,
      tag: "Engage + Reflection"
    },
    {
      champs: [
        "Galio",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "Galio",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Engage + Bullet Time"
    },
    {
      champs: [
        "Galio",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "Galio",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Galio",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "Galio",
        "Lux"
      ],
      bonus: 2,
      tag: "Engage + Final Spark"
    },
    {
      champs: [
        "Galio",
        "Mel"
      ],
      bonus: 2,
      tag: "Engage + Reflection"
    },
    {
      champs: [
        "Hecarim",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "Hecarim",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Engage + Bullet Time"
    },
    {
      champs: [
        "Hecarim",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "Hecarim",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Hecarim",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "Hecarim",
        "Lux"
      ],
      bonus: 2,
      tag: "Engage + Final Spark"
    },
    {
      champs: [
        "Hecarim",
        "Mel"
      ],
      bonus: 2,
      tag: "Engage + Reflection"
    },
    {
      champs: [
        "JarvanIV",
        "Karthus"
      ],
      bonus: 2,
      tag: "Engage + Requiem"
    },
    {
      champs: [
        "JarvanIV",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "JarvanIV",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Engage + Bullet Time"
    },
    {
      champs: [
        "Diana",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "Diana",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Engage + Bullet Time"
    },
    {
      champs: [
        "Diana",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "Diana",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Diana",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "Diana",
        "Mel"
      ],
      bonus: 2,
      tag: "Engage + Reflection"
    },
    {
      champs: [
        "Zac",
        "Brand"
      ],
      bonus: 2,
      tag: "Engage + Pyroclasm"
    },
    {
      champs: [
        "Zac",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "Zac",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "Zac",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Zac",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "Zac",
        "Lux"
      ],
      bonus: 2,
      tag: "Engage + Final Spark"
    },
    {
      champs: [
        "Zac",
        "Mel"
      ],
      bonus: 2,
      tag: "Engage + Reflection"
    },
    {
      champs: [
        "KSante",
        "Brand"
      ],
      bonus: 2,
      tag: "Engage + Pyroclasm"
    },
    {
      champs: [
        "KSante",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "KSante",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Engage + Bullet Time"
    },
    {
      champs: [
        "KSante",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "KSante",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "KSante",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "KSante",
        "Lux"
      ],
      bonus: 2,
      tag: "Engage + Final Spark"
    },
    {
      champs: [
        "KSante",
        "Mel"
      ],
      bonus: 2,
      tag: "Engage + Reflection"
    },
    {
      champs: [
        "Skarner",
        "Brand"
      ],
      bonus: 2,
      tag: "Engage + Pyroclasm"
    },
    {
      champs: [
        "Skarner",
        "Orianna"
      ],
      bonus: 2,
      tag: "Engage + Shockwave"
    },
    {
      champs: [
        "Skarner",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "Skarner",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Engage + Bullet Time"
    },
    {
      champs: [
        "Skarner",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "Skarner",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Skarner",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "Skarner",
        "Lux"
      ],
      bonus: 2,
      tag: "Engage + Final Spark"
    },
    {
      champs: [
        "Skarner",
        "Mel"
      ],
      bonus: 2,
      tag: "Engage + Reflection"
    },
    {
      champs: [
        "Lillia",
        "Orianna"
      ],
      bonus: 2,
      tag: "Engage + Shockwave"
    },
    {
      champs: [
        "Lillia",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "Lillia",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Engage + Bullet Time"
    },
    {
      champs: [
        "Lillia",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "Lillia",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Lillia",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "Lillia",
        "Mel"
      ],
      bonus: 2,
      tag: "Engage + Reflection"
    },
    {
      champs: [
        "Nautilus",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "Nautilus",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "Nautilus",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Nautilus",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "Nautilus",
        "Lux"
      ],
      bonus: 2,
      tag: "Engage + Final Spark"
    },
    {
      champs: [
        "Nautilus",
        "Mel"
      ],
      bonus: 2,
      tag: "Engage + Reflection"
    },
    {
      champs: [
        "Pantheon",
        "Veigar"
      ],
      bonus: 2,
      tag: "Engage + Cage"
    },
    {
      champs: [
        "Pantheon",
        "Brand"
      ],
      bonus: 2,
      tag: "Engage + Pyroclasm"
    },
    {
      champs: [
        "Pantheon",
        "Orianna"
      ],
      bonus: 2,
      tag: "Engage + Shockwave"
    },
    {
      champs: [
        "Pantheon",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "Pantheon",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Engage + Bullet Time"
    },
    {
      champs: [
        "Pantheon",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "Pantheon",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Pantheon",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "Pantheon",
        "Lux"
      ],
      bonus: 2,
      tag: "Engage + Final Spark"
    },
    {
      champs: [
        "Pantheon",
        "Mel"
      ],
      bonus: 2,
      tag: "Engage + Reflection"
    },
    {
      champs: [
        "Vi",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "Vi",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Engage + Bullet Time"
    },
    {
      champs: [
        "Vi",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Vi",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "Vi",
        "Lux"
      ],
      bonus: 2,
      tag: "Engage + Final Spark"
    },
    {
      champs: [
        "Volibear",
        "Brand"
      ],
      bonus: 2,
      tag: "Engage + Pyroclasm"
    },
    {
      champs: [
        "Volibear",
        "Orianna"
      ],
      bonus: 2,
      tag: "Engage + Shockwave"
    },
    {
      champs: [
        "Volibear",
        "AurelionSol"
      ],
      bonus: 2,
      tag: "Engage + Singularity"
    },
    {
      champs: [
        "Volibear",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Engage + Bullet Time"
    },
    {
      champs: [
        "Volibear",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "Volibear",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Volibear",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "Volibear",
        "Lux"
      ],
      bonus: 2,
      tag: "Engage + Final Spark"
    },
    {
      champs: [
        "Volibear",
        "Mel"
      ],
      bonus: 2,
      tag: "Engage + Reflection"
    },
    {
      champs: [
        "Lissandra",
        "Karthus"
      ],
      bonus: 2,
      tag: "Engage + Requiem"
    },
    {
      champs: [
        "Lissandra",
        "Brand"
      ],
      bonus: 2,
      tag: "Engage + Pyroclasm"
    },
    {
      champs: [
        "Lissandra",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Engage + Bullet Time"
    },
    {
      champs: [
        "Lissandra",
        "Aurora"
      ],
      bonus: 2,
      tag: "Engage + Cosmic Beyond"
    },
    {
      champs: [
        "Lissandra",
        "Hwei"
      ],
      bonus: 2,
      tag: "Engage + Spiraling Despair"
    },
    {
      champs: [
        "Lissandra",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Engage + Lifeform Disintegration"
    },
    {
      champs: [
        "Lissandra",
        "Lux"
      ],
      bonus: 2,
      tag: "Engage + Final Spark"
    },
    {
      champs: [
        "Lissandra",
        "Mel"
      ],
      bonus: 2,
      tag: "Engage + Reflection"
    },
    {
      champs: [
        "Blitzcrank",
        "Lux"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Blitzcrank",
        "Annie"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Blitzcrank",
        "Akali"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Blitzcrank",
        "Zed"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Blitzcrank",
        "Talon"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Blitzcrank",
        "Diana"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Blitzcrank",
        "Karthus"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Blitzcrank",
        "Syndra"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Blitzcrank",
        "Mel"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Pyke",
        "Veigar"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Pyke",
        "Lux"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Pyke",
        "Annie"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Pyke",
        "Akali"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Pyke",
        "Zed"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Pyke",
        "Talon"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Pyke",
        "Diana"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Pyke",
        "Karthus"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Pyke",
        "Syndra"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Pyke",
        "Mel"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Thresh",
        "Veigar"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Thresh",
        "Brand"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Thresh",
        "Lux"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Thresh",
        "Annie"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Thresh",
        "Akali"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Thresh",
        "Zed"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Thresh",
        "Talon"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Thresh",
        "Diana"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Thresh",
        "Karthus"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Thresh",
        "Syndra"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Thresh",
        "Mel"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Nautilus",
        "Annie"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Nautilus",
        "Akali"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Nautilus",
        "Zed"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Nautilus",
        "Talon"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Nautilus",
        "Diana"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Nautilus",
        "Syndra"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Morgana",
        "Veigar"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Morgana",
        "Annie"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Morgana",
        "Akali"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Morgana",
        "Zed"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Morgana",
        "Talon"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Morgana",
        "Diana"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Morgana",
        "Syndra"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Morgana",
        "Mel"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Lissandra",
        "Annie"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Lissandra",
        "Akali"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Lissandra",
        "Talon"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Lissandra",
        "Diana"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Ahri",
        "Veigar"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Ahri",
        "Brand"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Ahri",
        "Lux"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Ahri",
        "Annie"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Ahri",
        "Akali"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Ahri",
        "Karthus"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Ahri",
        "Mel"
      ],
      bonus: 2,
      tag: "Hook setup + Burst"
    },
    {
      champs: [
        "Vayne",
        "Sona"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Vayne",
        "Seraphine"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Aphelios",
        "Lulu"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Aphelios",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Aphelios",
        "Renata"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Aphelios",
        "Sona"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Aphelios",
        "Seraphine"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Jinx",
        "Janna"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Jinx",
        "Soraka"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Jinx",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Jinx",
        "Milio"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Jinx",
        "Karma"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Jinx",
        "Sona"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Jinx",
        "Seraphine"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Twitch",
        "Janna"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Twitch",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Twitch",
        "Karma"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Twitch",
        "Sona"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Twitch",
        "Seraphine"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "KogMaw",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "KogMaw",
        "Sona"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "KogMaw",
        "Nami"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "KogMaw",
        "Seraphine"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Smolder",
        "Renata"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Smolder",
        "Karma"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Smolder",
        "Sona"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Smolder",
        "Nami"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Smolder",
        "Seraphine"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kaisa",
        "Lulu"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kaisa",
        "Janna"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kaisa",
        "Soraka"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kaisa",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kaisa",
        "Milio"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kaisa",
        "Renata"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kaisa",
        "Karma"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kaisa",
        "Sona"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kaisa",
        "Nami"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kaisa",
        "Seraphine"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kalista",
        "Lulu"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kalista",
        "Janna"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kalista",
        "Soraka"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kalista",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kalista",
        "Milio"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kalista",
        "Renata"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kalista",
        "Karma"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kalista",
        "Sona"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kalista",
        "Nami"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Kalista",
        "Seraphine"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Tristana",
        "Lulu"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Tristana",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Tristana",
        "Milio"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Tristana",
        "Renata"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Tristana",
        "Karma"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Tristana",
        "Sona"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Tristana",
        "Nami"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Tristana",
        "Seraphine"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Yunara",
        "Lulu"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Yunara",
        "Janna"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Yunara",
        "Soraka"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Yunara",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Yunara",
        "Milio"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Yunara",
        "Renata"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Yunara",
        "Karma"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Yunara",
        "Sona"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Yunara",
        "Nami"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Yunara",
        "Seraphine"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Caitlyn",
        "Soraka"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Caitlyn",
        "Renata"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Caitlyn",
        "Nami"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Caitlyn",
        "Seraphine"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Fiora",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Fiora",
        "Shen"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Fiora",
        "Karthus"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Camille",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Camille",
        "Shen"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Camille",
        "Karthus"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Tryndamere",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Tryndamere",
        "Shen"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Tryndamere",
        "Karthus"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Jax",
        "TwistedFate"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Jax",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Jax",
        "Shen"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Jax",
        "Karthus"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Trundle",
        "TwistedFate"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Trundle",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Trundle",
        "Shen"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Trundle",
        "Karthus"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Yorick",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Yorick",
        "Shen"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Yorick",
        "Karthus"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Singed",
        "TwistedFate"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Singed",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Singed",
        "Shen"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Singed",
        "Karthus"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Nasus",
        "TwistedFate"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Nasus",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Nasus",
        "Shen"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Nasus",
        "Karthus"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Gangplank",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Gangplank",
        "Shen"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Gangplank",
        "Karthus"
      ],
      bonus: 2,
      tag: "Splitpush + Global"
    },
    {
      champs: [
        "Talon",
        "Rengar"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Talon",
        "Kayn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Talon",
        "Nidalee"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Talon",
        "Evelynn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Talon",
        "Shaco"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Talon",
        "Graves"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Talon",
        "Viego"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Talon",
        "RekSai"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Akali",
        "Khazix"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Akali",
        "Rengar"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Akali",
        "Kayn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Akali",
        "Nidalee"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Akali",
        "Evelynn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Akali",
        "Shaco"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Akali",
        "Graves"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Akali",
        "Viego"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Akali",
        "RekSai"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Diana",
        "Khazix"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Diana",
        "Rengar"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Diana",
        "Kayn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Diana",
        "Nidalee"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Diana",
        "Evelynn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Diana",
        "Shaco"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Diana",
        "Graves"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Diana",
        "Viego"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Diana",
        "RekSai"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Zed",
        "Rengar"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Zed",
        "Kayn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Zed",
        "Nidalee"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Zed",
        "Evelynn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Zed",
        "Shaco"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Zed",
        "Graves"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Zed",
        "Viego"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Zed",
        "RekSai"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Fizz",
        "Khazix"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Fizz",
        "Rengar"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Fizz",
        "Kayn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Fizz",
        "Nidalee"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Fizz",
        "Evelynn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Fizz",
        "Shaco"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Fizz",
        "Graves"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Fizz",
        "Viego"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Fizz",
        "RekSai"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Naafiri",
        "Khazix"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Naafiri",
        "Rengar"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Naafiri",
        "Kayn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Naafiri",
        "Nidalee"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Naafiri",
        "Evelynn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Naafiri",
        "Shaco"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Naafiri",
        "Graves"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Naafiri",
        "Viego"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Naafiri",
        "RekSai"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Sylas",
        "Khazix"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Sylas",
        "Rengar"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Sylas",
        "Kayn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Sylas",
        "Nidalee"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Sylas",
        "Evelynn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Sylas",
        "Shaco"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Sylas",
        "Graves"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Sylas",
        "Viego"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Sylas",
        "RekSai"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Katarina",
        "Khazix"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Katarina",
        "Rengar"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Katarina",
        "Kayn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Katarina",
        "Nidalee"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Katarina",
        "Evelynn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Katarina",
        "Shaco"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Katarina",
        "Graves"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Katarina",
        "Viego"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Katarina",
        "RekSai"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Qiyana",
        "Khazix"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Qiyana",
        "Rengar"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Qiyana",
        "Kayn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Qiyana",
        "Nidalee"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Qiyana",
        "Evelynn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Qiyana",
        "Shaco"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Qiyana",
        "Graves"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Qiyana",
        "Viego"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Qiyana",
        "RekSai"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ekko",
        "Khazix"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ekko",
        "Rengar"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ekko",
        "Kayn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ekko",
        "Nidalee"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ekko",
        "Evelynn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ekko",
        "Shaco"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ekko",
        "Graves"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ekko",
        "Viego"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ekko",
        "RekSai"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ahri",
        "Rengar"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ahri",
        "Kayn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ahri",
        "Nidalee"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ahri",
        "Evelynn"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ahri",
        "Shaco"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ahri",
        "Graves"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ahri",
        "Viego"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Ahri",
        "RekSai"
      ],
      bonus: 2,
      tag: "Mid + JG Roam"
    },
    {
      champs: [
        "Kayle",
        "Milio"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Kayle",
        "TahmKench"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Kayle",
        "Nami"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Senna",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Senna",
        "Milio"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Senna",
        "TahmKench"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Senna",
        "Nami"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Aphelios",
        "TahmKench"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Ryze",
        "Soraka"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Ryze",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Ryze",
        "Milio"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Ryze",
        "TahmKench"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Ryze",
        "Nami"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Vladimir",
        "Soraka"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Vladimir",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Vladimir",
        "Milio"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Vladimir",
        "TahmKench"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Vladimir",
        "Nami"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Jinx",
        "TahmKench"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "AurelionSol",
        "Soraka"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "AurelionSol",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "AurelionSol",
        "Milio"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "AurelionSol",
        "TahmKench"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "AurelionSol",
        "Nami"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Yunara",
        "TahmKench"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Veigar",
        "Soraka"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Veigar",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Veigar",
        "Milio"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Veigar",
        "TahmKench"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Veigar",
        "Nami"
      ],
      bonus: 2,
      tag: "Sustain + Late Scaling"
    },
    {
      champs: [
        "Maokai",
        "Vayne"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Maokai",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Maokai",
        "Jinx"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Maokai",
        "Twitch"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Maokai",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Maokai",
        "Smolder"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Maokai",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Maokai",
        "Kalista"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Maokai",
        "Tristana"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Maokai",
        "Yunara"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Maokai",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sejuani",
        "Vayne"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sejuani",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sejuani",
        "Jinx"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sejuani",
        "Twitch"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sejuani",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sejuani",
        "Smolder"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sejuani",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sejuani",
        "Kalista"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sejuani",
        "Tristana"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sejuani",
        "Yunara"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sejuani",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Amumu",
        "Vayne"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Amumu",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Amumu",
        "Jinx"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Amumu",
        "Twitch"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Amumu",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Amumu",
        "Smolder"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Amumu",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Amumu",
        "Kalista"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Amumu",
        "Tristana"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Amumu",
        "Yunara"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Amumu",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sion",
        "Vayne"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sion",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sion",
        "Jinx"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sion",
        "Twitch"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sion",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sion",
        "Smolder"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sion",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sion",
        "Kalista"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sion",
        "Tristana"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sion",
        "Yunara"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Sion",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Ornn",
        "Vayne"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Ornn",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Ornn",
        "Jinx"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Ornn",
        "Twitch"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Ornn",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Ornn",
        "Smolder"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Ornn",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Ornn",
        "Kalista"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Ornn",
        "Tristana"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Ornn",
        "Yunara"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Ornn",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Chogath",
        "Vayne"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Chogath",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Chogath",
        "Jinx"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Chogath",
        "Twitch"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Chogath",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Chogath",
        "Smolder"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Chogath",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Chogath",
        "Kalista"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Chogath",
        "Tristana"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Chogath",
        "Yunara"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Chogath",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "DrMundo",
        "Vayne"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "DrMundo",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "DrMundo",
        "Jinx"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "DrMundo",
        "Twitch"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "DrMundo",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "DrMundo",
        "Smolder"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "DrMundo",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "DrMundo",
        "Kalista"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "DrMundo",
        "Tristana"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "DrMundo",
        "Yunara"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "DrMundo",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Rammus",
        "Vayne"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Rammus",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Rammus",
        "Jinx"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Rammus",
        "Twitch"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Rammus",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Rammus",
        "Smolder"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Rammus",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Rammus",
        "Kalista"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Rammus",
        "Tristana"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Rammus",
        "Yunara"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Rammus",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Zac",
        "Vayne"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Zac",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Zac",
        "Jinx"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Zac",
        "Twitch"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Zac",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Zac",
        "Smolder"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Zac",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Zac",
        "Kalista"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Zac",
        "Tristana"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Zac",
        "Yunara"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Zac",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "KSante",
        "Vayne"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "KSante",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "KSante",
        "Jinx"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "KSante",
        "Twitch"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "KSante",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "KSante",
        "Smolder"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "KSante",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "KSante",
        "Kalista"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "KSante",
        "Tristana"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "KSante",
        "Yunara"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "KSante",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Malphite",
        "Vayne"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Malphite",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Malphite",
        "Jinx"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Malphite",
        "Twitch"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Malphite",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Malphite",
        "Smolder"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Malphite",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Malphite",
        "Kalista"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Malphite",
        "Tristana"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Malphite",
        "Yunara"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Malphite",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Shen",
        "Vayne"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Shen",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Shen",
        "Jinx"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Shen",
        "Twitch"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Shen",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Shen",
        "Smolder"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Shen",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Shen",
        "Kalista"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Shen",
        "Tristana"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Shen",
        "Yunara"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Shen",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Volibear",
        "Vayne"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Volibear",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Volibear",
        "Jinx"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Volibear",
        "Twitch"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Volibear",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Volibear",
        "Smolder"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Volibear",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Volibear",
        "Kalista"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Volibear",
        "Tristana"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Volibear",
        "Yunara"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Volibear",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "TahmKench",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "TahmKench",
        "Kalista"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "TahmKench",
        "Tristana"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "TahmKench",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Galio",
        "Vayne"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Galio",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Galio",
        "Jinx"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Galio",
        "Twitch"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Galio",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Galio",
        "Smolder"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Galio",
        "Kaisa"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Galio",
        "Kalista"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Galio",
        "Tristana"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Galio",
        "Yunara"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Galio",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Frontline + Hyper-Carry"
    },
    {
      champs: [
        "Caitlyn",
        "Jayce"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Caitlyn",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Caitlyn",
        "Ezreal"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Caitlyn",
        "Ziggs"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Caitlyn",
        "Corki"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Caitlyn",
        "Varus"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Xerath",
        "Jayce"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Xerath",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Xerath",
        "Heimerdinger"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Xerath",
        "Lux"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Xerath",
        "Karma"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Xerath",
        "Brand"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Xerath",
        "Ezreal"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Xerath",
        "Smolder"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Xerath",
        "Ziggs"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Xerath",
        "Corki"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Xerath",
        "Varus"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Jayce",
        "Velkoz"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Jayce",
        "Heimerdinger"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Jayce",
        "Lux"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Jayce",
        "Karma"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Jayce",
        "Brand"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Jayce",
        "Ezreal"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Jayce",
        "Smolder"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Jayce",
        "Ziggs"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Jayce",
        "Corki"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Jayce",
        "Varus"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Velkoz",
        "Heimerdinger"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Velkoz",
        "Lux"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Velkoz",
        "Karma"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Velkoz",
        "Brand"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Velkoz",
        "Ezreal"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Velkoz",
        "Smolder"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Velkoz",
        "Ziggs"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Velkoz",
        "Corki"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Velkoz",
        "Varus"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Heimerdinger",
        "Lux"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Heimerdinger",
        "Karma"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Heimerdinger",
        "Brand"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Heimerdinger",
        "Ezreal"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Heimerdinger",
        "Smolder"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Heimerdinger",
        "Ziggs"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Heimerdinger",
        "Corki"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Heimerdinger",
        "Varus"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Lux",
        "Karma"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Lux",
        "Brand"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Lux",
        "Ezreal"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Lux",
        "Smolder"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Lux",
        "Ziggs"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Lux",
        "Corki"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Lux",
        "Varus"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Karma",
        "Brand"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Karma",
        "Ziggs"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Karma",
        "Corki"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Karma",
        "Varus"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Brand",
        "Ezreal"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Brand",
        "Smolder"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Brand",
        "Ziggs"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Brand",
        "Corki"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Brand",
        "Varus"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Ezreal",
        "Smolder"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Ezreal",
        "Ziggs"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Ezreal",
        "Corki"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Ezreal",
        "Varus"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Smolder",
        "Ziggs"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Smolder",
        "Corki"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Smolder",
        "Varus"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Ziggs",
        "Corki"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Ziggs",
        "Varus"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Corki",
        "Varus"
      ],
      bonus: 2,
      tag: "Poke / Siege Pair"
    },
    {
      champs: [
        "Fiddlesticks",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Fear setup + Drain"
    },
    {
      champs: [
        "Fiddlesticks",
        "Veigar"
      ],
      bonus: 2,
      tag: "Fear setup + Drain"
    },
    {
      champs: [
        "Fiddlesticks",
        "Karthus"
      ],
      bonus: 2,
      tag: "Fear setup + Drain"
    },
    {
      champs: [
        "Fiddlesticks",
        "Orianna"
      ],
      bonus: 2,
      tag: "Fear setup + Drain"
    },
    {
      champs: [
        "Fiddlesticks",
        "Maokai"
      ],
      bonus: 2,
      tag: "Fear setup + Drain"
    },
    {
      champs: [
        "Fiddlesticks",
        "Lulu"
      ],
      bonus: 2,
      tag: "Fear setup + Drain"
    },
    {
      champs: [
        "Fiddlesticks",
        "Janna"
      ],
      bonus: 2,
      tag: "Fear setup + Drain"
    },
    {
      champs: [
        "Nocturne",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Paranoia + Pick"
    },
    {
      champs: [
        "Nocturne",
        "Talon"
      ],
      bonus: 2,
      tag: "Paranoia + Pick"
    },
    {
      champs: [
        "Nocturne",
        "Khazix"
      ],
      bonus: 2,
      tag: "Paranoia + Pick"
    },
    {
      champs: [
        "Nocturne",
        "Karthus"
      ],
      bonus: 2,
      tag: "Paranoia + Pick"
    },
    {
      champs: [
        "Nocturne",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Paranoia + Pick"
    },
    {
      champs: [
        "Elise",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Early Tempo Pair"
    },
    {
      champs: [
        "Elise",
        "Talon"
      ],
      bonus: 2,
      tag: "Early Tempo Pair"
    },
    {
      champs: [
        "Elise",
        "Lucian"
      ],
      bonus: 2,
      tag: "Early Tempo Pair"
    },
    {
      champs: [
        "Elise",
        "Draven"
      ],
      bonus: 2,
      tag: "Early Tempo Pair"
    },
    {
      champs: [
        "Elise",
        "Renekton"
      ],
      bonus: 2,
      tag: "Early Tempo Pair"
    },
    {
      champs: [
        "Evelynn",
        "Karthus"
      ],
      bonus: 2,
      tag: "Stealth Pick + Burst"
    },
    {
      champs: [
        "Evelynn",
        "Veigar"
      ],
      bonus: 2,
      tag: "Stealth Pick + Burst"
    },
    {
      champs: [
        "Evelynn",
        "Orianna"
      ],
      bonus: 2,
      tag: "Stealth Pick + Burst"
    },
    {
      champs: [
        "Evelynn",
        "Lulu"
      ],
      bonus: 2,
      tag: "Stealth Pick + Burst"
    },
    {
      champs: [
        "Evelynn",
        "Sett"
      ],
      bonus: 2,
      tag: "Stealth Pick + Burst"
    },
    {
      champs: [
        "Gragas",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Body Slam + Wombo"
    },
    {
      champs: [
        "Gragas",
        "Veigar"
      ],
      bonus: 2,
      tag: "Body Slam + Wombo"
    },
    {
      champs: [
        "Gragas",
        "Karthus"
      ],
      bonus: 2,
      tag: "Body Slam + Wombo"
    },
    {
      champs: [
        "Gragas",
        "Orianna"
      ],
      bonus: 2,
      tag: "Body Slam + Wombo"
    },
    {
      champs: [
        "Gragas",
        "MissFortune"
      ],
      bonus: 2,
      tag: "Body Slam + Wombo"
    },
    {
      champs: [
        "Gnar",
        "Yasuo"
      ],
      bonus: 2,
      tag: "GNAR! + Wombo"
    },
    {
      champs: [
        "Gnar",
        "Karthus"
      ],
      bonus: 2,
      tag: "GNAR! + Wombo"
    },
    {
      champs: [
        "Gnar",
        "Veigar"
      ],
      bonus: 2,
      tag: "GNAR! + Wombo"
    },
    {
      champs: [
        "Gnar",
        "Orianna"
      ],
      bonus: 2,
      tag: "GNAR! + Wombo"
    },
    {
      champs: [
        "Gwen",
        "Karthus"
      ],
      bonus: 2,
      tag: "Skirmish + Peel"
    },
    {
      champs: [
        "Gwen",
        "Lulu"
      ],
      bonus: 2,
      tag: "Skirmish + Peel"
    },
    {
      champs: [
        "Gwen",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Skirmish + Peel"
    },
    {
      champs: [
        "Gwen",
        "Janna"
      ],
      bonus: 2,
      tag: "Skirmish + Peel"
    },
    {
      champs: [
        "Gwen",
        "Soraka"
      ],
      bonus: 2,
      tag: "Skirmish + Peel"
    },
    {
      champs: [
        "Illaoi",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Test of Spirit Setup"
    },
    {
      champs: [
        "Illaoi",
        "Orianna"
      ],
      bonus: 2,
      tag: "Test of Spirit Setup"
    },
    {
      champs: [
        "Illaoi",
        "Maokai"
      ],
      bonus: 2,
      tag: "Test of Spirit Setup"
    },
    {
      champs: [
        "Illaoi",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Test of Spirit Setup"
    },
    {
      champs: [
        "Illaoi",
        "Lulu"
      ],
      bonus: 2,
      tag: "Test of Spirit Setup"
    },
    {
      champs: [
        "Irelia",
        "Karthus"
      ],
      bonus: 2,
      tag: "Reset Skirmish + Buff"
    },
    {
      champs: [
        "Irelia",
        "Lulu"
      ],
      bonus: 2,
      tag: "Reset Skirmish + Buff"
    },
    {
      champs: [
        "Irelia",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Reset Skirmish + Buff"
    },
    {
      champs: [
        "Irelia",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Reset Skirmish + Buff"
    },
    {
      champs: [
        "Irelia",
        "Orianna"
      ],
      bonus: 2,
      tag: "Reset Skirmish + Buff"
    },
    {
      champs: [
        "Ivern",
        "Vayne"
      ],
      bonus: 2,
      tag: "Daisy + Hyper-Carry"
    },
    {
      champs: [
        "Ivern",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Daisy + Hyper-Carry"
    },
    {
      champs: [
        "Ivern",
        "Jinx"
      ],
      bonus: 2,
      tag: "Daisy + Hyper-Carry"
    },
    {
      champs: [
        "Ivern",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Daisy + Hyper-Carry"
    },
    {
      champs: [
        "Ivern",
        "Smolder"
      ],
      bonus: 2,
      tag: "Daisy + Hyper-Carry"
    },
    {
      champs: [
        "Ivern",
        "Twitch"
      ],
      bonus: 2,
      tag: "Daisy + Hyper-Carry"
    },
    {
      champs: [
        "Kassadin",
        "Lulu"
      ],
      bonus: 2,
      tag: "Late-game Blink Carry"
    },
    {
      champs: [
        "Kassadin",
        "Janna"
      ],
      bonus: 2,
      tag: "Late-game Blink Carry"
    },
    {
      champs: [
        "Kassadin",
        "Soraka"
      ],
      bonus: 2,
      tag: "Late-game Blink Carry"
    },
    {
      champs: [
        "Kassadin",
        "Maokai"
      ],
      bonus: 2,
      tag: "Late-game Blink Carry"
    },
    {
      champs: [
        "Kassadin",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Late-game Blink Carry"
    },
    {
      champs: [
        "Kindred",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Lamb's Respite Wombo"
    },
    {
      champs: [
        "Kindred",
        "Karthus"
      ],
      bonus: 2,
      tag: "Lamb's Respite Wombo"
    },
    {
      champs: [
        "Kindred",
        "Orianna"
      ],
      bonus: 2,
      tag: "Lamb's Respite Wombo"
    },
    {
      champs: [
        "Kindred",
        "Lulu"
      ],
      bonus: 2,
      tag: "Lamb's Respite Wombo"
    },
    {
      champs: [
        "Kled",
        "Karthus"
      ],
      bonus: 2,
      tag: "Mount Charge + Setup"
    },
    {
      champs: [
        "Kled",
        "Orianna"
      ],
      bonus: 2,
      tag: "Mount Charge + Setup"
    },
    {
      champs: [
        "Kled",
        "Lulu"
      ],
      bonus: 2,
      tag: "Mount Charge + Setup"
    },
    {
      champs: [
        "Kled",
        "Janna"
      ],
      bonus: 2,
      tag: "Mount Charge + Setup"
    },
    {
      champs: [
        "Kled",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Mount Charge + Setup"
    },
    {
      champs: [
        "Malzahar",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Suppression + Burst"
    },
    {
      champs: [
        "Malzahar",
        "Karthus"
      ],
      bonus: 2,
      tag: "Suppression + Burst"
    },
    {
      champs: [
        "Malzahar",
        "Veigar"
      ],
      bonus: 2,
      tag: "Suppression + Burst"
    },
    {
      champs: [
        "Malzahar",
        "Lulu"
      ],
      bonus: 2,
      tag: "Suppression + Burst"
    },
    {
      champs: [
        "MasterYi",
        "Lulu"
      ],
      bonus: 2,
      tag: "Untouchable Splitpush"
    },
    {
      champs: [
        "MasterYi",
        "Soraka"
      ],
      bonus: 2,
      tag: "Untouchable Splitpush"
    },
    {
      champs: [
        "MasterYi",
        "Janna"
      ],
      bonus: 2,
      tag: "Untouchable Splitpush"
    },
    {
      champs: [
        "MasterYi",
        "Karthus"
      ],
      bonus: 2,
      tag: "Untouchable Splitpush"
    },
    {
      champs: [
        "Neeko",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Pop Blossom Wombo"
    },
    {
      champs: [
        "Neeko",
        "Karthus"
      ],
      bonus: 2,
      tag: "Pop Blossom Wombo"
    },
    {
      champs: [
        "Neeko",
        "Veigar"
      ],
      bonus: 2,
      tag: "Pop Blossom Wombo"
    },
    {
      champs: [
        "Neeko",
        "Orianna"
      ],
      bonus: 2,
      tag: "Pop Blossom Wombo"
    },
    {
      champs: [
        "Neeko",
        "Maokai"
      ],
      bonus: 2,
      tag: "Pop Blossom Wombo"
    },
    {
      champs: [
        "Nidalee",
        "Karthus"
      ],
      bonus: 2,
      tag: "Hunter Pair"
    },
    {
      champs: [
        "Nilah",
        "Lulu"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Nilah",
        "Janna"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Nilah",
        "Soraka"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Nilah",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Nilah",
        "Milio"
      ],
      bonus: 2,
      tag: "Hyper-Carry + Peel"
    },
    {
      champs: [
        "Nunu",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Absolute Zero Wombo"
    },
    {
      champs: [
        "Nunu",
        "Karthus"
      ],
      bonus: 2,
      tag: "Absolute Zero Wombo"
    },
    {
      champs: [
        "Nunu",
        "Orianna"
      ],
      bonus: 2,
      tag: "Absolute Zero Wombo"
    },
    {
      champs: [
        "Nunu",
        "Lulu"
      ],
      bonus: 2,
      tag: "Absolute Zero Wombo"
    },
    {
      champs: [
        "Nunu",
        "Veigar"
      ],
      bonus: 2,
      tag: "Absolute Zero Wombo"
    },
    {
      champs: [
        "Poppy",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Verdict Wombo"
    },
    {
      champs: [
        "Poppy",
        "Veigar"
      ],
      bonus: 2,
      tag: "Verdict Wombo"
    },
    {
      champs: [
        "Poppy",
        "Karthus"
      ],
      bonus: 2,
      tag: "Verdict Wombo"
    },
    {
      champs: [
        "Poppy",
        "Orianna"
      ],
      bonus: 2,
      tag: "Verdict Wombo"
    },
    {
      champs: [
        "Qiyana",
        "Karthus"
      ],
      bonus: 2,
      tag: "Terrain Stun Combo"
    },
    {
      champs: [
        "Qiyana",
        "Veigar"
      ],
      bonus: 2,
      tag: "Terrain Stun Combo"
    },
    {
      champs: [
        "Qiyana",
        "Lulu"
      ],
      bonus: 2,
      tag: "Terrain Stun Combo"
    },
    {
      champs: [
        "Qiyana",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Terrain Stun Combo"
    },
    {
      champs: [
        "RekSai",
        "Karthus"
      ],
      bonus: 2,
      tag: "Burrow Pick"
    },
    {
      champs: [
        "RekSai",
        "Veigar"
      ],
      bonus: 2,
      tag: "Burrow Pick"
    },
    {
      champs: [
        "RekSai",
        "Lulu"
      ],
      bonus: 2,
      tag: "Burrow Pick"
    },
    {
      champs: [
        "RekSai",
        "Orianna"
      ],
      bonus: 2,
      tag: "Burrow Pick"
    },
    {
      champs: [
        "Ryze",
        "Lulu"
      ],
      bonus: 2,
      tag: "Late Mage Carry"
    },
    {
      champs: [
        "Ryze",
        "Janna"
      ],
      bonus: 2,
      tag: "Late Mage Carry"
    },
    {
      champs: [
        "Ryze",
        "Karthus"
      ],
      bonus: 2,
      tag: "Late Mage Carry"
    },
    {
      champs: [
        "Ryze",
        "Maokai"
      ],
      bonus: 2,
      tag: "Late Mage Carry"
    },
    {
      champs: [
        "Samira",
        "Lulu"
      ],
      bonus: 2,
      tag: "Style + Engage"
    },
    {
      champs: [
        "Samira",
        "Janna"
      ],
      bonus: 2,
      tag: "Style + Engage"
    },
    {
      champs: [
        "Samira",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Style + Engage"
    },
    {
      champs: [
        "Samira",
        "Soraka"
      ],
      bonus: 2,
      tag: "Style + Engage"
    },
    {
      champs: [
        "Samira",
        "Milio"
      ],
      bonus: 2,
      tag: "Style + Engage"
    },
    {
      champs: [
        "Samira",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Style + Engage"
    },
    {
      champs: [
        "Samira",
        "Leona"
      ],
      bonus: 2,
      tag: "Style + Engage"
    },
    {
      champs: [
        "Samira",
        "Nautilus"
      ],
      bonus: 2,
      tag: "Style + Engage"
    },
    {
      champs: [
        "Shyvana",
        "Lulu"
      ],
      bonus: 2,
      tag: "Dragon Form Wombo"
    },
    {
      champs: [
        "Shyvana",
        "Karthus"
      ],
      bonus: 2,
      tag: "Dragon Form Wombo"
    },
    {
      champs: [
        "Shyvana",
        "Janna"
      ],
      bonus: 2,
      tag: "Dragon Form Wombo"
    },
    {
      champs: [
        "Shyvana",
        "Orianna"
      ],
      bonus: 2,
      tag: "Dragon Form Wombo"
    },
    {
      champs: [
        "Sivir",
        "Yuumi"
      ],
      bonus: 2,
      tag: "On The Hunt + Peel"
    },
    {
      champs: [
        "Sivir",
        "Milio"
      ],
      bonus: 2,
      tag: "On The Hunt + Peel"
    },
    {
      champs: [
        "Sivir",
        "Nami"
      ],
      bonus: 2,
      tag: "On The Hunt + Peel"
    },
    {
      champs: [
        "Swain",
        "Lulu"
      ],
      bonus: 2,
      tag: "Drain Tank Setup"
    },
    {
      champs: [
        "Swain",
        "Janna"
      ],
      bonus: 2,
      tag: "Drain Tank Setup"
    },
    {
      champs: [
        "Swain",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Drain Tank Setup"
    },
    {
      champs: [
        "Swain",
        "Karthus"
      ],
      bonus: 2,
      tag: "Drain Tank Setup"
    },
    {
      champs: [
        "Taliyah",
        "Karthus"
      ],
      bonus: 2,
      tag: "Wall Trap + Wombo"
    },
    {
      champs: [
        "Taliyah",
        "Veigar"
      ],
      bonus: 2,
      tag: "Wall Trap + Wombo"
    },
    {
      champs: [
        "Taliyah",
        "Orianna"
      ],
      bonus: 2,
      tag: "Wall Trap + Wombo"
    },
    {
      champs: [
        "Taliyah",
        "Lulu"
      ],
      bonus: 2,
      tag: "Wall Trap + Wombo"
    },
    {
      champs: [
        "Taric",
        "Vayne"
      ],
      bonus: 2,
      tag: "Cosmic Radiance Hyper"
    },
    {
      champs: [
        "Taric",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Cosmic Radiance Hyper"
    },
    {
      champs: [
        "Taric",
        "Jinx"
      ],
      bonus: 2,
      tag: "Cosmic Radiance Hyper"
    },
    {
      champs: [
        "Taric",
        "Kayle"
      ],
      bonus: 2,
      tag: "Cosmic Radiance Hyper"
    },
    {
      champs: [
        "Taric",
        "MasterYi"
      ],
      bonus: 2,
      tag: "Cosmic Radiance Hyper"
    },
    {
      champs: [
        "Taric",
        "Twitch"
      ],
      bonus: 2,
      tag: "Cosmic Radiance Hyper"
    },
    {
      champs: [
        "Teemo",
        "Lulu"
      ],
      bonus: 2,
      tag: "Shroom Map + Peel"
    },
    {
      champs: [
        "Teemo",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Shroom Map + Peel"
    },
    {
      champs: [
        "Teemo",
        "Janna"
      ],
      bonus: 2,
      tag: "Shroom Map + Peel"
    },
    {
      champs: [
        "Teemo",
        "Karma"
      ],
      bonus: 2,
      tag: "Shroom Map + Peel"
    },
    {
      champs: [
        "Teemo",
        "Karthus"
      ],
      bonus: 2,
      tag: "Shroom Map + Peel"
    },
    {
      champs: [
        "Udyr",
        "Karthus"
      ],
      bonus: 2,
      tag: "Awakened Stun + Wombo"
    },
    {
      champs: [
        "Udyr",
        "Orianna"
      ],
      bonus: 2,
      tag: "Awakened Stun + Wombo"
    },
    {
      champs: [
        "Udyr",
        "Lulu"
      ],
      bonus: 2,
      tag: "Awakened Stun + Wombo"
    },
    {
      champs: [
        "Udyr",
        "Veigar"
      ],
      bonus: 2,
      tag: "Awakened Stun + Wombo"
    },
    {
      champs: [
        "Urgot",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Fear Pick + Wombo"
    },
    {
      champs: [
        "Urgot",
        "Karthus"
      ],
      bonus: 2,
      tag: "Fear Pick + Wombo"
    },
    {
      champs: [
        "Urgot",
        "Orianna"
      ],
      bonus: 2,
      tag: "Fear Pick + Wombo"
    },
    {
      champs: [
        "Urgot",
        "Lulu"
      ],
      bonus: 2,
      tag: "Fear Pick + Wombo"
    },
    {
      champs: [
        "Urgot",
        "Veigar"
      ],
      bonus: 2,
      tag: "Fear Pick + Wombo"
    },
    {
      champs: [
        "Vex",
        "Karthus"
      ],
      bonus: 2,
      tag: "Doom + Wombo"
    },
    {
      champs: [
        "Vex",
        "Veigar"
      ],
      bonus: 2,
      tag: "Doom + Wombo"
    },
    {
      champs: [
        "Vex",
        "Orianna"
      ],
      bonus: 2,
      tag: "Doom + Wombo"
    },
    {
      champs: [
        "Vex",
        "Lulu"
      ],
      bonus: 2,
      tag: "Doom + Wombo"
    },
    {
      champs: [
        "Viktor",
        "Lulu"
      ],
      bonus: 2,
      tag: "Chaos Storm Setup"
    },
    {
      champs: [
        "Viktor",
        "Janna"
      ],
      bonus: 2,
      tag: "Chaos Storm Setup"
    },
    {
      champs: [
        "Viktor",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Chaos Storm Setup"
    },
    {
      champs: [
        "Viktor",
        "Karthus"
      ],
      bonus: 2,
      tag: "Chaos Storm Setup"
    },
    {
      champs: [
        "Viktor",
        "Maokai"
      ],
      bonus: 2,
      tag: "Chaos Storm Setup"
    },
    {
      champs: [
        "Warwick",
        "Karthus"
      ],
      bonus: 2,
      tag: "Infinite Duress Pair"
    },
    {
      champs: [
        "Warwick",
        "Lulu"
      ],
      bonus: 2,
      tag: "Infinite Duress Pair"
    },
    {
      champs: [
        "Warwick",
        "Orianna"
      ],
      bonus: 2,
      tag: "Infinite Duress Pair"
    },
    {
      champs: [
        "Xayah",
        "Janna"
      ],
      bonus: 2,
      tag: "Featherstorm + Peel"
    },
    {
      champs: [
        "Xayah",
        "Lulu"
      ],
      bonus: 2,
      tag: "Featherstorm + Peel"
    },
    {
      champs: [
        "Xayah",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Featherstorm + Peel"
    },
    {
      champs: [
        "Xayah",
        "Karma"
      ],
      bonus: 2,
      tag: "Featherstorm + Peel"
    },
    {
      champs: [
        "Xayah",
        "Milio"
      ],
      bonus: 2,
      tag: "Featherstorm + Peel"
    },
    {
      champs: [
        "Xayah",
        "Soraka"
      ],
      bonus: 2,
      tag: "Featherstorm + Peel"
    },
    {
      champs: [
        "Xayah",
        "Nami"
      ],
      bonus: 2,
      tag: "Featherstorm + Peel"
    },
    {
      champs: [
        "XinZhao",
        "Karthus"
      ],
      bonus: 2,
      tag: "Talon Knockup Combo"
    },
    {
      champs: [
        "XinZhao",
        "Veigar"
      ],
      bonus: 2,
      tag: "Talon Knockup Combo"
    },
    {
      champs: [
        "XinZhao",
        "Orianna"
      ],
      bonus: 2,
      tag: "Talon Knockup Combo"
    },
    {
      champs: [
        "XinZhao",
        "Lulu"
      ],
      bonus: 2,
      tag: "Talon Knockup Combo"
    },
    {
      champs: [
        "XinZhao",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Talon Knockup Combo"
    },
    {
      champs: [
        "Zeri",
        "Lulu"
      ],
      bonus: 2,
      tag: "Spark Surge + Peel"
    },
    {
      champs: [
        "Zeri",
        "Janna"
      ],
      bonus: 2,
      tag: "Spark Surge + Peel"
    },
    {
      champs: [
        "Zeri",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Spark Surge + Peel"
    },
    {
      champs: [
        "Zeri",
        "Soraka"
      ],
      bonus: 2,
      tag: "Spark Surge + Peel"
    },
    {
      champs: [
        "Zeri",
        "Milio"
      ],
      bonus: 2,
      tag: "Spark Surge + Peel"
    },
    {
      champs: [
        "Zeri",
        "Karma"
      ],
      bonus: 2,
      tag: "Spark Surge + Peel"
    },
    {
      champs: [
        "Zilean",
        "Vayne"
      ],
      bonus: 2,
      tag: "Chronoshift Late-Carry"
    },
    {
      champs: [
        "Zilean",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Chronoshift Late-Carry"
    },
    {
      champs: [
        "Zilean",
        "Jinx"
      ],
      bonus: 2,
      tag: "Chronoshift Late-Carry"
    },
    {
      champs: [
        "Zilean",
        "MasterYi"
      ],
      bonus: 2,
      tag: "Chronoshift Late-Carry"
    },
    {
      champs: [
        "Zilean",
        "KogMaw"
      ],
      bonus: 2,
      tag: "Chronoshift Late-Carry"
    },
    {
      champs: [
        "Zilean",
        "Twitch"
      ],
      bonus: 2,
      tag: "Chronoshift Late-Carry"
    },
    {
      champs: [
        "Zilean",
        "Smolder"
      ],
      bonus: 2,
      tag: "Chronoshift Late-Carry"
    },
    {
      champs: [
        "Zilean",
        "Yunara"
      ],
      bonus: 2,
      tag: "Chronoshift Late-Carry"
    },
    {
      champs: [
        "Zoe",
        "Karthus"
      ],
      bonus: 2,
      tag: "Sleep Pick + Burst"
    },
    {
      champs: [
        "Zoe",
        "Veigar"
      ],
      bonus: 2,
      tag: "Sleep Pick + Burst"
    },
    {
      champs: [
        "Zoe",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Sleep Pick + Burst"
    },
    {
      champs: [
        "Zoe",
        "Lulu"
      ],
      bonus: 2,
      tag: "Sleep Pick + Burst"
    },
    {
      champs: [
        "Zyra",
        "Vayne"
      ],
      bonus: 2,
      tag: "Root + AA Carry"
    },
    {
      champs: [
        "Zyra",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Root + AA Carry"
    },
    {
      champs: [
        "Zyra",
        "Jinx"
      ],
      bonus: 2,
      tag: "Root + AA Carry"
    },
    {
      champs: [
        "Zyra",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Root + AA Carry"
    },
    {
      champs: [
        "Zyra",
        "Smolder"
      ],
      bonus: 2,
      tag: "Root + AA Carry"
    },
    {
      champs: [
        "Zyra",
        "Twitch"
      ],
      bonus: 2,
      tag: "Root + AA Carry"
    },
    {
      champs: [
        "Bard",
        "Vayne"
      ],
      bonus: 2,
      tag: "Stasis Setup + AA"
    },
    {
      champs: [
        "Bard",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Stasis Setup + AA"
    },
    {
      champs: [
        "Bard",
        "Jinx"
      ],
      bonus: 2,
      tag: "Stasis Setup + AA"
    },
    {
      champs: [
        "Bard",
        "Smolder"
      ],
      bonus: 2,
      tag: "Stasis Setup + AA"
    },
    {
      champs: [
        "Bard",
        "Ezreal"
      ],
      bonus: 2,
      tag: "Stasis Setup + AA"
    },
    {
      champs: [
        "Braum",
        "Vayne"
      ],
      bonus: 2,
      tag: "Concussive Stun + AA"
    },
    {
      champs: [
        "Braum",
        "Aphelios"
      ],
      bonus: 2,
      tag: "Concussive Stun + AA"
    },
    {
      champs: [
        "Braum",
        "Jinx"
      ],
      bonus: 2,
      tag: "Concussive Stun + AA"
    },
    {
      champs: [
        "Braum",
        "Twitch"
      ],
      bonus: 2,
      tag: "Concussive Stun + AA"
    },
    {
      champs: [
        "Braum",
        "Caitlyn"
      ],
      bonus: 2,
      tag: "Concussive Stun + AA"
    },
    {
      champs: [
        "Braum",
        "Tristana"
      ],
      bonus: 2,
      tag: "Concussive Stun + AA"
    },
    {
      champs: [
        "Braum",
        "Smolder"
      ],
      bonus: 2,
      tag: "Concussive Stun + AA"
    },
    {
      champs: [
        "Braum",
        "Yunara"
      ],
      bonus: 2,
      tag: "Concussive Stun + AA"
    },
    {
      champs: [
        "Akshan",
        "Karthus"
      ],
      bonus: 2,
      tag: "Revive + Global"
    },
    {
      champs: [
        "Akshan",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Revive + Global"
    },
    {
      champs: [
        "Akshan",
        "TwistedFate"
      ],
      bonus: 2,
      tag: "Revive + Global"
    },
    {
      champs: [
        "Akshan",
        "Lulu"
      ],
      bonus: 2,
      tag: "Revive + Global"
    },
    {
      champs: [
        "Azir",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Shurima Wall + Wombo"
    },
    {
      champs: [
        "Azir",
        "Lulu"
      ],
      bonus: 2,
      tag: "Shurima Wall + Wombo"
    },
    {
      champs: [
        "Azir",
        "Janna"
      ],
      bonus: 2,
      tag: "Shurima Wall + Wombo"
    },
    {
      champs: [
        "Azir",
        "Maokai"
      ],
      bonus: 2,
      tag: "Shurima Wall + Wombo"
    },
    {
      champs: [
        "Azir",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Shurima Wall + Wombo"
    },
    {
      champs: [
        "Azir",
        "Karthus"
      ],
      bonus: 2,
      tag: "Shurima Wall + Wombo"
    },
    {
      champs: [
        "Belveth",
        "Lulu"
      ],
      bonus: 2,
      tag: "Hyper-Carry JG + Peel"
    },
    {
      champs: [
        "Belveth",
        "Janna"
      ],
      bonus: 2,
      tag: "Hyper-Carry JG + Peel"
    },
    {
      champs: [
        "Belveth",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Hyper-Carry JG + Peel"
    },
    {
      champs: [
        "Belveth",
        "Karthus"
      ],
      bonus: 2,
      tag: "Hyper-Carry JG + Peel"
    },
    {
      champs: [
        "Belveth",
        "Soraka"
      ],
      bonus: 2,
      tag: "Hyper-Carry JG + Peel"
    },
    {
      champs: [
        "Renekton",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Early Bully Pair"
    },
    {
      champs: [
        "Renekton",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Early Bully Pair"
    },
    {
      champs: [
        "Renekton",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Early Bully Pair"
    },
    {
      champs: [
        "Renekton",
        "TwistedFate"
      ],
      bonus: 2,
      tag: "Early Bully Pair"
    },
    {
      champs: [
        "Renekton",
        "Karthus"
      ],
      bonus: 2,
      tag: "Early Bully Pair"
    },
    {
      champs: [
        "Rumble",
        "Yasuo"
      ],
      bonus: 2,
      tag: "Equalizer Wombo"
    },
    {
      champs: [
        "Rumble",
        "Karthus"
      ],
      bonus: 2,
      tag: "Equalizer Wombo"
    },
    {
      champs: [
        "Rumble",
        "Orianna"
      ],
      bonus: 2,
      tag: "Equalizer Wombo"
    },
    {
      champs: [
        "Rumble",
        "Lulu"
      ],
      bonus: 2,
      tag: "Equalizer Wombo"
    },
    {
      champs: [
        "Rumble",
        "Maokai"
      ],
      bonus: 2,
      tag: "Equalizer Wombo"
    },
    {
      champs: [
        "Garen",
        "Karthus"
      ],
      bonus: 2,
      tag: "Spin + Wombo"
    },
    {
      champs: [
        "Garen",
        "Lulu"
      ],
      bonus: 2,
      tag: "Spin + Wombo"
    },
    {
      champs: [
        "Garen",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Spin + Wombo"
    },
    {
      champs: [
        "Mordekaiser",
        "Karthus"
      ],
      bonus: 2,
      tag: "Death Realm Pair"
    },
    {
      champs: [
        "Mordekaiser",
        "Lulu"
      ],
      bonus: 2,
      tag: "Death Realm Pair"
    },
    {
      champs: [
        "Mordekaiser",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Death Realm Pair"
    },
    {
      champs: [
        "Mordekaiser",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Death Realm Pair"
    },
    {
      champs: [
        "Mordekaiser",
        "Orianna"
      ],
      bonus: 2,
      tag: "Death Realm Pair"
    },
    {
      champs: [
        "Nasus",
        "Lulu"
      ],
      bonus: 2,
      tag: "Stack Late + Peel"
    },
    {
      champs: [
        "Nasus",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Stack Late + Peel"
    },
    {
      champs: [
        "Nasus",
        "Janna"
      ],
      bonus: 2,
      tag: "Stack Late + Peel"
    },
    {
      champs: [
        "Nasus",
        "Soraka"
      ],
      bonus: 2,
      tag: "Stack Late + Peel"
    },
    {
      champs: [
        "Olaf",
        "Karthus"
      ],
      bonus: 2,
      tag: "Ragnarok Charge"
    },
    {
      champs: [
        "Olaf",
        "Lulu"
      ],
      bonus: 2,
      tag: "Ragnarok Charge"
    },
    {
      champs: [
        "Olaf",
        "Orianna"
      ],
      bonus: 2,
      tag: "Ragnarok Charge"
    },
    {
      champs: [
        "Quinn",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Roam + Range"
    },
    {
      champs: [
        "Quinn",
        "Karthus"
      ],
      bonus: 2,
      tag: "Roam + Range"
    },
    {
      champs: [
        "Riven",
        "Karthus"
      ],
      bonus: 2,
      tag: "Q Reset + Peel"
    },
    {
      champs: [
        "Riven",
        "Lulu"
      ],
      bonus: 2,
      tag: "Q Reset + Peel"
    },
    {
      champs: [
        "Riven",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Q Reset + Peel"
    },
    {
      champs: [
        "Riven",
        "Janna"
      ],
      bonus: 2,
      tag: "Q Reset + Peel"
    },
    {
      champs: [
        "Riven",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Q Reset + Peel"
    },
    {
      champs: [
        "Sett",
        "Yasuo"
      ],
      bonus: 2,
      tag: "The Show Stopper Wombo"
    },
    {
      champs: [
        "Sett",
        "Karthus"
      ],
      bonus: 2,
      tag: "The Show Stopper Wombo"
    },
    {
      champs: [
        "Sett",
        "Orianna"
      ],
      bonus: 2,
      tag: "The Show Stopper Wombo"
    },
    {
      champs: [
        "Sett",
        "Lulu"
      ],
      bonus: 2,
      tag: "The Show Stopper Wombo"
    },
    {
      champs: [
        "Sett",
        "Sejuani"
      ],
      bonus: 2,
      tag: "The Show Stopper Wombo"
    },
    {
      champs: [
        "Yorick",
        "Lulu"
      ],
      bonus: 2,
      tag: "Maiden + Global"
    },
    {
      champs: [
        "Aatrox",
        "Lulu"
      ],
      bonus: 2,
      tag: "Drain + Setup"
    },
    {
      champs: [
        "Aatrox",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Drain + Setup"
    },
    {
      champs: [
        "Aatrox",
        "Janna"
      ],
      bonus: 2,
      tag: "Drain + Setup"
    },
    {
      champs: [
        "Aatrox",
        "Soraka"
      ],
      bonus: 2,
      tag: "Drain + Setup"
    },
    {
      champs: [
        "Aatrox",
        "Karthus"
      ],
      bonus: 2,
      tag: "Drain + Setup"
    },
    {
      champs: [
        "Aatrox",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Drain + Setup"
    },
    {
      champs: [
        "Darius",
        "Karthus"
      ],
      bonus: 2,
      tag: "Apprehend + Setup"
    },
    {
      champs: [
        "Darius",
        "Lulu"
      ],
      bonus: 2,
      tag: "Apprehend + Setup"
    },
    {
      champs: [
        "Darius",
        "Yuumi"
      ],
      bonus: 2,
      tag: "Apprehend + Setup"
    },
    {
      champs: [
        "Darius",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Apprehend + Setup"
    },
    {
      champs: [
        "Darius",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Apprehend + Setup"
    },
    {
      champs: [
        "Draven",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Early Bully Pair"
    },
    {
      champs: [
        "Draven",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Early Bully Pair"
    },
    {
      champs: [
        "Draven",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Early Bully Pair"
    },
    {
      champs: [
        "Draven",
        "Vi"
      ],
      bonus: 2,
      tag: "Early Bully Pair"
    },
    {
      champs: [
        "Draven",
        "Diana"
      ],
      bonus: 2,
      tag: "Early Bully Pair"
    },
    {
      champs: [
        "Draven",
        "Leona"
      ],
      bonus: 2,
      tag: "Early Bully Pair"
    },
    {
      champs: [
        "Draven",
        "Nautilus"
      ],
      bonus: 2,
      tag: "Early Bully Pair"
    },
    {
      champs: [
        "Draven",
        "Alistar"
      ],
      bonus: 2,
      tag: "Early Bully Pair"
    },
    {
      champs: [
        "Draven",
        "Thresh"
      ],
      bonus: 2,
      tag: "Early Bully Pair"
    },
    {
      champs: [
        "Leblanc",
        "Talon"
      ],
      bonus: 2,
      tag: "Coordinated Mid+JG Burst"
    },
    {
      champs: [
        "Leblanc",
        "Diana"
      ],
      bonus: 2,
      tag: "Coordinated Mid+JG Burst"
    },
    {
      champs: [
        "Leblanc",
        "Akali"
      ],
      bonus: 2,
      tag: "Coordinated Mid+JG Burst"
    },
    {
      champs: [
        "Akshan",
        "Sett"
      ],
      bonus: 2,
      tag: "Roam + Brawl"
    },
    {
      champs: [
        "Akshan",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Roam + Charge"
    },
    {
      champs: [
        "Akshan",
        "Vi"
      ],
      bonus: 2,
      tag: "Pick + Lockdown"
    },
    {
      champs: [
        "Akshan",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Roam + Engage"
    },
    {
      champs: [
        "Akshan",
        "Brand"
      ],
      bonus: 2,
      tag: "Pick + Burn"
    },
    {
      champs: [
        "Gangplank",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Cannon + Slow Field"
    },
    {
      champs: [
        "Gangplank",
        "Maokai"
      ],
      bonus: 2,
      tag: "Cannon + Roots"
    },
    {
      champs: [
        "Gangplank",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Cannon + Cataclysm"
    },
    {
      champs: [
        "Gangplank",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Cannon + Charge"
    },
    {
      champs: [
        "Garen",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Top + JG Engage"
    },
    {
      champs: [
        "Garen",
        "Vi"
      ],
      bonus: 2,
      tag: "Top + JG Lockdown"
    },
    {
      champs: [
        "Garen",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Top + JG Engage"
    },
    {
      champs: [
        "Olaf",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Top + JG Charge"
    },
    {
      champs: [
        "Olaf",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Top + JG Engage"
    },
    {
      champs: [
        "Olaf",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Bursts of Speed Pair"
    },
    {
      champs: [
        "Poppy",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Pin + Charge"
    },
    {
      champs: [
        "Poppy",
        "Sett"
      ],
      bonus: 2,
      tag: "Top Engage Pair"
    },
    {
      champs: [
        "Poppy",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Pin + Slow"
    },
    {
      champs: [
        "Poppy",
        "Vi"
      ],
      bonus: 2,
      tag: "Pin + Vault"
    },
    {
      champs: [
        "Quinn",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Top Roam + Engage"
    },
    {
      champs: [
        "Quinn",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Roam + Charge"
    },
    {
      champs: [
        "Quinn",
        "Vi"
      ],
      bonus: 2,
      tag: "Roam + Vault"
    },
    {
      champs: [
        "Quinn",
        "Brand"
      ],
      bonus: 2,
      tag: "Roam + Burn"
    },
    {
      champs: [
        "Shyvana",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Dragon Engage"
    },
    {
      champs: [
        "Shyvana",
        "Maokai"
      ],
      bonus: 2,
      tag: "Dragon Form + Roots"
    },
    {
      champs: [
        "Shyvana",
        "Sett"
      ],
      bonus: 2,
      tag: "Late Brawl Pair"
    },
    {
      champs: [
        "Shyvana",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Charge + Spear"
    },
    {
      champs: [
        "Swain",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Pull + Slow"
    },
    {
      champs: [
        "Swain",
        "Maokai"
      ],
      bonus: 2,
      tag: "Pull + Roots"
    },
    {
      champs: [
        "Swain",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Pull + Charge"
    },
    {
      champs: [
        "Swain",
        "Sett"
      ],
      bonus: 2,
      tag: "Drain Tank Pair"
    },
    {
      champs: [
        "Taliyah",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Roam + Wall"
    },
    {
      champs: [
        "Taliyah",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Wall + Slow"
    },
    {
      champs: [
        "Taliyah",
        "Maokai"
      ],
      bonus: 2,
      tag: "Wall + Roots"
    },
    {
      champs: [
        "Taliyah",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Wall + Charge"
    },
    {
      champs: [
        "Udyr",
        "Maokai"
      ],
      bonus: 2,
      tag: "Stun + Roots"
    },
    {
      champs: [
        "Udyr",
        "Sett"
      ],
      bonus: 2,
      tag: "JG + Top Brawl"
    },
    {
      champs: [
        "Udyr",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Engage + Spear"
    },
    {
      champs: [
        "Vex",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Fear + Charge"
    },
    {
      champs: [
        "Vex",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Fear + Cataclysm"
    },
    {
      champs: [
        "Vex",
        "Vi"
      ],
      bonus: 2,
      tag: "Fear + Vault"
    },
    {
      champs: [
        "Vex",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Fear + Engage"
    },
    {
      champs: [
        "Warwick",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Suppression + Slow"
    },
    {
      champs: [
        "Warwick",
        "Maokai"
      ],
      bonus: 2,
      tag: "Suppression + Roots"
    },
    {
      champs: [
        "Warwick",
        "Sett"
      ],
      bonus: 2,
      tag: "Bloodthirst + Brawl"
    },
    {
      champs: [
        "Warwick",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Suppression + Spear"
    },
    {
      champs: [
        "Zoe",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Sleep + Slow"
    },
    {
      champs: [
        "Zoe",
        "Maokai"
      ],
      bonus: 2,
      tag: "Sleep + Roots"
    },
    {
      champs: [
        "Zoe",
        "Hecarim"
      ],
      bonus: 2,
      tag: "Sleep + Charge"
    },
    {
      champs: [
        "Zoe",
        "Vi"
      ],
      bonus: 2,
      tag: "Sleep + Vault"
    },
    {
      champs: [
        "Zoe",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Sleep + Cataclysm"
    },
    {
      champs: [
        "Kindred",
        "Veigar"
      ],
      bonus: 2,
      tag: "Lamb's Respite + Cage zone"
    },
    {
      champs: [
        "Kindred",
        "Pantheon"
      ],
      bonus: 2,
      tag: "Global pair + Lamb's Respite"
    },
    {
      champs: [
        "Leblanc",
        "Maokai"
      ],
      bonus: 2,
      tag: "Root + Sigil chain"
    },
    {
      champs: [
        "Leblanc",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Cataclysm + Sigil chain"
    },
    {
      champs: [
        "Malzahar",
        "JarvanIV"
      ],
      bonus: 2,
      tag: "Cataclysm + Suppression"
    },
    {
      champs: [
        "Malzahar",
        "Sejuani"
      ],
      bonus: 2,
      tag: "Glacial + Suppression"
    }
  ];

  // lib/championMeta.ts
  var TIER_VALUE = {
    "S+": 6,
    S: 5,
    A: 4,
    B: 3,
    C: 2,
    D: 1
  };
  var TIER_ORDER = ["S+", "S", "A", "B", "C", "D"];
  var CHAMPION_META = championMeta_default;
  var _activeOverride = null;
  function getMetaTiers(alias) {
    if (_activeOverride) {
      const override = _activeOverride[alias];
      if (override !== void 0) return { ...override };
    }
    return CHAMPION_META[alias]?.metaTiers ?? {};
  }
  var VALID_TIERS = new Set(TIER_ORDER);
  var CHAMPION_SYNERGIES = championSynergies_default;
  var BASELINE_SYNERGY_LOOKUP = (() => {
    const map = /* @__PURE__ */ new Map();
    for (const s of CHAMPION_SYNERGIES) {
      const [a, b] = s.champs;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      map.set(key, s);
    }
    return map;
  })();

  // lib/players.ts
  var _playerSeq = 0;
  function makePlayerId(rng = Math.random) {
    _playerSeq = (_playerSeq + 1) % 1e6;
    return `p-${Math.floor(rng() * 1e9).toString(36)}-${_playerSeq.toString(36)}`;
  }
  var LANE_ORDER = [
    "top",
    "jungle",
    "middle",
    "bottom",
    "support"
  ];
  var PLAYER_TIER_VALUE = {
    "S+": 3,
    S: 2,
    A: 1,
    B: 0,
    C: -1,
    D: -2
  };
  var MAIN_POOL = 3;
  var MAX_POOL = 5;
  var SECONDARY_COMFORT = 0.5;
  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }
  function valueToTier(v) {
    const idx = clamp(Math.round(v), -2, 3) + 2;
    return ["D", "C", "B", "A", "S", "S+"][idx];
  }
  function deriveStar(roster) {
    if (!roster || roster.length === 0) return 3;
    const mean = roster.reduce((sum, p) => sum + PLAYER_TIER_VALUE[p.tier], 0) / roster.length;
    return normalizeTeamStars(3 + mean);
  }
  function playableInLane(champ, lane) {
    if (champ.lanes.includes(lane)) return true;
    return getMetaTiers(champ.alias)[lane] != null;
  }
  function shuffle(arr, rng) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  var MAIN_TIER_WEIGHT = {
    "S+": 6,
    S: 5,
    A: 4,
    B: 3,
    C: 2,
    D: 1
  };
  var POOL_SKILL_SKEW = {
    "S+": 2.2,
    S: 2,
    A: 1.5,
    B: 1,
    C: 0.7,
    D: 0.45
  };
  function randomizeChampPools(lane, champions, rng = Math.random, playerTier = "B") {
    const eligible = champions.filter((c) => playableInLane(c, lane));
    const goodCount = Math.min(MAX_POOL, eligible.length);
    const badCount = Math.min(MAX_POOL, eligible.length - goodCount);
    const skew = POOL_SKILL_SKEW[playerTier];
    const ranked = eligible.map((c) => {
      const tier = getMetaTiers(c.alias)[lane];
      const weight = Math.pow(tier ? MAIN_TIER_WEIGHT[tier] : 2, skew);
      const key = Math.pow(rng() || 1e-9, 1 / weight);
      return { id: c.id, key };
    }).sort((a, b) => b.key - a.key);
    const good = ranked.slice(0, goodCount).map((r) => r.id);
    const goodSet = new Set(good);
    const bad = shuffle(
      eligible.filter((c) => !goodSet.has(c.id)),
      rng
    ).slice(0, badCount).map((c) => c.id);
    return { goodChamps: good, badChamps: bad };
  }

  // lib/season/marketSnapshots.ts
  function captureMarketTeamSnapshots(before, after, ids, pools) {
    return [...new Set(ids)].flatMap((id) => {
      const old = before.find((team) => team.id === id);
      const next = after.find((team) => team.id === id);
      if (!old || !next) return [];
      return [{
        teamId: id,
        name: old.name,
        leagueId: old.leagueId,
        color: old.color,
        iconKey: old.iconKey,
        ...old.logoUrl ? { logoUrl: old.logoUrl } : {},
        ...pools ? {
          academyBefore: structuredClone(pools.before.filter((p) => p.status === "academy" && p.lastTeamId === id).map((p) => p.player)),
          academyAfter: structuredClone(pools.after.filter((p) => p.status === "academy" && p.lastTeamId === id).map((p) => p.player))
        } : {},
        before: structuredClone(old.players),
        after: structuredClone([...next.players])
      }];
    });
  }

  // lib/season/marketOrigin.ts
  function marketOrigin(season, window) {
    const label = window === "worlds" ? "Offseason" : window === "first-stand" ? "First Stand window" : window === "msi" ? "MSI window" : window;
    return { seasonId: season.id, year: season.franchise?.year ?? 1, windowId: `${season.id}:${label}` };
  }
  function belongsToMarketWindow(origin, season, window) {
    const expected = marketOrigin(season, window);
    return origin.seasonId === expected.seasonId && origin.year === expected.year && origin.windowId === expected.windowId;
  }

  // lib/data/abilities.json
  var abilities_default = {
    Aatrox: {
      alias: "Aatrox",
      hardCCDuration: 3,
      ultCooldown: 120,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Ahri: {
      alias: "Ahri",
      hardCCDuration: 0,
      ultCooldown: 130,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Akali: {
      alias: "Akali",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Akshan: {
      alias: "Akshan",
      hardCCDuration: 0,
      ultCooldown: 100,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Alistar: {
      alias: "Alistar",
      hardCCDuration: 1,
      ultCooldown: 120,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Ambessa: {
      alias: "Ambessa",
      hardCCDuration: 0.75,
      ultCooldown: 130,
      ultCastTime: 0.55,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    Amumu: {
      alias: "Amumu",
      hardCCDuration: 1.5,
      ultCooldown: 150,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Anivia: {
      alias: "Anivia",
      hardCCDuration: 0,
      ultCooldown: 4,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Annie: {
      alias: "Annie",
      hardCCDuration: 0,
      ultCooldown: 130,
      ultCastTime: 0.25,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Aphelios: {
      alias: "Aphelios",
      hardCCDuration: 1,
      ultCooldown: 120,
      ultCastTime: 0.6,
      hasResets: false,
      burstWindowSeconds: 8
    },
    Ashe: {
      alias: "Ashe",
      hardCCDuration: 0,
      ultCooldown: 100,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 8
    },
    AurelionSol: {
      alias: "AurelionSol",
      hardCCDuration: 1,
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Aurora: {
      alias: "Aurora",
      hardCCDuration: 0,
      ultCooldown: 140,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Azir: {
      alias: "Azir",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0.5,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Bard: {
      alias: "Bard",
      hardCCDuration: 0,
      ultCooldown: 110,
      ultCastTime: 0.5,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Belveth: {
      alias: "Belveth",
      hardCCDuration: 0.75,
      ultCooldown: 1,
      ultCastTime: 1,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Blitzcrank: {
      alias: "Blitzcrank",
      hardCCDuration: 1,
      ultCooldown: 60,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Brand: {
      alias: "Brand",
      hardCCDuration: 1.5,
      ultCooldown: 110,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Braum: {
      alias: "Braum",
      hardCCDuration: 0.6,
      ultCooldown: 120,
      ultCastTime: 0.5,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Briar: {
      alias: "Briar",
      hardCCDuration: 1.5,
      ultCooldown: 120,
      ultCastTime: 1,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Caitlyn: {
      alias: "Caitlyn",
      hardCCDuration: 1.5,
      ultCooldown: 90,
      ultCastTime: 0.375,
      hasResets: false,
      burstWindowSeconds: 8
    },
    Camille: {
      alias: "Camille",
      hardCCDuration: 0.75,
      ultCooldown: 140,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    Cassiopeia: {
      alias: "Cassiopeia",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0.5,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Chogath: {
      alias: "Chogath",
      hardCCDuration: 1,
      ultCooldown: 80,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Corki: {
      alias: "Corki",
      hardCCDuration: 0,
      ultCooldown: 2,
      ultCastTime: 0.175,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Darius: {
      alias: "Darius",
      hardCCDuration: 3,
      ultCooldown: 120,
      ultCastTime: 0.3667,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Diana: {
      alias: "Diana",
      hardCCDuration: 0,
      ultCooldown: 100,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    DrMundo: {
      alias: "DrMundo",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Draven: {
      alias: "Draven",
      hardCCDuration: 0,
      ultCooldown: 100,
      ultCastTime: 0.5,
      hasResets: true,
      burstWindowSeconds: 8
    },
    Ekko: {
      alias: "Ekko",
      hardCCDuration: 2.25,
      ultCooldown: 110,
      ultCastTime: 0.5,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Elise: {
      alias: "Elise",
      hardCCDuration: 0,
      ultCooldown: 3,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Evelynn: {
      alias: "Evelynn",
      hardCCDuration: 2,
      ultCooldown: 120,
      ultCastTime: 0.35,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Ezreal: {
      alias: "Ezreal",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 1,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Fiddlesticks: {
      alias: "Fiddlesticks",
      hardCCDuration: 1.25,
      ultCooldown: 140,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Fiora: {
      alias: "Fiora",
      hardCCDuration: 0,
      ultCooldown: 110,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    Fizz: {
      alias: "Fizz",
      hardCCDuration: 1,
      ultCooldown: 100,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    Galio: {
      alias: "Galio",
      hardCCDuration: 1.25,
      ultCooldown: 180,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Gangplank: {
      alias: "Gangplank",
      hardCCDuration: 0,
      ultCooldown: 170,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Garen: {
      alias: "Garen",
      hardCCDuration: 1.5,
      ultCooldown: 120,
      ultCastTime: 0.435,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Gnar: {
      alias: "Gnar",
      hardCCDuration: 1.25,
      ultCooldown: 90,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Gragas: {
      alias: "Gragas",
      hardCCDuration: 1,
      ultCooldown: 100,
      ultCastTime: 0.25,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Graves: {
      alias: "Graves",
      hardCCDuration: 0,
      ultCooldown: 100,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 8
    },
    Gwen: {
      alias: "Gwen",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0.25,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Hecarim: {
      alias: "Hecarim",
      hardCCDuration: 0.25,
      ultCooldown: 140,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Heimerdinger: {
      alias: "Heimerdinger",
      hardCCDuration: 1.5,
      ultCooldown: 100,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Hwei: {
      alias: "Hwei",
      hardCCDuration: 0,
      ultCooldown: 140,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Illaoi: {
      alias: "Illaoi",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0.5,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Irelia: {
      alias: "Irelia",
      hardCCDuration: 0.75,
      ultCooldown: 125,
      ultCastTime: 0.4,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Ivern: {
      alias: "Ivern",
      hardCCDuration: 0,
      ultCooldown: 140,
      ultCastTime: 0.5,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Janna: {
      alias: "Janna",
      hardCCDuration: 0.5,
      ultCooldown: 130,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    JarvanIV: {
      alias: "JarvanIV",
      hardCCDuration: 0.15,
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Jax: {
      alias: "Jax",
      hardCCDuration: 1,
      ultCooldown: 110,
      ultCastTime: 0.25,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Jayce: {
      alias: "Jayce",
      hardCCDuration: 0,
      ultCooldown: 6,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 8
    },
    Jhin: {
      alias: "Jhin",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 1,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Jinx: {
      alias: "Jinx",
      hardCCDuration: 1.5,
      ultCooldown: 85,
      ultCastTime: 0.6,
      hasResets: false,
      burstWindowSeconds: 8
    },
    KSante: {
      alias: "KSante",
      hardCCDuration: 0.8,
      ultCooldown: 120,
      ultCastTime: 0.4,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Kaisa: {
      alias: "Kaisa",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Kalista: {
      alias: "Kalista",
      hardCCDuration: 0,
      ultCooldown: 160,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 8
    },
    Karma: {
      alias: "Karma",
      hardCCDuration: 0,
      ultCooldown: 40,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Karthus: {
      alias: "Karthus",
      hardCCDuration: 0,
      ultCooldown: 200,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Kassadin: {
      alias: "Kassadin",
      hardCCDuration: 0,
      ultCooldown: 5,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Katarina: {
      alias: "Katarina",
      hardCCDuration: 0,
      ultCooldown: 75,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Kayle: {
      alias: "Kayle",
      hardCCDuration: 0,
      ultCooldown: 160,
      ultCastTime: 0.5,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Kayn: {
      alias: "Kayn",
      hardCCDuration: 1,
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Kennen: {
      alias: "Kennen",
      hardCCDuration: 1.25,
      ultCooldown: 120,
      ultCastTime: 0.25,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Khazix: {
      alias: "Khazix",
      hardCCDuration: 0,
      ultCooldown: 100,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Kindred: {
      alias: "Kindred",
      hardCCDuration: 0,
      ultCooldown: 180,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 8
    },
    Kled: {
      alias: "Kled",
      hardCCDuration: 0,
      ultCooldown: 140,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 4
    },
    KogMaw: {
      alias: "KogMaw",
      hardCCDuration: 0,
      ultCooldown: 2,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Leblanc: {
      alias: "Leblanc",
      hardCCDuration: 1.5,
      ultCooldown: 50,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    LeeSin: {
      alias: "LeeSin",
      hardCCDuration: 1,
      ultCooldown: 110,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    Leona: {
      alias: "Leona",
      hardCCDuration: 1,
      ultCooldown: 90,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Lillia: {
      alias: "Lillia",
      hardCCDuration: 0,
      ultCooldown: 150,
      ultCastTime: 0.4,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Lissandra: {
      alias: "Lissandra",
      hardCCDuration: 1.5,
      ultCooldown: 120,
      ultCastTime: 0.375,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Lucian: {
      alias: "Lucian",
      hardCCDuration: 4,
      ultCooldown: 110,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Lulu: {
      alias: "Lulu",
      hardCCDuration: 1,
      ultCooldown: 100,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Lux: {
      alias: "Lux",
      hardCCDuration: 2,
      ultCooldown: 60,
      ultCastTime: 1,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Malphite: {
      alias: "Malphite",
      hardCCDuration: 1.5,
      ultCooldown: 130,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Malzahar: {
      alias: "Malzahar",
      hardCCDuration: 0,
      ultCooldown: 140,
      ultCastTime: 5e-3,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Maokai: {
      alias: "Maokai",
      hardCCDuration: 0.5,
      ultCooldown: 130,
      ultCastTime: 0.5,
      hasResets: false,
      burstWindowSeconds: 4
    },
    MasterYi: {
      alias: "MasterYi",
      hardCCDuration: 0,
      ultCooldown: 85,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    Mel: {
      alias: "Mel",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0.75,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Milio: {
      alias: "Milio",
      hardCCDuration: 1,
      ultCooldown: 160,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    MissFortune: {
      alias: "MissFortune",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Mordekaiser: {
      alias: "Mordekaiser",
      hardCCDuration: 0,
      ultCooldown: 140,
      ultCastTime: 0.5,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Morgana: {
      alias: "Morgana",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0.35,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Naafiri: {
      alias: "Naafiri",
      hardCCDuration: 0,
      ultCooldown: 110,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Nami: {
      alias: "Nami",
      hardCCDuration: 0.5,
      ultCooldown: 120,
      ultCastTime: 0.5,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Nasus: {
      alias: "Nasus",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0.2,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Nautilus: {
      alias: "Nautilus",
      hardCCDuration: 1,
      ultCooldown: 120,
      ultCastTime: 0.46,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Neeko: {
      alias: "Neeko",
      hardCCDuration: 0.75,
      ultCooldown: 120,
      ultCastTime: 0.6,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Nidalee: {
      alias: "Nidalee",
      hardCCDuration: 0,
      ultCooldown: 3,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Nilah: {
      alias: "Nilah",
      hardCCDuration: 0,
      ultCooldown: 110,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    Nocturne: {
      alias: "Nocturne",
      hardCCDuration: 0,
      ultCooldown: 140,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Nunu: {
      alias: "Nunu",
      hardCCDuration: 0,
      ultCooldown: 110,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Olaf: {
      alias: "Olaf",
      hardCCDuration: 0,
      ultCooldown: 100,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Orianna: {
      alias: "Orianna",
      hardCCDuration: 0.75,
      ultCooldown: 110,
      ultCastTime: 0.5,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Ornn: {
      alias: "Ornn",
      hardCCDuration: 1.25,
      ultCooldown: 140,
      ultCastTime: 0.5,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Pantheon: {
      alias: "Pantheon",
      hardCCDuration: 1,
      ultCooldown: 180,
      ultCastTime: 0.1,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Poppy: {
      alias: "Poppy",
      hardCCDuration: 1,
      ultCooldown: 140,
      ultCastTime: 0.25,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Pyke: {
      alias: "Pyke",
      hardCCDuration: 0,
      ultCooldown: 100,
      ultCastTime: 0.5,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Qiyana: {
      alias: "Qiyana",
      hardCCDuration: 0.5,
      ultCooldown: 120,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    Quinn: {
      alias: "Quinn",
      hardCCDuration: 0.5,
      ultCooldown: 3,
      ultCastTime: 0.25,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Rakan: {
      alias: "Rakan",
      hardCCDuration: 1,
      ultCooldown: 130,
      ultCastTime: 0.5,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Rammus: {
      alias: "Rammus",
      hardCCDuration: 0.75,
      ultCooldown: 90,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 4
    },
    RekSai: {
      alias: "RekSai",
      hardCCDuration: 1,
      ultCooldown: 100,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Rell: {
      alias: "Rell",
      hardCCDuration: 0.8,
      ultCooldown: 120,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Renata: {
      alias: "Renata",
      hardCCDuration: 1,
      ultCooldown: 150,
      ultCastTime: 0.75,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Renekton: {
      alias: "Renekton",
      hardCCDuration: 1.5,
      ultCooldown: 120,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Rengar: {
      alias: "Rengar",
      hardCCDuration: 0,
      ultCooldown: 110,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    Riven: {
      alias: "Riven",
      hardCCDuration: 0.75,
      ultCooldown: 120,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    Rumble: {
      alias: "Rumble",
      hardCCDuration: 0,
      ultCooldown: 130,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Ryze: {
      alias: "Ryze",
      hardCCDuration: 0.75,
      ultCooldown: 180,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Samira: {
      alias: "Samira",
      hardCCDuration: 0.5,
      ultCooldown: 5,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    Sejuani: {
      alias: "Sejuani",
      hardCCDuration: 1.5,
      ultCooldown: 130,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Senna: {
      alias: "Senna",
      hardCCDuration: 0,
      ultCooldown: 140,
      ultCastTime: 1,
      hasResets: false,
      burstWindowSeconds: 8
    },
    Seraphine: {
      alias: "Seraphine",
      hardCCDuration: 0,
      ultCooldown: 160,
      ultCastTime: 0.5,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Sett: {
      alias: "Sett",
      hardCCDuration: 1,
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Shaco: {
      alias: "Shaco",
      hardCCDuration: 1.25,
      ultCooldown: 100,
      ultCastTime: 0.25,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Shen: {
      alias: "Shen",
      hardCCDuration: 1.5,
      ultCooldown: 200,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Shyvana: {
      alias: "Shyvana",
      hardCCDuration: 0,
      ultCooldown: 90,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Singed: {
      alias: "Singed",
      hardCCDuration: 0,
      ultCooldown: 100,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Sion: {
      alias: "Sion",
      hardCCDuration: 0.75,
      ultCooldown: 140,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Sivir: {
      alias: "Sivir",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 8
    },
    Skarner: {
      alias: "Skarner",
      hardCCDuration: 1.1,
      ultCooldown: 120,
      ultCastTime: 0.65,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Smolder: {
      alias: "Smolder",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0.75,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Sona: {
      alias: "Sona",
      hardCCDuration: 1.5,
      ultCooldown: 140,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Soraka: {
      alias: "Soraka",
      hardCCDuration: 0,
      ultCooldown: 150,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Swain: {
      alias: "Swain",
      hardCCDuration: 1.5,
      ultCooldown: 120,
      ultCastTime: 0.5,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Sylas: {
      alias: "Sylas",
      hardCCDuration: 0.5,
      ultCooldown: 80,
      ultCastTime: 0.25,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Syndra: {
      alias: "Syndra",
      hardCCDuration: 1.25,
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    TahmKench: {
      alias: "TahmKench",
      hardCCDuration: 1.5,
      ultCooldown: 120,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Taliyah: {
      alias: "Taliyah",
      hardCCDuration: 3,
      ultCooldown: 180,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Talon: {
      alias: "Talon",
      hardCCDuration: 0,
      ultCooldown: 100,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Taric: {
      alias: "Taric",
      hardCCDuration: 1.5,
      ultCooldown: 180,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Teemo: {
      alias: "Teemo",
      hardCCDuration: 0,
      ultCooldown: 0.25,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Thresh: {
      alias: "Thresh",
      hardCCDuration: 1.5,
      ultCooldown: 120,
      ultCastTime: 0.45,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Tristana: {
      alias: "Tristana",
      hardCCDuration: 4,
      ultCooldown: 100,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    Trundle: {
      alias: "Trundle",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Tryndamere: {
      alias: "Tryndamere",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    TwistedFate: {
      alias: "TwistedFate",
      hardCCDuration: 0,
      ultCooldown: 180,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Twitch: {
      alias: "Twitch",
      hardCCDuration: 0,
      ultCooldown: 90,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    Udyr: {
      alias: "Udyr",
      hardCCDuration: 0.75,
      ultCooldown: 6,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Urgot: {
      alias: "Urgot",
      hardCCDuration: 1.5,
      ultCooldown: 100,
      ultCastTime: 0.5,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Varus: {
      alias: "Varus",
      hardCCDuration: 2,
      ultCooldown: 100,
      ultCastTime: 0.2419,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Vayne: {
      alias: "Vayne",
      hardCCDuration: 1.5,
      ultCooldown: 100,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    Veigar: {
      alias: "Veigar",
      hardCCDuration: 0,
      ultCooldown: 100,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Velkoz: {
      alias: "Velkoz",
      hardCCDuration: 0.75,
      ultCooldown: 100,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Vex: {
      alias: "Vex",
      hardCCDuration: 0,
      ultCooldown: 140,
      ultCastTime: 0.25,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Vi: {
      alias: "Vi",
      hardCCDuration: 1.3,
      ultCooldown: 140,
      ultCastTime: 0.25,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Viego: {
      alias: "Viego",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0.5,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Viktor: {
      alias: "Viktor",
      hardCCDuration: 1.5,
      ultCooldown: 120,
      ultCastTime: 0.25,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Vladimir: {
      alias: "Vladimir",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Volibear: {
      alias: "Volibear",
      hardCCDuration: 1,
      ultCooldown: 160,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Warwick: {
      alias: "Warwick",
      hardCCDuration: 1.5,
      ultCooldown: 110,
      ultCastTime: 0.1,
      hasResets: true,
      burstWindowSeconds: 4
    },
    MonkeyKing: {
      alias: "MonkeyKing",
      hardCCDuration: 0.6,
      ultCooldown: 130,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Xayah: {
      alias: "Xayah",
      hardCCDuration: 1.25,
      ultCooldown: 140,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 8
    },
    Xerath: {
      alias: "Xerath",
      hardCCDuration: 0,
      ultCooldown: 130,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    XinZhao: {
      alias: "XinZhao",
      hardCCDuration: 0.75,
      ultCooldown: 120,
      ultCastTime: 0.35,
      hasResets: false,
      burstWindowSeconds: 4
    },
    Yasuo: {
      alias: "Yasuo",
      hardCCDuration: 1,
      ultCooldown: 70,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 2.5
    },
    Yone: {
      alias: "Yone",
      hardCCDuration: 1,
      ultCooldown: 120,
      ultCastTime: 0.75,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Yorick: {
      alias: "Yorick",
      hardCCDuration: 0.25,
      ultCooldown: 160,
      ultCastTime: 0.5,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Yuumi: {
      alias: "Yuumi",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Zac: {
      alias: "Zac",
      hardCCDuration: 1,
      ultCooldown: 120,
      ultCastTime: 0.3,
      hasResets: true,
      burstWindowSeconds: 4
    },
    Zed: {
      alias: "Zed",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: true,
      burstWindowSeconds: 2.5
    },
    Zeri: {
      alias: "Zeri",
      hardCCDuration: 0,
      ultCooldown: 80,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 8
    },
    Ziggs: {
      alias: "Ziggs",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0.375,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Zilean: {
      alias: "Zilean",
      hardCCDuration: 0,
      ultCooldown: 120,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 3
    },
    Zoe: {
      alias: "Zoe",
      hardCCDuration: 0,
      ultCooldown: 11,
      ultCastTime: 0.25,
      hasResets: true,
      burstWindowSeconds: 3
    },
    Zyra: {
      alias: "Zyra",
      hardCCDuration: 1,
      ultCooldown: 110,
      ultCastTime: 0.25,
      hasResets: false,
      burstWindowSeconds: 3
    }
  };

  // lib/dataValidation.ts
  function isFiniteNumber(value, path) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return { ok: true, value };
    }
    return {
      ok: false,
      path,
      reason: `expected finite number, got ${value === null ? "null" : typeof value} (${String(value)})`
    };
  }
  function isBoolean(value, path) {
    if (typeof value === "boolean") {
      return { ok: true, value };
    }
    return {
      ok: false,
      path,
      reason: `expected boolean, got ${value === null ? "null" : typeof value} (${String(value)})`
    };
  }
  function isString(value, path) {
    if (typeof value === "string") {
      return { ok: true, value };
    }
    return {
      ok: false,
      path,
      reason: `expected string, got ${value === null ? "null" : typeof value} (${String(value)})`
    };
  }
  var SanitizationLog = class {
    badPaths = [];
    record(fail) {
      this.badPaths.push(`${fail.path}: ${fail.reason}`);
    }
    hasErrors() {
      return this.badPaths.length > 0;
    }
    flush(label) {
      if (this.badPaths.length > 0) {
        console.warn(
          `[dataValidation] ${label} \u2014 ${this.badPaths.length} malformed field(s) coerced to safe defaults:
` + this.badPaths.map((p) => `  \u2022 ${p}`).join("\n")
        );
        this.badPaths.length = 0;
      }
    }
  };
  function sanitizeNumber(value, path, log, defaultValue = 0) {
    const result = isFiniteNumber(value, path);
    if (result.ok) return result.value;
    log.record(result);
    return defaultValue;
  }
  function sanitizeBoolean(value, path, log, defaultValue = false) {
    const result = isBoolean(value, path);
    if (result.ok) return result.value;
    log.record(result);
    return defaultValue;
  }
  function sanitizeString(value, path, log, defaultValue = "") {
    const result = isString(value, path);
    if (result.ok) return result.value;
    log.record(result);
    return defaultValue;
  }

  // lib/championAbilities.ts
  function loadAndSanitizeAbilities() {
    const raw = abilities_default;
    const log = new SanitizationLog();
    const sanitized = {};
    for (const [key, entry] of Object.entries(raw)) {
      const p = `abilities.${key}`;
      const e = entry ?? {};
      sanitized[key] = {
        alias: sanitizeString(e["alias"], `${p}.alias`, log, key),
        hardCCDuration: sanitizeNumber(e["hardCCDuration"], `${p}.hardCCDuration`, log),
        ultCooldown: sanitizeNumber(e["ultCooldown"], `${p}.ultCooldown`, log, 90),
        ultCastTime: sanitizeNumber(e["ultCastTime"], `${p}.ultCastTime`, log),
        hasResets: sanitizeBoolean(e["hasResets"], `${p}.hasResets`, log),
        burstWindowSeconds: sanitizeNumber(e["burstWindowSeconds"], `${p}.burstWindowSeconds`, log, 4)
      };
    }
    log.flush("abilities.json");
    return sanitized;
  }
  var ABILITIES = loadAndSanitizeAbilities();

  // lib/data/items.json
  var items_default = {
    Boots: {
      name: "Boots",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 25,
      cost: 300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Faerie Charm": {
      name: "Faerie Charm",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Rejuvenation Bead": {
      name: "Rejuvenation Bead",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Giant's Belt": {
      name: "Giant's Belt",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 350,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Cloak of Agility": {
      name: "Cloak of Agility",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 600,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Blasting Wand": {
      name: "Blasting Wand",
      ad: 0,
      ap: 45,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 850,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Sapphire Crystal": {
      name: "Sapphire Crystal",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 300,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Ruby Crystal": {
      name: "Ruby Crystal",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 150,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Cloth Armor": {
      name: "Cloth Armor",
      ad: 0,
      ap: 0,
      armor: 15,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Chain Vest": {
      name: "Chain Vest",
      ad: 0,
      ap: 0,
      armor: 40,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 800,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Null-Magic Mantle": {
      name: "Null-Magic Mantle",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 20,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Long Sword": {
      name: "Long Sword",
      ad: 10,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 350,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Pickaxe: {
      name: "Pickaxe",
      ad: 25,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 875,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "B. F. Sword": {
      name: "B. F. Sword",
      ad: 40,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Dagger: {
      name: "Dagger",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 10,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 250,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Recurve Bow": {
      name: "Recurve Bow",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 15,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 700,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Amplifying Tome": {
      name: "Amplifying Tome",
      ad: 0,
      ap: 20,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Vampiric Scepter": {
      name: "Vampiric Scepter",
      ad: 15,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Doran's Shield": {
      name: "Doran's Shield",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 110,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 450,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Doran's Blade": {
      name: "Doran's Blade",
      ad: 10,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 80,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 450,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Doran's Ring": {
      name: "Doran's Ring",
      ad: 0,
      ap: 18,
      armor: 0,
      mr: 0,
      hp: 90,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Negatron Cloak": {
      name: "Negatron Cloak",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 45,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 850,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Needlessly Large Rod": {
      name: "Needlessly Large Rod",
      ad: 0,
      ap: 65,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Dark Seal": {
      name: "Dark Seal",
      ad: 0,
      ap: 15,
      armor: 0,
      mr: 0,
      hp: 50,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 350,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Cull: {
      name: "Cull",
      ad: 7,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 450,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Scorchclaw Pup": {
      name: "Scorchclaw Pup",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 450,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Gustwalker Hatchling": {
      name: "Gustwalker Hatchling",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 450,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Mosstomper Seedling": {
      name: "Mosstomper Seedling",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 450,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Jarvan I's": {
      name: "Jarvan I's",
      ad: 0,
      ap: 0,
      armor: 25,
      mr: 20,
      hp: 0,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 25,
      crit: 0,
      armorPen: 0,
      magicPen: 12,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 100,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Ohmwrecker (Turret Item)": {
      name: "Ohmwrecker (Turret Item)",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Reinforced Armor (Turret Item)": {
      name: "Reinforced Armor (Turret Item)",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Warden's Eye": {
      name: "Warden's Eye",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Base Turret Reinforced Armor (Turret Item)": {
      name: "Base Turret Reinforced Armor (Turret Item)",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Overcharged: {
      name: "Overcharged",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Anti-Tower Socks": {
      name: "Anti-Tower Socks",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Gusto: {
      name: "Gusto",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Phreakish Gusto": {
      name: "Phreakish Gusto",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Super Mech Armor": {
      name: "Super Mech Armor",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Super Mech Power Field": {
      name: "Super Mech Power Field",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Turret Plating": {
      name: "Turret Plating",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Crystalline Overgrowth": {
      name: "Crystalline Overgrowth",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Health Potion": {
      name: "Health Potion",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 50,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Total Biscuit of Everlasting Will": {
      name: "Total Biscuit of Everlasting Will",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Steel Sigil": {
      name: "Steel Sigil",
      ad: 15,
      ap: 0,
      armor: 30,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1100,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "The Brutalizer": {
      name: "The Brutalizer",
      ad: 25,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1337,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Tunneler: {
      name: "Tunneler",
      ad: 15,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 250,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1150,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Glowing Mote": {
      name: "Glowing Mote",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 5,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 250,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Refillable Potion": {
      name: "Refillable Potion",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 150,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Guardian's Amulet": {
      name: "Guardian's Amulet",
      ad: 0,
      ap: 20,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Guardian's Shroud": {
      name: "Guardian's Shroud",
      ad: 0,
      ap: 35,
      armor: 0,
      mr: 0,
      hp: 300,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Guardian's Horn": {
      name: "Guardian's Horn",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 150,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 950,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Poro-Snax": {
      name: "Poro-Snax",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Control Ward": {
      name: "Control Ward",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 75,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Shurelya's Battlesong": {
      name: "Shurelya's Battlesong",
      ad: 0,
      ap: 50,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Elixir of Iron": {
      name: "Elixir of Iron",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Elixir of Sorcery": {
      name: "Elixir of Sorcery",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Elixir of Wrath": {
      name: "Elixir of Wrath",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Cappa Juice": {
      name: "Cappa Juice",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Juice of Power": {
      name: "Juice of Power",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Juice of Vitality": {
      name: "Juice of Vitality",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Juice of Haste": {
      name: "Juice of Haste",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Lucky Dice": {
      name: "Lucky Dice",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Enhanced Lucky Dice": {
      name: "Enhanced Lucky Dice",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Elixir of Skill": {
      name: "Elixir of Skill",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Elixir of Avarice": {
      name: "Elixir of Avarice",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Elixir of Force": {
      name: "Elixir of Force",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Seeker's Armguard": {
      name: "Seeker's Armguard",
      ad: 0,
      ap: 40,
      armor: 25,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1600,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Shattered Armguard": {
      name: "Shattered Armguard",
      ad: 0,
      ap: 40,
      armor: 25,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1600,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Slightly Magical Boots": {
      name: "Slightly Magical Boots",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 25,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Overlord's Bloodmail": {
      name: "Overlord's Bloodmail",
      ad: 30,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 550,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Unending Despair": {
      name: "Unending Despair",
      ad: 0,
      ap: 0,
      armor: 50,
      mr: 0,
      hp: 400,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2800,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Blackfire Torch": {
      name: "Blackfire Torch",
      ad: 0,
      ap: 80,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 600,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2800,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Kaenic Rookern": {
      name: "Kaenic Rookern",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 80,
      hp: 400,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Fated Ashes": {
      name: "Fated Ashes",
      ad: 0,
      ap: 30,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Dusk and Dawn": {
      name: "Dusk and Dawn",
      ad: 0,
      ap: 70,
      armor: 0,
      mr: 0,
      hp: 350,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 25,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3100,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Fiendhunter Bolts": {
      name: "Fiendhunter Bolts",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 45,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2650,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Endless Hunger": {
      name: "Endless Hunger",
      ad: 65,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3100,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Bastionbreaker: {
      name: "Bastionbreaker",
      ad: 55,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Actualizer: {
      name: "Actualizer",
      ad: 0,
      ap: 90,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 300,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2800,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Hexoptics C44": {
      name: "Hexoptics C44",
      ad: 55,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2800,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Bandlepipes: {
      name: "Bandlepipes",
      ad: 0,
      ap: 0,
      armor: 20,
      mr: 20,
      hp: 200,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Protoplasm Harness": {
      name: "Protoplasm Harness",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 600,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Whispering Circlet": {
      name: "Whispering Circlet",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 300,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2250,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Diadem of Songs": {
      name: "Diadem of Songs",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 1e3,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2250,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Trailblazer: {
      name: "Trailblazer",
      ad: 0,
      ap: 0,
      armor: 40,
      mr: 0,
      hp: 250,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Archangel's Staff": {
      name: "Archangel's Staff",
      ad: 0,
      ap: 70,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 600,
      abilityHaste: 25,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Manamune: {
      name: "Manamune",
      ad: 35,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 500,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Berserker's Greaves": {
      name: "Berserker's Greaves",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 25,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 45,
      cost: 1100,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Boots of Swiftness": {
      name: "Boots of Swiftness",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 55,
      cost: 1e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Sorcerer's Shoes": {
      name: "Sorcerer's Shoes",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 12,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 45,
      cost: 1100,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Glacial Buckler": {
      name: "Glacial Buckler",
      ad: 0,
      ap: 0,
      armor: 25,
      mr: 0,
      hp: 0,
      mana: 300,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Guardian Angel": {
      name: "Guardian Angel",
      ad: 55,
      ap: 0,
      armor: 45,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Infinity Edge": {
      name: "Infinity Edge",
      ad: 75,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Yun Tal Wildarrows": {
      name: "Yun Tal Wildarrows",
      ad: 50,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 40,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3100,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Mortal Reminder": {
      name: "Mortal Reminder",
      ad: 35,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: true
    },
    "Last Whisper": {
      name: "Last Whisper",
      ad: 20,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1450,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Lord Dominik's Regards": {
      name: "Lord Dominik's Regards",
      ad: 35,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Seraph's Embrace": {
      name: "Seraph's Embrace",
      ad: 0,
      ap: 70,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 1e3,
      abilityHaste: 25,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Mejai's Soulstealer": {
      name: "Mejai's Soulstealer",
      ad: 0,
      ap: 20,
      armor: 0,
      mr: 0,
      hp: 100,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Muramana: {
      name: "Muramana",
      ad: 35,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 1e3,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Phage: {
      name: "Phage",
      ad: 15,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1100,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Phantom Dancer": {
      name: "Phantom Dancer",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 65,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2650,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Plated Steelcaps": {
      name: "Plated Steelcaps",
      ad: 0,
      ap: 0,
      armor: 25,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 45,
      cost: 1200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Zeke's Convergence": {
      name: "Zeke's Convergence",
      ad: 0,
      ap: 0,
      armor: 25,
      mr: 25,
      hp: 300,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Hearthbound Axe": {
      name: "Hearthbound Axe",
      ad: 20,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 20,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Sterak's Gage": {
      name: "Sterak's Gage",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 400,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Sheen: {
      name: "Sheen",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Spirit Visage": {
      name: "Spirit Visage",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 50,
      hp: 400,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2700,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Winged Moonplate": {
      name: "Winged Moonplate",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 800,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Kindlegem: {
      name: "Kindlegem",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 800,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Sunfire Aegis": {
      name: "Sunfire Aegis",
      ad: 0,
      ap: 0,
      armor: 50,
      mr: 0,
      hp: 350,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2700,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Tear of the Goddess": {
      name: "Tear of the Goddess",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 240,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Black Cleaver": {
      name: "Black Cleaver",
      ad: 40,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 400,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Bloodthirster: {
      name: "Bloodthirster",
      ad: 80,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Experimental Hexplate": {
      name: "Experimental Hexplate",
      ad: 40,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 450,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 20,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Ravenous Hydra": {
      name: "Ravenous Hydra",
      ad: 65,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Thornmail: {
      name: "Thornmail",
      ad: 0,
      ap: 0,
      armor: 75,
      mr: 0,
      hp: 150,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2450,
      tags: [
        "component"
      ],
      isAntiHeal: true
    },
    "Bramble Vest": {
      name: "Bramble Vest",
      ad: 0,
      ap: 0,
      armor: 30,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 800,
      tags: [
        "component"
      ],
      isAntiHeal: true
    },
    Tiamat: {
      name: "Tiamat",
      ad: 20,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Trinity Force": {
      name: "Trinity Force",
      ad: 36,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 333,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 30,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3333,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Warden's Mail": {
      name: "Warden's Mail",
      ad: 0,
      ap: 0,
      armor: 40,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Warmog's Armor": {
      name: "Warmog's Armor",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 1e3,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3100,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Heartsteel: {
      name: "Heartsteel",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 900,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Runaan's Hurricane": {
      name: "Runaan's Hurricane",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 40,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2650,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Zeal: {
      name: "Zeal",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 15,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Statikk Shiv": {
      name: "Statikk Shiv",
      ad: 45,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 30,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2700,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Rabadon's Deathcap": {
      name: "Rabadon's Deathcap",
      ad: 0,
      ap: 130,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Wit's End": {
      name: "Wit's End",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 45,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 50,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2800,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Rapid Firecannon": {
      name: "Rapid Firecannon",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 35,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2650,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Stormrazor: {
      name: "Stormrazor",
      ad: 50,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 20,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Lich Bane": {
      name: "Lich Bane",
      ad: 0,
      ap: 100,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Banshee's Veil": {
      name: "Banshee's Veil",
      ad: 0,
      ap: 105,
      armor: 0,
      mr: 40,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Redemption: {
      name: "Redemption",
      ad: 0,
      ap: 30,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2250,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Fiendish Codex": {
      name: "Fiendish Codex",
      ad: 0,
      ap: 25,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 850,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Knight's Vow": {
      name: "Knight's Vow",
      ad: 0,
      ap: 0,
      armor: 40,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Frozen Heart": {
      name: "Frozen Heart",
      ad: 0,
      ap: 0,
      armor: 75,
      mr: 0,
      hp: 0,
      mana: 400,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Mercury's Treads": {
      name: "Mercury's Treads",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 20,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 45,
      cost: 1250,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Guardian's Orb": {
      name: "Guardian's Orb",
      ad: 0,
      ap: 50,
      armor: 0,
      mr: 0,
      hp: 150,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 950,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Aether Wisp": {
      name: "Aether Wisp",
      ad: 0,
      ap: 30,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Forbidden Idol": {
      name: "Forbidden Idol",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 600,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Nashor's Tooth": {
      name: "Nashor's Tooth",
      ad: 0,
      ap: 80,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 50,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Rylai's Crystal Scepter": {
      name: "Rylai's Crystal Scepter",
      ad: 0,
      ap: 65,
      armor: 0,
      mr: 0,
      hp: 400,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2600,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Malignance: {
      name: "Malignance",
      ad: 0,
      ap: 90,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 600,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2700,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Winter's Approach": {
      name: "Winter's Approach",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 550,
      mana: 500,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Fimbulwinter: {
      name: "Fimbulwinter",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 550,
      mana: 1e3,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Executioner's Calling": {
      name: "Executioner's Calling",
      ad: 15,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 800,
      tags: [
        "component"
      ],
      isAntiHeal: true
    },
    "Guinsoo's Rageblade": {
      name: "Guinsoo's Rageblade",
      ad: 30,
      ap: 30,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 25,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Caulfield's Warhammer": {
      name: "Caulfield's Warhammer",
      ad: 20,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1050,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Serrated Dirk": {
      name: "Serrated Dirk",
      ad: 20,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Void Staff": {
      name: "Void Staff",
      ad: 0,
      ap: 95,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Cryptbloom: {
      name: "Cryptbloom",
      ad: 0,
      ap: 75,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Mercurial Scimitar": {
      name: "Mercurial Scimitar",
      ad: 50,
      ap: 0,
      armor: 0,
      mr: 35,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Quicksilver Sash": {
      name: "Quicksilver Sash",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 30,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Youmuu's Ghostblade": {
      name: "Youmuu's Ghostblade",
      ad: 55,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2800,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Randuin's Omen": {
      name: "Randuin's Omen",
      ad: 0,
      ap: 0,
      armor: 75,
      mr: 0,
      hp: 350,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2700,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Scout's Slingshot": {
      name: "Scout's Slingshot",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 20,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 600,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Hextech Alternator": {
      name: "Hextech Alternator",
      ad: 0,
      ap: 45,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1100,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Hextech Gunblade": {
      name: "Hextech Gunblade",
      ad: 40,
      ap: 80,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Haunting Guise": {
      name: "Haunting Guise",
      ad: 0,
      ap: 30,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Hextech Rocketbelt": {
      name: "Hextech Rocketbelt",
      ad: 0,
      ap: 70,
      armor: 0,
      mr: 0,
      hp: 300,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2650,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Blade of the Ruined King": {
      name: "Blade of the Ruined King",
      ad: 40,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 25,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Hexdrinker: {
      name: "Hexdrinker",
      ad: 25,
      ap: 0,
      armor: 0,
      mr: 25,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Maw of Malmortius": {
      name: "Maw of Malmortius",
      ad: 60,
      ap: 0,
      armor: 0,
      mr: 40,
      hp: 0,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3100,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Zhonya's Hourglass": {
      name: "Zhonya's Hourglass",
      ad: 0,
      ap: 105,
      armor: 50,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3250,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Ionian Boots of Lucidity": {
      name: "Ionian Boots of Lucidity",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 45,
      cost: 900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Spear of Shojin": {
      name: "Spear of Shojin",
      ad: 45,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 450,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3100,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Morellonomicon: {
      name: "Morellonomicon",
      ad: 0,
      ap: 75,
      armor: 0,
      mr: 0,
      hp: 350,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2850,
      tags: [
        "component"
      ],
      isAntiHeal: true
    },
    Swiftmarch: {
      name: "Swiftmarch",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 65,
      cost: 1e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Crimson Lucidity": {
      name: "Crimson Lucidity",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 45,
      cost: 900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Zephyr: {
      name: "Zephyr",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 30,
      attackSpeed: 50,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Chainlaced Crushers": {
      name: "Chainlaced Crushers",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 30,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 45,
      cost: 1250,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Armored Advance": {
      name: "Armored Advance",
      ad: 0,
      ap: 0,
      armor: 35,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 45,
      cost: 1200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Spellslinger's Shoes": {
      name: "Spellslinger's Shoes",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 18,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 45,
      cost: 1100,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Guardian's Blade": {
      name: "Guardian's Blade",
      ad: 30,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 150,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 950,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Umbral Glaive": {
      name: "Umbral Glaive",
      ad: 60,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2800,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Hullbreaker: {
      name: "Hullbreaker",
      ad: 40,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 500,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Guardian's Hammer": {
      name: "Guardian's Hammer",
      ad: 25,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 150,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 950,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Locket of the Iron Solari": {
      name: "Locket of the Iron Solari",
      ad: 0,
      ap: 0,
      armor: 25,
      mr: 25,
      hp: 200,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Spectre's Cowl": {
      name: "Spectre's Cowl",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 35,
      hp: 200,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1250,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Mikael's Blessing": {
      name: "Mikael's Blessing",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 250,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Terminus: {
      name: "Terminus",
      ad: 30,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 35,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Scarecrow Effigy": {
      name: "Scarecrow Effigy",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Stealth Ward": {
      name: "Stealth Ward",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Arcane Sweeper (Trinket)": {
      name: "Arcane Sweeper (Trinket)",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Farsight Alteration": {
      name: "Farsight Alteration",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Oracle Lens": {
      name: "Oracle Lens",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Your Cut": {
      name: "Your Cut",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Rite of Ruin": {
      name: "Rite of Ruin",
      ad: 0,
      ap: 50,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Ardent Censer": {
      name: "Ardent Censer",
      ad: 0,
      ap: 45,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Essence Reaver": {
      name: "Essence Reaver",
      ad: 50,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3050,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Eye of the Herald": {
      name: "Eye of the Herald",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Black Spear": {
      name: "Black Spear",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Dead Man's Plate": {
      name: "Dead Man's Plate",
      ad: 0,
      ap: 0,
      armor: 55,
      mr: 0,
      hp: 350,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Titanic Hydra": {
      name: "Titanic Hydra",
      ad: 40,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 600,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Crystalline Bracer": {
      name: "Crystalline Bracer",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 800,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Lost Chapter": {
      name: "Lost Chapter",
      ad: 0,
      ap: 40,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 300,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Catalyst of Aeons": {
      name: "Catalyst of Aeons",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 300,
      mana: 375,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Edge of Night": {
      name: "Edge of Night",
      ad: 50,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 250,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "World Atlas": {
      name: "World Atlas",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 30,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Runic Compass": {
      name: "Runic Compass",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 100,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Bounty of Worlds": {
      name: "Bounty of Worlds",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Celestial Opposition": {
      name: "Celestial Opposition",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Dream Maker": {
      name: "Dream Maker",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Zaz'Zak's Realmspike": {
      name: "Zaz'Zak's Realmspike",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Solstice Sleigh": {
      name: "Solstice Sleigh",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Bloodsong: {
      name: "Bloodsong",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 400,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Fire at Will": {
      name: "Fire at Will",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Death's Daughter": {
      name: "Death's Daughter",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Raise Morale": {
      name: "Raise Morale",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Oblivion Orb": {
      name: "Oblivion Orb",
      ad: 0,
      ap: 25,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 800,
      tags: [
        "component"
      ],
      isAntiHeal: true
    },
    Lifeline: {
      name: "Lifeline",
      ad: 25,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1600,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Imperial Mandate": {
      name: "Imperial Mandate",
      ad: 0,
      ap: 60,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2250,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Sword of Blossoming Dawn": {
      name: "Sword of Blossoming Dawn",
      ad: 0,
      ap: 45,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Perplexity: {
      name: "Perplexity",
      ad: 0,
      ap: 60,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Wordless Promise": {
      name: "Wordless Promise",
      ad: 0,
      ap: 50,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 25,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Hellfire Hatchet": {
      name: "Hellfire Hatchet",
      ad: 35,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Force of Nature": {
      name: "Force of Nature",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 55,
      hp: 400,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2800,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Horizon Focus": {
      name: "Horizon Focus",
      ad: 0,
      ap: 75,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 25,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2700,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Cosmic Drive": {
      name: "Cosmic Drive",
      ad: 0,
      ap: 70,
      armor: 0,
      mr: 0,
      hp: 350,
      mana: 0,
      abilityHaste: 25,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Blighting Jewel": {
      name: "Blighting Jewel",
      ad: 0,
      ap: 25,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1100,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Verdant Barrier": {
      name: "Verdant Barrier",
      ad: 0,
      ap: 40,
      armor: 0,
      mr: 25,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1600,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Riftmaker: {
      name: "Riftmaker",
      ad: 0,
      ap: 70,
      armor: 0,
      mr: 0,
      hp: 350,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3100,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Bandleglass Mirror": {
      name: "Bandleglass Mirror",
      ad: 0,
      ap: 20,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Shadowflame: {
      name: "Shadowflame",
      ad: 0,
      ap: 110,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 15,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Stormsurge: {
      name: "Stormsurge",
      ad: 0,
      ap: 90,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 15,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2800,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Death's Dance": {
      name: "Death's Dance",
      ad: 60,
      ap: 0,
      armor: 50,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Chempunk Chainsword": {
      name: "Chempunk Chainsword",
      ad: 45,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 450,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3100,
      tags: [
        "component"
      ],
      isAntiHeal: true
    },
    "Sundered Sky": {
      name: "Sundered Sky",
      ad: 45,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 400,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3100,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Staff of Flowing Water": {
      name: "Staff of Flowing Water",
      ad: 0,
      ap: 35,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2250,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Moonstone Renewer": {
      name: "Moonstone Renewer",
      ad: 0,
      ap: 25,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Echoes of Helia": {
      name: "Echoes of Helia",
      ad: 0,
      ap: 35,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Dawncore: {
      name: "Dawncore",
      ad: 0,
      ap: 45,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Stridebreaker: {
      name: "Stridebreaker",
      ad: 40,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 450,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 25,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Liandry's Torment": {
      name: "Liandry's Torment",
      ad: 0,
      ap: 60,
      armor: 0,
      mr: 0,
      hp: 300,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Luden's Echo": {
      name: "Luden's Echo",
      ad: 0,
      ap: 100,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 600,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2750,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Rod of Ages": {
      name: "Rod of Ages",
      ad: 0,
      ap: 45,
      armor: 0,
      mr: 0,
      hp: 350,
      mana: 500,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2600,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Bami's Cinder": {
      name: "Bami's Cinder",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 150,
      mana: 0,
      abilityHaste: 5,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Iceborn Gauntlet": {
      name: "Iceborn Gauntlet",
      ad: 0,
      ap: 0,
      armor: 50,
      mr: 0,
      hp: 300,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Hollow Radiance": {
      name: "Hollow Radiance",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 40,
      hp: 400,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2800,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Jak'Sho, The Protean": {
      name: "Jak'Sho, The Protean",
      ad: 0,
      ap: 0,
      armor: 45,
      mr: 45,
      hp: 350,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3200,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Noonquiver: {
      name: "Noonquiver",
      ad: 15,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 1300,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Kraken Slayer": {
      name: "Kraken Slayer",
      ad: 45,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 40,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Immortal Shieldbow": {
      name: "Immortal Shieldbow",
      ad: 55,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Navori Flickerblade": {
      name: "Navori Flickerblade",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 40,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2650,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "The Collector": {
      name: "The Collector",
      ad: 50,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Rectrix: {
      name: "Rectrix",
      ad: 15,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 775,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Eclipse: {
      name: "Eclipse",
      ad: 60,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Serylda's Grudge": {
      name: "Serylda's Grudge",
      ad: 45,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Serpent's Fang": {
      name: "Serpent's Fang",
      ad: 55,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Axiom Arc": {
      name: "Axiom Arc",
      ad: 55,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2750,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Hubris: {
      name: "Hubris",
      ad: 60,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Profane Hydra": {
      name: "Profane Hydra",
      ad: 55,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2850,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Voltaic Cyclosword": {
      name: "Voltaic Cyclosword",
      ad: 55,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 3e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Opportunity: {
      name: "Opportunity",
      ad: 55,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2700,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Bloodletter's Curse": {
      name: "Bloodletter's Curse",
      ad: 0,
      ap: 65,
      armor: 0,
      mr: 0,
      hp: 400,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2900,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Abyssal Mask": {
      name: "Abyssal Mask",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 45,
      hp: 350,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2650,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Stat Bonus": {
      name: "Stat Bonus",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 750,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Legendary Fighter Item": {
      name: "Legendary Fighter Item",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Legendary Marksman Item": {
      name: "Legendary Marksman Item",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Legendary Assassin Item": {
      name: "Legendary Assassin Item",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Legendary Mage Item": {
      name: "Legendary Mage Item",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Legendary Tank Item": {
      name: "Legendary Tank Item",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Legendary Support Item": {
      name: "Legendary Support Item",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Prismatic Item": {
      name: "Prismatic Item",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 4e3,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Ghostcrawlers: {
      name: "Ghostcrawlers",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 70,
      cost: 500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Atma's Reckoning": {
      name: "Atma's Reckoning",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 700,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Void Immolation": {
      name: "Void Immolation",
      ad: 0,
      ap: 0,
      armor: 100,
      mr: 80,
      hp: 1e3,
      mana: 0,
      abilityHaste: 25,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Guardian's Dirk": {
      name: "Guardian's Dirk",
      ad: 25,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 10,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Spectral Cutlass": {
      name: "Spectral Cutlass",
      ad: 50,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2800,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "The Golden Spatula": {
      name: "The Golden Spatula",
      ad: 90,
      ap: 125,
      armor: 40,
      mr: 40,
      hp: 350,
      mana: 350,
      abilityHaste: 20,
      attackSpeed: 60,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Goredrinker: {
      name: "Goredrinker",
      ad: 55,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 400,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Anathema's Chains": {
      name: "Anathema's Chains",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 650,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 2500,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Wooglet's Witchcap": {
      name: "Wooglet's Witchcap",
      ad: 0,
      ap: 300,
      armor: 50,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Darksteel Talons": {
      name: "Darksteel Talons",
      ad: 0,
      ap: 0,
      armor: 55,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 50,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Fulmination: {
      name: "Fulmination",
      ad: 55,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 45,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Demon King's Crown": {
      name: "Demon King's Crown",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Shield of Molten Stone": {
      name: "Shield of Molten Stone",
      ad: 0,
      ap: 0,
      armor: 100,
      mr: 0,
      hp: 300,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Cloak of Starry Night": {
      name: "Cloak of Starry Night",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 100,
      hp: 300,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Sword of the Divine": {
      name: "Sword of the Divine",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Force of Entropy": {
      name: "Force of Entropy",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 900,
      mana: 0,
      abilityHaste: 30,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Sanguine Gift": {
      name: "Sanguine Gift",
      ad: 0,
      ap: 80,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Eleisa's Miracle": {
      name: "Eleisa's Miracle",
      ad: 0,
      ap: 0,
      armor: 50,
      mr: 50,
      hp: 0,
      mana: 0,
      abilityHaste: 25,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Talisman of Ascension": {
      name: "Talisman of Ascension",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Hamstringer: {
      name: "Hamstringer",
      ad: 45,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 40,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Turbo Chemtank": {
      name: "Turbo Chemtank",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 600,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Twin Mask": {
      name: "Twin Mask",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Hexbolt Companion": {
      name: "Hexbolt Companion",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 500,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 75,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Reaper's Toll": {
      name: "Reaper's Toll",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 50,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Gargoyle Stoneplate": {
      name: "Gargoyle Stoneplate",
      ad: 0,
      ap: 0,
      armor: 65,
      mr: 65,
      hp: 0,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Night Harvester": {
      name: "Night Harvester",
      ad: 0,
      ap: 90,
      armor: 0,
      mr: 0,
      hp: 300,
      mana: 0,
      abilityHaste: 25,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Demonic Embrace": {
      name: "Demonic Embrace",
      ad: 0,
      ap: 80,
      armor: 0,
      mr: 0,
      hp: 700,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Crown of the Shattered Queen": {
      name: "Crown of the Shattered Queen",
      ad: 0,
      ap: 85,
      armor: 0,
      mr: 0,
      hp: 350,
      mana: 600,
      abilityHaste: 25,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Divine Sunderer": {
      name: "Divine Sunderer",
      ad: 55,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 350,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Everfrost: {
      name: "Everfrost",
      ad: 0,
      ap: 100,
      armor: 0,
      mr: 0,
      hp: 250,
      mana: 600,
      abilityHaste: 25,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Radiant Virtue": {
      name: "Radiant Virtue",
      ad: 0,
      ap: 0,
      armor: 35,
      mr: 35,
      hp: 400,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Galeforce: {
      name: "Galeforce",
      ad: 65,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 30,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Duskblade of Draktharr": {
      name: "Duskblade of Draktharr",
      ad: 50,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Prowler's Claw": {
      name: "Prowler's Claw",
      ad: 55,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Mirage Blade": {
      name: "Mirage Blade",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 60,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Gambler's Blade": {
      name: "Gambler's Blade",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 40,
      attackSpeed: 70,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Reality Fracture": {
      name: "Reality Fracture",
      ad: 0,
      ap: 80,
      armor: 0,
      mr: 0,
      hp: 300,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 40,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Hemomancer's Helm": {
      name: "Hemomancer's Helm",
      ad: 70,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 30,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Innervating Locket": {
      name: "Innervating Locket",
      ad: 0,
      ap: 70,
      armor: 0,
      mr: 0,
      hp: 200,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Empyrean Promise": {
      name: "Empyrean Promise",
      ad: 0,
      ap: 70,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 30,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Dragonheart: {
      name: "Dragonheart",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Decapitator: {
      name: "Decapitator",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 50,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Runecarver: {
      name: "Runecarver",
      ad: 0,
      ap: 80,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Cruelty: {
      name: "Cruelty",
      ad: 0,
      ap: 80,
      armor: 30,
      mr: 30,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Moonflair Spellblade": {
      name: "Moonflair Spellblade",
      ad: 0,
      ap: 85,
      armor: 0,
      mr: 0,
      hp: 400,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Flesheater: {
      name: "Flesheater",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 500,
      mana: 0,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Detonation Orb": {
      name: "Detonation Orb",
      ad: 0,
      ap: 90,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 600,
      abilityHaste: 20,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 12,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Reverberation: {
      name: "Reverberation",
      ad: 0,
      ap: 0,
      armor: 35,
      mr: 35,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 40,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Regicide: {
      name: "Regicide",
      ad: 60,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Kinkou Jitte": {
      name: "Kinkou Jitte",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 400,
      mana: 0,
      abilityHaste: 30,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Pyromancer's Cloak": {
      name: "Pyromancer's Cloak",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 400,
      mana: 0,
      abilityHaste: 15,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Lightning Rod": {
      name: "Lightning Rod",
      ad: 0,
      ap: 0,
      armor: 30,
      mr: 30,
      hp: 500,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Diamond-Tipped Spear": {
      name: "Diamond-Tipped Spear",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 30,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Twilight's Edge": {
      name: "Twilight's Edge",
      ad: 70,
      ap: 100,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 0,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    "Black Hole Gauntlet": {
      name: "Black Hole Gauntlet",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 900,
      mana: 0,
      abilityHaste: 25,
      attackSpeed: 0,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    },
    Puppeteer: {
      name: "Puppeteer",
      ad: 0,
      ap: 0,
      armor: 0,
      mr: 0,
      hp: 0,
      mana: 0,
      abilityHaste: 40,
      attackSpeed: 30,
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      movespeed: 0,
      cost: 0,
      tags: [
        "component"
      ],
      isAntiHeal: false
    }
  };

  // lib/championBuilds.ts
  function loadAndSanitizeItems() {
    const raw = items_default;
    const log = new SanitizationLog();
    const sanitized = {};
    for (const [key, entry] of Object.entries(raw)) {
      const p = `items.${key}`;
      const e = entry ?? {};
      sanitized[key] = {
        name: sanitizeString(e["name"], `${p}.name`, log, key),
        ad: sanitizeNumber(e["ad"], `${p}.ad`, log),
        ap: sanitizeNumber(e["ap"], `${p}.ap`, log),
        armor: sanitizeNumber(e["armor"], `${p}.armor`, log),
        mr: sanitizeNumber(e["mr"], `${p}.mr`, log),
        hp: sanitizeNumber(e["hp"], `${p}.hp`, log),
        abilityHaste: sanitizeNumber(e["abilityHaste"], `${p}.abilityHaste`, log),
        attackSpeed: sanitizeNumber(e["attackSpeed"], `${p}.attackSpeed`, log),
        crit: sanitizeNumber(e["crit"], `${p}.crit`, log),
        armorPen: sanitizeNumber(e["armorPen"], `${p}.armorPen`, log),
        magicPen: sanitizeNumber(e["magicPen"], `${p}.magicPen`, log),
        lifesteal: sanitizeNumber(e["lifesteal"], `${p}.lifesteal`, log),
        omnivamp: sanitizeNumber(e["omnivamp"], `${p}.omnivamp`, log),
        movespeed: sanitizeNumber(e["movespeed"], `${p}.movespeed`, log),
        cost: sanitizeNumber(e["cost"], `${p}.cost`, log),
        isAntiHeal: sanitizeBoolean(e["isAntiHeal"], `${p}.isAntiHeal`, log)
      };
    }
    log.flush("items.json");
    return sanitized;
  }
  var ITEMS = loadAndSanitizeItems();

  // lib/draftOrder.ts
  var DRAFT_ORDER = [
    { index: 0, kind: "ban", side: "blue", slot: 0 },
    { index: 1, kind: "ban", side: "red", slot: 0 },
    { index: 2, kind: "ban", side: "blue", slot: 1 },
    { index: 3, kind: "ban", side: "red", slot: 1 },
    { index: 4, kind: "ban", side: "blue", slot: 2 },
    { index: 5, kind: "ban", side: "red", slot: 2 },
    { index: 6, kind: "pick", side: "blue", slot: 0 },
    { index: 7, kind: "pick", side: "red", slot: 0 },
    { index: 8, kind: "pick", side: "red", slot: 1 },
    { index: 9, kind: "pick", side: "blue", slot: 1 },
    { index: 10, kind: "pick", side: "blue", slot: 2 },
    { index: 11, kind: "pick", side: "red", slot: 2 },
    { index: 12, kind: "ban", side: "red", slot: 3 },
    { index: 13, kind: "ban", side: "blue", slot: 3 },
    { index: 14, kind: "ban", side: "red", slot: 4 },
    { index: 15, kind: "ban", side: "blue", slot: 4 },
    { index: 16, kind: "pick", side: "red", slot: 3 },
    { index: 17, kind: "pick", side: "blue", slot: 3 },
    { index: 18, kind: "pick", side: "blue", slot: 4 },
    { index: 19, kind: "pick", side: "red", slot: 4 }
  ];
  var TOTAL_ACTIONS = DRAFT_ORDER.length;

  // lib/data/hardCounters.json
  var hardCounters_default = [
    [
      "Malphite",
      "Yasuo",
      6
    ],
    [
      "Malphite",
      "Yone",
      6
    ],
    [
      "Malphite",
      "Tryndamere",
      4
    ],
    [
      "Pantheon",
      "Yone",
      5
    ],
    [
      "Pantheon",
      "Yasuo",
      5
    ],
    [
      "Pantheon",
      "Akali",
      4
    ],
    [
      "Pantheon",
      "Riven",
      4
    ],
    [
      "Renekton",
      "Aatrox",
      4
    ],
    [
      "Renekton",
      "Riven",
      4
    ],
    [
      "Renekton",
      "Camille",
      3
    ],
    [
      "Garen",
      "Darius",
      3
    ],
    [
      "Yorick",
      "Nasus",
      5
    ],
    [
      "Olaf",
      "MasterYi",
      5
    ],
    [
      "Olaf",
      "Nocturne",
      4
    ],
    [
      "Cassiopeia",
      "Akali",
      3
    ],
    [
      "Quinn",
      "Darius",
      4
    ],
    [
      "Quinn",
      "Sett",
      3
    ],
    [
      "Vayne",
      "Nasus",
      4
    ],
    [
      "Teemo",
      "Tryndamere",
      4
    ],
    [
      "Singed",
      "Tryndamere",
      3
    ],
    [
      "Kennen",
      "Renekton",
      3
    ],
    [
      "Gnar",
      "Renekton",
      3
    ],
    [
      "Jayce",
      "Aatrox",
      3
    ],
    [
      "Fiora",
      "Sett",
      3
    ],
    [
      "Shen",
      "Riven",
      3
    ],
    [
      "Camille",
      "Aatrox",
      3
    ],
    [
      "Mordekaiser",
      "Hecarim",
      3
    ],
    [
      "Yorick",
      "Vladimir",
      3
    ],
    [
      "Mordekaiser",
      "Tryndamere",
      4
    ],
    [
      "Volibear",
      "Yasuo",
      3
    ],
    [
      "Heimerdinger",
      "Tryndamere",
      4
    ],
    [
      "MonkeyKing",
      "Vayne",
      3
    ],
    [
      "TahmKench",
      "Riven",
      3
    ],
    [
      "KSante",
      "Aatrox",
      3
    ],
    [
      "Gwen",
      "Riven",
      3
    ],
    [
      "Jax",
      "Riven",
      3
    ],
    [
      "Garen",
      "Mordekaiser",
      3
    ],
    [
      "Singed",
      "MasterYi",
      4
    ],
    [
      "Sion",
      "Akali",
      3
    ],
    [
      "Quinn",
      "Yone",
      3
    ],
    [
      "Vayne",
      "Tryndamere",
      4
    ],
    [
      "Sett",
      "Renekton",
      3
    ],
    [
      "Camille",
      "Quinn",
      3
    ],
    [
      "Pantheon",
      "Mordekaiser",
      3
    ],
    [
      "Renekton",
      "Yorick",
      3
    ],
    [
      "Maokai",
      "Akali",
      3
    ],
    [
      "Shen",
      "Akali",
      3
    ],
    [
      "Kennen",
      "Aatrox",
      3
    ],
    [
      "Ornn",
      "Riven",
      3
    ],
    [
      "Diana",
      "Yasuo",
      3
    ],
    [
      "Leblanc",
      "Karthus",
      3
    ],
    [
      "Talon",
      "Cassiopeia",
      3
    ],
    [
      "Annie",
      "Yasuo",
      3
    ],
    [
      "Galio",
      "Yasuo",
      3
    ],
    [
      "Anivia",
      "Yasuo",
      4
    ],
    [
      "Yasuo",
      "Lissandra",
      -3
    ],
    [
      "Vladimir",
      "Talon",
      3
    ],
    [
      "Kassadin",
      "Xerath",
      4
    ],
    [
      "Sylas",
      "Karma",
      2
    ],
    [
      "Annie",
      "Veigar",
      3
    ],
    [
      "Veigar",
      "Yasuo",
      4
    ],
    [
      "Lissandra",
      "Kassadin",
      3
    ],
    [
      "Anivia",
      "Yone",
      3
    ],
    [
      "Brand",
      "Karthus",
      3
    ],
    [
      "Cassiopeia",
      "Lux",
      3
    ],
    [
      "Syndra",
      "Akali",
      3
    ],
    [
      "Orianna",
      "Kassadin",
      3
    ],
    [
      "Chogath",
      "Yasuo",
      3
    ],
    [
      "Leblanc",
      "Akali",
      3
    ],
    [
      "Talon",
      "Leblanc",
      3
    ],
    [
      "Diana",
      "Akali",
      3
    ],
    [
      "Vladimir",
      "Akali",
      3
    ],
    [
      "Ekko",
      "Akali",
      3
    ],
    [
      "Karma",
      "Yone",
      3
    ],
    [
      "Zoe",
      "Yasuo",
      3
    ],
    [
      "Annie",
      "Zed",
      3
    ],
    [
      "Galio",
      "Akali",
      3
    ],
    [
      "Lissandra",
      "Talon",
      3
    ],
    [
      "Malzahar",
      "Yasuo",
      3
    ],
    [
      "Xerath",
      "Yasuo",
      3
    ],
    [
      "Lux",
      "Akali",
      -2
    ],
    [
      "Khazix",
      "Rengar",
      3
    ],
    [
      "Vi",
      "Leblanc",
      3
    ],
    [
      "Kindred",
      "MasterYi",
      4
    ],
    [
      "Ekko",
      "MasterYi",
      3
    ],
    [
      "LeeSin",
      "Yasuo",
      2
    ],
    [
      "Rammus",
      "MasterYi",
      5
    ],
    [
      "Khazix",
      "Leblanc",
      3
    ],
    [
      "Fiddlesticks",
      "Kindred",
      3
    ],
    [
      "Hecarim",
      "Kindred",
      3
    ],
    [
      "Graves",
      "LeeSin",
      3
    ],
    [
      "Karthus",
      "MasterYi",
      3
    ],
    [
      "Olaf",
      "Karthus",
      4
    ],
    [
      "Vi",
      "Kassadin",
      3
    ],
    [
      "Diana",
      "Kayn",
      3
    ],
    [
      "Nocturne",
      "Caitlyn",
      3
    ],
    [
      "Shaco",
      "MasterYi",
      2
    ],
    [
      "JarvanIV",
      "Yasuo",
      3
    ],
    [
      "Skarner",
      "MasterYi",
      4
    ],
    [
      "Lillia",
      "Hecarim",
      3
    ],
    [
      "Vayne",
      "Chogath",
      5
    ],
    [
      "Vayne",
      "Sion",
      4
    ],
    [
      "Caitlyn",
      "Draven",
      3
    ],
    [
      "Caitlyn",
      "Lucian",
      3
    ],
    [
      "Tristana",
      "Caitlyn",
      2
    ],
    [
      "Ezreal",
      "Draven",
      3
    ],
    [
      "MissFortune",
      "Twitch",
      3
    ],
    [
      "Jhin",
      "Vayne",
      2
    ],
    [
      "Caitlyn",
      "Sivir",
      3
    ],
    [
      "Lucian",
      "Vayne",
      3
    ],
    [
      "Caitlyn",
      "Twitch",
      3
    ],
    [
      "Sivir",
      "Vayne",
      3
    ],
    [
      "Tristana",
      "Vayne",
      3
    ],
    [
      "Caitlyn",
      "MissFortune",
      2
    ],
    [
      "Vayne",
      "Aphelios",
      2
    ],
    [
      "Draven",
      "Vayne",
      2
    ],
    [
      "Pyke",
      "Senna",
      3
    ],
    [
      "Blitzcrank",
      "Yuumi",
      5
    ],
    [
      "Leona",
      "Yuumi",
      4
    ],
    [
      "Zyra",
      "Janna",
      3
    ],
    [
      "Morgana",
      "Blitzcrank",
      4
    ],
    [
      "Nautilus",
      "Yuumi",
      4
    ],
    [
      "Thresh",
      "Blitzcrank",
      2
    ],
    [
      "Janna",
      "Pyke",
      3
    ],
    [
      "Lulu",
      "Pyke",
      3
    ],
    [
      "Karma",
      "Blitzcrank",
      3
    ],
    [
      "Bard",
      "Blitzcrank",
      3
    ],
    [
      "Janna",
      "Leona",
      3
    ],
    [
      "Lulu",
      "Leona",
      3
    ],
    [
      "Lux",
      "Pyke",
      3
    ],
    [
      "Soraka",
      "Brand",
      3
    ],
    [
      "Sona",
      "Brand",
      3
    ],
    [
      "Milio",
      "Pyke",
      3
    ],
    [
      "Renata",
      "Pyke",
      3
    ],
    [
      "Yuumi",
      "Brand",
      -3
    ],
    [
      "Vayne",
      "Mordekaiser",
      4
    ],
    [
      "Vayne",
      "Sett",
      3
    ],
    [
      "Vayne",
      "Garen",
      4
    ],
    [
      "Vayne",
      "Renekton",
      3
    ],
    [
      "Fiora",
      "Garen",
      4
    ],
    [
      "Fiora",
      "Mordekaiser",
      4
    ],
    [
      "Fiora",
      "Aatrox",
      3
    ],
    [
      "Fiora",
      "Darius",
      3
    ],
    [
      "Quinn",
      "Renekton",
      3
    ],
    [
      "Quinn",
      "Garen",
      4
    ],
    [
      "Teemo",
      "Darius",
      4
    ],
    [
      "Teemo",
      "Sett",
      3
    ],
    [
      "Teemo",
      "Aatrox",
      3
    ],
    [
      "Kennen",
      "Darius",
      3
    ],
    [
      "Aatrox",
      "Quinn",
      -3
    ],
    [
      "Volibear",
      "Vayne",
      -2
    ],
    [
      "Riven",
      "Volibear",
      3
    ],
    [
      "Riven",
      "Garen",
      3
    ],
    [
      "Camille",
      "Sett",
      3
    ],
    [
      "Camille",
      "Mordekaiser",
      4
    ],
    [
      "Darius",
      "Riven",
      3
    ],
    [
      "Darius",
      "Yorick",
      4
    ],
    [
      "Aatrox",
      "Sett",
      3
    ],
    [
      "Trundle",
      "Sion",
      3
    ],
    [
      "Trundle",
      "DrMundo",
      3
    ],
    [
      "Olaf",
      "Mordekaiser",
      4
    ],
    [
      "Olaf",
      "Vladimir",
      3
    ],
    [
      "Olaf",
      "Fiora",
      3
    ],
    [
      "Ambessa",
      "Sett",
      3
    ],
    [
      "Ambessa",
      "Riven",
      3
    ],
    [
      "KSante",
      "Darius",
      3
    ],
    [
      "KSante",
      "Sett",
      3
    ],
    [
      "Tryndamere",
      "Sett",
      3
    ],
    [
      "Yorick",
      "Quinn",
      3
    ],
    [
      "Zaahen",
      "Riven",
      3
    ],
    [
      "Zaahen",
      "Akali",
      3
    ],
    [
      "Zaahen",
      "Aatrox",
      3
    ],
    [
      "Zaahen",
      "Mordekaiser",
      3
    ],
    [
      "Quinn",
      "Zaahen",
      3
    ],
    [
      "Vayne",
      "Zaahen",
      3
    ],
    [
      "Teemo",
      "Zaahen",
      3
    ],
    [
      "Fiora",
      "Zaahen",
      3
    ],
    [
      "Zed",
      "Lux",
      3
    ],
    [
      "Zed",
      "Velkoz",
      3
    ],
    [
      "Zed",
      "Xerath",
      4
    ],
    [
      "Talon",
      "Anivia",
      4
    ],
    [
      "Talon",
      "Lux",
      4
    ],
    [
      "Talon",
      "Veigar",
      3
    ],
    [
      "Talon",
      "Velkoz",
      3
    ],
    [
      "Akali",
      "Veigar",
      3
    ],
    [
      "Akali",
      "Velkoz",
      3
    ],
    [
      "Akali",
      "Xerath",
      3
    ],
    [
      "Akali",
      "Karthus",
      3
    ],
    [
      "Leblanc",
      "Lux",
      4
    ],
    [
      "Leblanc",
      "Velkoz",
      3
    ],
    [
      "Leblanc",
      "Xerath",
      3
    ],
    [
      "Fizz",
      "Lux",
      3
    ],
    [
      "Fizz",
      "Veigar",
      3
    ],
    [
      "Fizz",
      "Anivia",
      3
    ],
    [
      "Fizz",
      "Velkoz",
      3
    ],
    [
      "Fizz",
      "Xerath",
      3
    ],
    [
      "Diana",
      "Lux",
      3
    ],
    [
      "Pantheon",
      "Zed",
      3
    ],
    [
      "Pantheon",
      "Fizz",
      3
    ],
    [
      "Annie",
      "Akali",
      3
    ],
    [
      "Lissandra",
      "Akali",
      3
    ],
    [
      "Lissandra",
      "Zed",
      3
    ],
    [
      "Lissandra",
      "Fizz",
      3
    ],
    [
      "Anivia",
      "Zed",
      -2
    ],
    [
      "Galio",
      "Zed",
      3
    ],
    [
      "Galio",
      "Leblanc",
      3
    ],
    [
      "Kassadin",
      "Veigar",
      3
    ],
    [
      "Kassadin",
      "Zed",
      -3
    ],
    [
      "Aurora",
      "Yasuo",
      3
    ],
    [
      "Aurora",
      "Yone",
      3
    ],
    [
      "Hwei",
      "Akali",
      3
    ],
    [
      "Naafiri",
      "Lux",
      3
    ],
    [
      "Naafiri",
      "Veigar",
      3
    ],
    [
      "Sylas",
      "Veigar",
      3
    ],
    [
      "Sylas",
      "Lux",
      3
    ],
    [
      "Twisted Fate",
      "Akali",
      2
    ],
    [
      "Lillia",
      "Khazix",
      3
    ],
    [
      "Vi",
      "Khazix",
      3
    ],
    [
      "Vi",
      "Rengar",
      3
    ],
    [
      "Pantheon",
      "Khazix",
      4
    ],
    [
      "Skarner",
      "Khazix",
      3
    ],
    [
      "Olaf",
      "Sejuani",
      3
    ],
    [
      "Olaf",
      "Maokai",
      3
    ],
    [
      "Olaf",
      "Zac",
      3
    ],
    [
      "Vi",
      "Sejuani",
      2
    ],
    [
      "Briar",
      "Sejuani",
      3
    ],
    [
      "Briar",
      "Karthus",
      3
    ],
    [
      "Hecarim",
      "Karthus",
      3
    ],
    [
      "Hecarim",
      "MasterYi",
      3
    ],
    [
      "Nocturne",
      "Karthus",
      3
    ],
    [
      "Nocturne",
      "Kindred",
      3
    ],
    [
      "Diana",
      "MasterYi",
      4
    ],
    [
      "JarvanIV",
      "MasterYi",
      4
    ],
    [
      "JarvanIV",
      "Khazix",
      3
    ],
    [
      "Sejuani",
      "Khazix",
      3
    ],
    [
      "Sejuani",
      "MasterYi",
      3
    ],
    [
      "Maokai",
      "Khazix",
      3
    ],
    [
      "Caitlyn",
      "Kalista",
      3
    ],
    [
      "Caitlyn",
      "Smolder",
      3
    ],
    [
      "Caitlyn",
      "KogMaw",
      3
    ],
    [
      "Draven",
      "KogMaw",
      4
    ],
    [
      "Draven",
      "Aphelios",
      3
    ],
    [
      "Draven",
      "Jinx",
      3
    ],
    [
      "Draven",
      "Sivir",
      3
    ],
    [
      "Draven",
      "Senna",
      -2
    ],
    [
      "Smolder",
      "Draven",
      -3
    ],
    [
      "Vayne",
      "Caitlyn",
      -2
    ],
    [
      "Senna",
      "Caitlyn",
      2
    ],
    [
      "Smolder",
      "Aphelios",
      1
    ],
    [
      "Janna",
      "Alistar",
      3
    ],
    [
      "Janna",
      "Nautilus",
      3
    ],
    [
      "Janna",
      "Rakan",
      3
    ],
    [
      "Lulu",
      "Alistar",
      3
    ],
    [
      "Soraka",
      "Pyke",
      4
    ],
    [
      "Soraka",
      "Lux",
      3
    ],
    [
      "Milio",
      "Leona",
      3
    ],
    [
      "Milio",
      "Nautilus",
      3
    ],
    [
      "Milio",
      "Blitzcrank",
      3
    ],
    [
      "Thresh",
      "Pyke",
      2
    ],
    [
      "Nautilus",
      "Thresh",
      2
    ],
    [
      "Lux",
      "Brand",
      -2
    ],
    [
      "Zyra",
      "Lux",
      -1
    ],
    [
      "Karma",
      "Brand",
      -1
    ],
    [
      "Senna",
      "Lux",
      2
    ],
    [
      "Senna",
      "Brand",
      2
    ],
    [
      "Bard",
      "Pyke",
      2
    ],
    [
      "Pyke",
      "Yuumi",
      5
    ],
    [
      "Rakan",
      "Yuumi",
      3
    ],
    [
      "Alistar",
      "Yuumi",
      4
    ],
    [
      "Pantheon",
      "Talon",
      3
    ],
    [
      "Pantheon",
      "Diana",
      3
    ],
    [
      "Pantheon",
      "Naafiri",
      3
    ],
    [
      "Pantheon",
      "Kassadin",
      3
    ],
    [
      "Pantheon",
      "Rengar",
      3
    ],
    [
      "Pantheon",
      "Evelynn",
      3
    ],
    [
      "Pantheon",
      "Ekko",
      3
    ],
    [
      "Pantheon",
      "Sylas",
      3
    ],
    [
      "Pantheon",
      "Qiyana",
      3
    ],
    [
      "Pantheon",
      "Katarina",
      3
    ],
    [
      "Pantheon",
      "Viego",
      3
    ],
    [
      "Annie",
      "Talon",
      3
    ],
    [
      "Annie",
      "Fizz",
      3
    ],
    [
      "Annie",
      "Diana",
      3
    ],
    [
      "Annie",
      "Naafiri",
      3
    ],
    [
      "Annie",
      "Kassadin",
      3
    ],
    [
      "Annie",
      "Ekko",
      3
    ],
    [
      "Annie",
      "Sylas",
      3
    ],
    [
      "Annie",
      "Qiyana",
      3
    ],
    [
      "Annie",
      "Katarina",
      3
    ],
    [
      "Annie",
      "Yone",
      3
    ],
    [
      "Lissandra",
      "Diana",
      3
    ],
    [
      "Lissandra",
      "Naafiri",
      3
    ],
    [
      "Lissandra",
      "Ekko",
      3
    ],
    [
      "Lissandra",
      "Sylas",
      3
    ],
    [
      "Lissandra",
      "Qiyana",
      3
    ],
    [
      "Lissandra",
      "Katarina",
      3
    ],
    [
      "Lissandra",
      "Yone",
      3
    ],
    [
      "Galio",
      "Talon",
      3
    ],
    [
      "Galio",
      "Fizz",
      3
    ],
    [
      "Galio",
      "Diana",
      3
    ],
    [
      "Galio",
      "Naafiri",
      3
    ],
    [
      "Galio",
      "Kassadin",
      3
    ],
    [
      "Galio",
      "Ekko",
      3
    ],
    [
      "Galio",
      "Sylas",
      3
    ],
    [
      "Galio",
      "Qiyana",
      3
    ],
    [
      "Galio",
      "Katarina",
      3
    ],
    [
      "Galio",
      "Yone",
      3
    ],
    [
      "Malzahar",
      "Akali",
      3
    ],
    [
      "Malzahar",
      "Zed",
      3
    ],
    [
      "Malzahar",
      "Talon",
      3
    ],
    [
      "Malzahar",
      "Fizz",
      3
    ],
    [
      "Malzahar",
      "Diana",
      3
    ],
    [
      "Malzahar",
      "Naafiri",
      3
    ],
    [
      "Malzahar",
      "Kassadin",
      3
    ],
    [
      "Malzahar",
      "Ekko",
      3
    ],
    [
      "Malzahar",
      "Sylas",
      3
    ],
    [
      "Malzahar",
      "Qiyana",
      3
    ],
    [
      "Malzahar",
      "Katarina",
      3
    ],
    [
      "Malzahar",
      "Yone",
      3
    ],
    [
      "Veigar",
      "Zed",
      3
    ],
    [
      "Veigar",
      "Diana",
      3
    ],
    [
      "Veigar",
      "Ekko",
      3
    ],
    [
      "Veigar",
      "Qiyana",
      3
    ],
    [
      "Veigar",
      "Katarina",
      3
    ],
    [
      "Veigar",
      "Yone",
      3
    ],
    [
      "Cassiopeia",
      "Zed",
      3
    ],
    [
      "Cassiopeia",
      "Fizz",
      3
    ],
    [
      "Cassiopeia",
      "Diana",
      3
    ],
    [
      "Cassiopeia",
      "Naafiri",
      3
    ],
    [
      "Cassiopeia",
      "Kassadin",
      3
    ],
    [
      "Cassiopeia",
      "Rengar",
      3
    ],
    [
      "Cassiopeia",
      "Ekko",
      3
    ],
    [
      "Cassiopeia",
      "Sylas",
      3
    ],
    [
      "Cassiopeia",
      "Qiyana",
      3
    ],
    [
      "Cassiopeia",
      "Katarina",
      3
    ],
    [
      "Cassiopeia",
      "Yone",
      3
    ],
    [
      "Quinn",
      "Mordekaiser",
      3
    ],
    [
      "Quinn",
      "Sion",
      3
    ],
    [
      "Quinn",
      "Volibear",
      3
    ],
    [
      "Quinn",
      "Tryndamere",
      3
    ],
    [
      "Quinn",
      "Olaf",
      3
    ],
    [
      "Quinn",
      "Ornn",
      3
    ],
    [
      "Quinn",
      "Chogath",
      3
    ],
    [
      "Quinn",
      "Nasus",
      3
    ],
    [
      "Quinn",
      "DrMundo",
      3
    ],
    [
      "Teemo",
      "Garen",
      3
    ],
    [
      "Teemo",
      "Mordekaiser",
      3
    ],
    [
      "Teemo",
      "Sion",
      3
    ],
    [
      "Teemo",
      "Volibear",
      3
    ],
    [
      "Teemo",
      "Olaf",
      3
    ],
    [
      "Teemo",
      "Ornn",
      3
    ],
    [
      "Teemo",
      "Chogath",
      3
    ],
    [
      "Teemo",
      "Nasus",
      3
    ],
    [
      "Teemo",
      "DrMundo",
      3
    ],
    [
      "Teemo",
      "Renekton",
      3
    ],
    [
      "Heimerdinger",
      "Garen",
      3
    ],
    [
      "Heimerdinger",
      "Mordekaiser",
      3
    ],
    [
      "Heimerdinger",
      "Sion",
      3
    ],
    [
      "Heimerdinger",
      "Volibear",
      3
    ],
    [
      "Heimerdinger",
      "Olaf",
      3
    ],
    [
      "Heimerdinger",
      "Sett",
      3
    ],
    [
      "Heimerdinger",
      "Ornn",
      3
    ],
    [
      "Heimerdinger",
      "Chogath",
      3
    ],
    [
      "Heimerdinger",
      "Nasus",
      3
    ],
    [
      "Heimerdinger",
      "DrMundo",
      3
    ],
    [
      "Heimerdinger",
      "Aatrox",
      3
    ],
    [
      "Heimerdinger",
      "Renekton",
      3
    ],
    [
      "Heimerdinger",
      "Darius",
      3
    ],
    [
      "Kennen",
      "Garen",
      3
    ],
    [
      "Kennen",
      "Mordekaiser",
      3
    ],
    [
      "Kennen",
      "Sion",
      3
    ],
    [
      "Kennen",
      "Volibear",
      3
    ],
    [
      "Kennen",
      "Tryndamere",
      3
    ],
    [
      "Kennen",
      "Olaf",
      3
    ],
    [
      "Kennen",
      "Sett",
      3
    ],
    [
      "Kennen",
      "Ornn",
      3
    ],
    [
      "Kennen",
      "Chogath",
      3
    ],
    [
      "Kennen",
      "Nasus",
      3
    ],
    [
      "Kennen",
      "DrMundo",
      3
    ],
    [
      "Gnar",
      "Garen",
      3
    ],
    [
      "Gnar",
      "Mordekaiser",
      3
    ],
    [
      "Gnar",
      "Sion",
      3
    ],
    [
      "Gnar",
      "Volibear",
      3
    ],
    [
      "Gnar",
      "Tryndamere",
      3
    ],
    [
      "Gnar",
      "Olaf",
      3
    ],
    [
      "Gnar",
      "Sett",
      3
    ],
    [
      "Gnar",
      "Ornn",
      3
    ],
    [
      "Gnar",
      "Chogath",
      3
    ],
    [
      "Gnar",
      "Nasus",
      3
    ],
    [
      "Gnar",
      "DrMundo",
      3
    ],
    [
      "Gnar",
      "Aatrox",
      3
    ],
    [
      "Gnar",
      "Darius",
      3
    ],
    [
      "Jayce",
      "Garen",
      3
    ],
    [
      "Jayce",
      "Mordekaiser",
      3
    ],
    [
      "Jayce",
      "Sion",
      3
    ],
    [
      "Jayce",
      "Volibear",
      3
    ],
    [
      "Jayce",
      "Tryndamere",
      3
    ],
    [
      "Jayce",
      "Olaf",
      3
    ],
    [
      "Jayce",
      "Sett",
      3
    ],
    [
      "Jayce",
      "Ornn",
      3
    ],
    [
      "Jayce",
      "Chogath",
      3
    ],
    [
      "Jayce",
      "Nasus",
      3
    ],
    [
      "Jayce",
      "DrMundo",
      3
    ],
    [
      "Jayce",
      "Renekton",
      3
    ],
    [
      "Jayce",
      "Darius",
      3
    ],
    [
      "Vayne",
      "Olaf",
      3
    ],
    [
      "Vayne",
      "Ornn",
      3
    ],
    [
      "Vayne",
      "DrMundo",
      3
    ],
    [
      "Vayne",
      "Aatrox",
      3
    ],
    [
      "Vayne",
      "Darius",
      3
    ],
    [
      "Aatrox",
      "Akali",
      2
    ],
    [
      "Aatrox",
      "Riven",
      2
    ],
    [
      "Aatrox",
      "Pantheon",
      2
    ],
    [
      "Vladimir",
      "Riven",
      2
    ],
    [
      "Vladimir",
      "Camille",
      2
    ],
    [
      "Vladimir",
      "Pantheon",
      2
    ],
    [
      "Vladimir",
      "Kennen",
      2
    ],
    [
      "Vladimir",
      "Jayce",
      2
    ],
    [
      "Trundle",
      "Akali",
      2
    ],
    [
      "Trundle",
      "Riven",
      2
    ],
    [
      "Trundle",
      "Camille",
      2
    ],
    [
      "Trundle",
      "Pantheon",
      2
    ],
    [
      "Trundle",
      "Kennen",
      2
    ],
    [
      "Trundle",
      "Jayce",
      2
    ],
    [
      "Volibear",
      "Akali",
      2
    ],
    [
      "Volibear",
      "Camille",
      2
    ],
    [
      "Volibear",
      "Pantheon",
      2
    ],
    [
      "DrMundo",
      "Akali",
      2
    ],
    [
      "DrMundo",
      "Riven",
      2
    ],
    [
      "DrMundo",
      "Camille",
      2
    ],
    [
      "DrMundo",
      "Pantheon",
      2
    ],
    [
      "Garen",
      "Akali",
      2
    ],
    [
      "Garen",
      "Camille",
      2
    ],
    [
      "Garen",
      "Pantheon",
      2
    ],
    [
      "Yorick",
      "Akali",
      2
    ],
    [
      "Yorick",
      "Riven",
      2
    ],
    [
      "Yorick",
      "Camille",
      2
    ],
    [
      "Yorick",
      "Pantheon",
      2
    ],
    [
      "Yorick",
      "Kennen",
      2
    ],
    [
      "Yorick",
      "Jayce",
      2
    ],
    [
      "Sett",
      "Akali",
      2
    ],
    [
      "Sett",
      "Riven",
      2
    ],
    [
      "Sett",
      "Pantheon",
      2
    ],
    [
      "Nasus",
      "Akali",
      2
    ],
    [
      "Nasus",
      "Riven",
      2
    ],
    [
      "Nasus",
      "Camille",
      2
    ],
    [
      "Nasus",
      "Pantheon",
      2
    ],
    [
      "Olaf",
      "Akali",
      2
    ],
    [
      "Olaf",
      "Riven",
      2
    ],
    [
      "Olaf",
      "Camille",
      2
    ],
    [
      "Olaf",
      "Pantheon",
      2
    ],
    [
      "Mordekaiser",
      "Akali",
      2
    ],
    [
      "Mordekaiser",
      "Riven",
      2
    ],
    [
      "Vayne",
      "Maokai",
      3
    ],
    [
      "Vayne",
      "TahmKench",
      3
    ],
    [
      "Fiora",
      "Sion",
      3
    ],
    [
      "Fiora",
      "DrMundo",
      3
    ],
    [
      "Fiora",
      "Chogath",
      3
    ],
    [
      "Fiora",
      "Ornn",
      3
    ],
    [
      "Fiora",
      "Nasus",
      3
    ],
    [
      "Fiora",
      "Maokai",
      3
    ],
    [
      "Fiora",
      "TahmKench",
      3
    ],
    [
      "Fiora",
      "Volibear",
      3
    ],
    [
      "Twitch",
      "Chogath",
      3
    ],
    [
      "Twitch",
      "Maokai",
      3
    ],
    [
      "Twitch",
      "Mordekaiser",
      3
    ],
    [
      "Twitch",
      "Volibear",
      3
    ],
    [
      "Belveth",
      "Chogath",
      3
    ],
    [
      "Belveth",
      "Maokai",
      3
    ],
    [
      "Belveth",
      "Mordekaiser",
      3
    ],
    [
      "Belveth",
      "Volibear",
      3
    ],
    [
      "Draven",
      "Yunara",
      2
    ],
    [
      "Lucian",
      "Smolder",
      2
    ],
    [
      "Lucian",
      "KogMaw",
      2
    ],
    [
      "Lucian",
      "Senna",
      2
    ],
    [
      "Lucian",
      "Kayle",
      2
    ],
    [
      "Lucian",
      "Vladimir",
      2
    ],
    [
      "Lucian",
      "Yunara",
      2
    ],
    [
      "Lucian",
      "AurelionSol",
      2
    ],
    [
      "Lucian",
      "Veigar",
      2
    ],
    [
      "Pantheon",
      "Senna",
      2
    ],
    [
      "Pantheon",
      "Vayne",
      2
    ],
    [
      "Pantheon",
      "Kayle",
      2
    ],
    [
      "Pantheon",
      "AurelionSol",
      2
    ],
    [
      "Pantheon",
      "Veigar",
      2
    ],
    [
      "Renekton",
      "Kayle",
      2
    ],
    [
      "Renekton",
      "Vladimir",
      2
    ],
    [
      "Renekton",
      "Nasus",
      2
    ],
    [
      "Tristana",
      "Smolder",
      2
    ],
    [
      "Tristana",
      "KogMaw",
      2
    ],
    [
      "Tristana",
      "Senna",
      2
    ],
    [
      "Tristana",
      "Kayle",
      2
    ],
    [
      "Tristana",
      "Vladimir",
      2
    ],
    [
      "Tristana",
      "Yunara",
      2
    ],
    [
      "Tristana",
      "AurelionSol",
      2
    ],
    [
      "Tristana",
      "Veigar",
      2
    ],
    [
      "Malphite",
      "Xerath",
      2
    ],
    [
      "Malphite",
      "Velkoz",
      2
    ],
    [
      "Malphite",
      "Heimerdinger",
      2
    ],
    [
      "Malphite",
      "Lux",
      2
    ],
    [
      "Malphite",
      "Veigar",
      2
    ],
    [
      "Amumu",
      "Xerath",
      2
    ],
    [
      "Amumu",
      "Velkoz",
      2
    ],
    [
      "Amumu",
      "Heimerdinger",
      2
    ],
    [
      "Amumu",
      "Lux",
      2
    ],
    [
      "Amumu",
      "Veigar",
      2
    ],
    [
      "Diana",
      "Xerath",
      2
    ],
    [
      "Diana",
      "Velkoz",
      2
    ],
    [
      "Diana",
      "Heimerdinger",
      2
    ],
    [
      "Diana",
      "Ziggs",
      2
    ],
    [
      "Diana",
      "Corki",
      2
    ],
    [
      "Pantheon",
      "Xerath",
      2
    ],
    [
      "Pantheon",
      "Velkoz",
      2
    ],
    [
      "Pantheon",
      "Heimerdinger",
      2
    ],
    [
      "Pantheon",
      "Lux",
      2
    ],
    [
      "Pantheon",
      "Ziggs",
      2
    ],
    [
      "Pantheon",
      "Corki",
      2
    ],
    [
      "Galio",
      "Xerath",
      2
    ],
    [
      "Galio",
      "Velkoz",
      2
    ],
    [
      "Galio",
      "Heimerdinger",
      2
    ],
    [
      "Galio",
      "Lux",
      2
    ],
    [
      "Galio",
      "Ziggs",
      2
    ],
    [
      "Galio",
      "Corki",
      2
    ],
    [
      "Galio",
      "Veigar",
      2
    ],
    [
      "Lillia",
      "Heimerdinger",
      2
    ],
    [
      "Nocturne",
      "Xerath",
      2
    ],
    [
      "Nocturne",
      "Velkoz",
      2
    ],
    [
      "Nocturne",
      "Heimerdinger",
      2
    ],
    [
      "Nocturne",
      "Lux",
      2
    ],
    [
      "Nocturne",
      "Ziggs",
      2
    ],
    [
      "Nocturne",
      "Corki",
      2
    ],
    [
      "Nocturne",
      "Veigar",
      2
    ],
    [
      "Blitzcrank",
      "Soraka",
      2
    ],
    [
      "Blitzcrank",
      "Janna",
      2
    ],
    [
      "Blitzcrank",
      "Sona",
      2
    ],
    [
      "Blitzcrank",
      "Nami",
      2
    ],
    [
      "Blitzcrank",
      "Lulu",
      2
    ],
    [
      "Blitzcrank",
      "Seraphine",
      2
    ],
    [
      "Blitzcrank",
      "Renata",
      2
    ],
    [
      "Pyke",
      "Sona",
      2
    ],
    [
      "Pyke",
      "Nami",
      2
    ],
    [
      "Pyke",
      "Karma",
      2
    ],
    [
      "Pyke",
      "Seraphine",
      2
    ],
    [
      "Thresh",
      "Soraka",
      2
    ],
    [
      "Thresh",
      "Yuumi",
      2
    ],
    [
      "Thresh",
      "Janna",
      2
    ],
    [
      "Thresh",
      "Sona",
      2
    ],
    [
      "Thresh",
      "Nami",
      2
    ],
    [
      "Thresh",
      "Karma",
      2
    ],
    [
      "Thresh",
      "Milio",
      2
    ],
    [
      "Thresh",
      "Lulu",
      2
    ],
    [
      "Thresh",
      "Seraphine",
      2
    ],
    [
      "Thresh",
      "Renata",
      2
    ],
    [
      "Nautilus",
      "Soraka",
      2
    ],
    [
      "Nautilus",
      "Sona",
      2
    ],
    [
      "Nautilus",
      "Nami",
      2
    ],
    [
      "Nautilus",
      "Karma",
      2
    ],
    [
      "Nautilus",
      "Lulu",
      2
    ],
    [
      "Nautilus",
      "Seraphine",
      2
    ],
    [
      "Nautilus",
      "Renata",
      2
    ],
    [
      "Morgana",
      "Soraka",
      2
    ],
    [
      "Morgana",
      "Yuumi",
      2
    ],
    [
      "Morgana",
      "Janna",
      2
    ],
    [
      "Morgana",
      "Sona",
      2
    ],
    [
      "Morgana",
      "Nami",
      2
    ],
    [
      "Morgana",
      "Karma",
      2
    ],
    [
      "Morgana",
      "Milio",
      2
    ],
    [
      "Morgana",
      "Lulu",
      2
    ],
    [
      "Morgana",
      "Seraphine",
      2
    ],
    [
      "Morgana",
      "Renata",
      2
    ],
    [
      "Leona",
      "Soraka",
      2
    ],
    [
      "Leona",
      "Sona",
      2
    ],
    [
      "Leona",
      "Nami",
      2
    ],
    [
      "Leona",
      "Karma",
      2
    ],
    [
      "Leona",
      "Seraphine",
      2
    ],
    [
      "Alistar",
      "Soraka",
      2
    ],
    [
      "Alistar",
      "Sona",
      2
    ],
    [
      "Alistar",
      "Nami",
      2
    ],
    [
      "Alistar",
      "Karma",
      2
    ],
    [
      "Alistar",
      "Milio",
      2
    ],
    [
      "Alistar",
      "Seraphine",
      2
    ],
    [
      "Rell",
      "Soraka",
      2
    ],
    [
      "Rell",
      "Yuumi",
      2
    ],
    [
      "Rell",
      "Janna",
      2
    ],
    [
      "Rell",
      "Sona",
      2
    ],
    [
      "Rell",
      "Nami",
      2
    ],
    [
      "Rell",
      "Karma",
      2
    ],
    [
      "Rell",
      "Milio",
      2
    ],
    [
      "Rell",
      "Lulu",
      2
    ],
    [
      "Rell",
      "Seraphine",
      2
    ],
    [
      "Braum",
      "Soraka",
      2
    ],
    [
      "Braum",
      "Yuumi",
      2
    ],
    [
      "Braum",
      "Janna",
      2
    ],
    [
      "Braum",
      "Sona",
      2
    ],
    [
      "Braum",
      "Nami",
      2
    ],
    [
      "Braum",
      "Karma",
      2
    ],
    [
      "Braum",
      "Milio",
      2
    ],
    [
      "Braum",
      "Lulu",
      2
    ],
    [
      "Braum",
      "Seraphine",
      2
    ],
    [
      "TahmKench",
      "Soraka",
      2
    ],
    [
      "TahmKench",
      "Yuumi",
      2
    ],
    [
      "TahmKench",
      "Janna",
      2
    ],
    [
      "TahmKench",
      "Sona",
      2
    ],
    [
      "TahmKench",
      "Nami",
      2
    ],
    [
      "TahmKench",
      "Karma",
      2
    ],
    [
      "TahmKench",
      "Milio",
      2
    ],
    [
      "TahmKench",
      "Lulu",
      2
    ],
    [
      "TahmKench",
      "Seraphine",
      2
    ],
    [
      "Bard",
      "Soraka",
      2
    ],
    [
      "Bard",
      "Yuumi",
      2
    ],
    [
      "Bard",
      "Janna",
      2
    ],
    [
      "Bard",
      "Sona",
      2
    ],
    [
      "Bard",
      "Nami",
      2
    ],
    [
      "Bard",
      "Karma",
      2
    ],
    [
      "Bard",
      "Milio",
      2
    ],
    [
      "Bard",
      "Lulu",
      2
    ],
    [
      "Bard",
      "Seraphine",
      2
    ],
    [
      "Brand",
      "Janna",
      2
    ],
    [
      "Brand",
      "Nami",
      2
    ],
    [
      "Brand",
      "Lulu",
      2
    ],
    [
      "Brand",
      "Milio",
      2
    ],
    [
      "Brand",
      "Renata",
      2
    ],
    [
      "Brand",
      "Seraphine",
      2
    ],
    [
      "Zyra",
      "Soraka",
      2
    ],
    [
      "Zyra",
      "Yuumi",
      2
    ],
    [
      "Zyra",
      "Sona",
      2
    ],
    [
      "Zyra",
      "Nami",
      2
    ],
    [
      "Zyra",
      "Lulu",
      2
    ],
    [
      "Zyra",
      "Milio",
      2
    ],
    [
      "Zyra",
      "Karma",
      2
    ],
    [
      "Zyra",
      "Renata",
      2
    ],
    [
      "Zyra",
      "Seraphine",
      2
    ],
    [
      "Velkoz",
      "Janna",
      2
    ],
    [
      "Velkoz",
      "Soraka",
      2
    ],
    [
      "Velkoz",
      "Yuumi",
      2
    ],
    [
      "Velkoz",
      "Sona",
      2
    ],
    [
      "Velkoz",
      "Nami",
      2
    ],
    [
      "Velkoz",
      "Lulu",
      2
    ],
    [
      "Velkoz",
      "Milio",
      2
    ],
    [
      "Velkoz",
      "Karma",
      2
    ],
    [
      "Velkoz",
      "Renata",
      2
    ],
    [
      "Velkoz",
      "Seraphine",
      2
    ],
    [
      "Xerath",
      "Janna",
      2
    ],
    [
      "Xerath",
      "Soraka",
      2
    ],
    [
      "Xerath",
      "Yuumi",
      2
    ],
    [
      "Xerath",
      "Sona",
      2
    ],
    [
      "Xerath",
      "Nami",
      2
    ],
    [
      "Xerath",
      "Lulu",
      2
    ],
    [
      "Xerath",
      "Milio",
      2
    ],
    [
      "Xerath",
      "Karma",
      2
    ],
    [
      "Xerath",
      "Renata",
      2
    ],
    [
      "Xerath",
      "Seraphine",
      2
    ],
    [
      "Lux",
      "Janna",
      2
    ],
    [
      "Lux",
      "Yuumi",
      2
    ],
    [
      "Lux",
      "Sona",
      2
    ],
    [
      "Lux",
      "Nami",
      2
    ],
    [
      "Lux",
      "Lulu",
      2
    ],
    [
      "Lux",
      "Milio",
      2
    ],
    [
      "Lux",
      "Karma",
      2
    ],
    [
      "Lux",
      "Renata",
      2
    ],
    [
      "Lux",
      "Seraphine",
      2
    ],
    [
      "LeeSin",
      "Karthus",
      2
    ],
    [
      "LeeSin",
      "MasterYi",
      2
    ],
    [
      "LeeSin",
      "Shyvana",
      2
    ],
    [
      "LeeSin",
      "Kindred",
      2
    ],
    [
      "XinZhao",
      "Karthus",
      2
    ],
    [
      "XinZhao",
      "MasterYi",
      2
    ],
    [
      "XinZhao",
      "Shyvana",
      2
    ],
    [
      "XinZhao",
      "Kindred",
      2
    ],
    [
      "Pantheon",
      "Karthus",
      2
    ],
    [
      "Pantheon",
      "MasterYi",
      2
    ],
    [
      "Pantheon",
      "Shyvana",
      2
    ],
    [
      "Pantheon",
      "Kindred",
      2
    ],
    [
      "Elise",
      "Karthus",
      2
    ],
    [
      "Elise",
      "MasterYi",
      2
    ],
    [
      "Elise",
      "Shyvana",
      2
    ],
    [
      "Elise",
      "Kindred",
      2
    ],
    [
      "Graves",
      "Karthus",
      2
    ],
    [
      "Graves",
      "MasterYi",
      2
    ],
    [
      "Graves",
      "Shyvana",
      2
    ],
    [
      "Graves",
      "Kindred",
      2
    ],
    [
      "Nidalee",
      "Karthus",
      2
    ],
    [
      "Nidalee",
      "MasterYi",
      2
    ],
    [
      "Nidalee",
      "Shyvana",
      2
    ],
    [
      "Nidalee",
      "Kindred",
      2
    ],
    [
      "RekSai",
      "Karthus",
      2
    ],
    [
      "RekSai",
      "MasterYi",
      2
    ],
    [
      "RekSai",
      "Shyvana",
      2
    ],
    [
      "RekSai",
      "Kindred",
      2
    ],
    [
      "Vayne",
      "Rammus",
      2
    ],
    [
      "Fiora",
      "Rammus",
      2
    ],
    [
      "Twitch",
      "Rammus",
      2
    ],
    [
      "Twitch",
      "Zac",
      2
    ],
    [
      "Belveth",
      "Rammus",
      2
    ],
    [
      "Belveth",
      "Zac",
      2
    ],
    [
      "Kayle",
      "Sion",
      2
    ],
    [
      "Kayle",
      "Maokai",
      2
    ],
    [
      "Kayle",
      "Ornn",
      2
    ],
    [
      "Kayle",
      "Chogath",
      2
    ],
    [
      "Kayle",
      "Sett",
      2
    ],
    [
      "Kayle",
      "DrMundo",
      2
    ],
    [
      "Kayle",
      "Mordekaiser",
      2
    ],
    [
      "Kayle",
      "Volibear",
      2
    ],
    [
      "Kayle",
      "Nasus",
      2
    ],
    [
      "Kayle",
      "TahmKench",
      2
    ],
    [
      "Kayle",
      "Garen",
      2
    ],
    [
      "Kayle",
      "Rammus",
      2
    ],
    [
      "Gwen",
      "Sion",
      2
    ],
    [
      "Gwen",
      "Maokai",
      2
    ],
    [
      "Gwen",
      "Ornn",
      2
    ],
    [
      "Gwen",
      "Chogath",
      2
    ],
    [
      "Gwen",
      "Sett",
      2
    ],
    [
      "Gwen",
      "DrMundo",
      2
    ],
    [
      "Gwen",
      "Mordekaiser",
      2
    ],
    [
      "Gwen",
      "Volibear",
      2
    ],
    [
      "Gwen",
      "Nasus",
      2
    ],
    [
      "Gwen",
      "TahmKench",
      2
    ],
    [
      "Gwen",
      "Garen",
      2
    ],
    [
      "Gwen",
      "Rammus",
      2
    ],
    [
      "Gwen",
      "Zac",
      2
    ],
    [
      "Xerath",
      "Sylas",
      2
    ],
    [
      "Xerath",
      "Talon",
      2
    ],
    [
      "Xerath",
      "Naafiri",
      2
    ],
    [
      "Xerath",
      "Yone",
      2
    ],
    [
      "Velkoz",
      "Kassadin",
      2
    ],
    [
      "Velkoz",
      "Sylas",
      2
    ],
    [
      "Velkoz",
      "Naafiri",
      2
    ],
    [
      "Velkoz",
      "Yasuo",
      2
    ],
    [
      "Velkoz",
      "Yone",
      2
    ],
    [
      "Lux",
      "Kassadin",
      2
    ],
    [
      "Lux",
      "Yasuo",
      2
    ],
    [
      "Lux",
      "Yone",
      2
    ],
    [
      "Karma",
      "Akali",
      2
    ],
    [
      "Karma",
      "Fizz",
      2
    ],
    [
      "Karma",
      "Kassadin",
      2
    ],
    [
      "Karma",
      "Talon",
      2
    ],
    [
      "Karma",
      "Naafiri",
      2
    ],
    [
      "Karma",
      "Yasuo",
      2
    ],
    [
      "Brand",
      "Akali",
      2
    ],
    [
      "Brand",
      "Fizz",
      2
    ],
    [
      "Brand",
      "Kassadin",
      2
    ],
    [
      "Brand",
      "Sylas",
      2
    ],
    [
      "Brand",
      "Talon",
      2
    ],
    [
      "Brand",
      "Naafiri",
      2
    ],
    [
      "Brand",
      "Yasuo",
      2
    ],
    [
      "Brand",
      "Yone",
      2
    ],
    [
      "Ziggs",
      "Akali",
      2
    ],
    [
      "Ziggs",
      "Fizz",
      2
    ],
    [
      "Ziggs",
      "Kassadin",
      2
    ],
    [
      "Ziggs",
      "Sylas",
      2
    ],
    [
      "Ziggs",
      "Talon",
      2
    ],
    [
      "Ziggs",
      "Naafiri",
      2
    ],
    [
      "Ziggs",
      "Yasuo",
      2
    ],
    [
      "Ziggs",
      "Yone",
      2
    ],
    [
      "Heimerdinger",
      "Akali",
      2
    ],
    [
      "Heimerdinger",
      "Fizz",
      2
    ],
    [
      "Heimerdinger",
      "Kassadin",
      2
    ],
    [
      "Heimerdinger",
      "Sylas",
      2
    ],
    [
      "Heimerdinger",
      "Talon",
      2
    ],
    [
      "Heimerdinger",
      "Naafiri",
      2
    ],
    [
      "Heimerdinger",
      "Yasuo",
      2
    ],
    [
      "Heimerdinger",
      "Yone",
      2
    ],
    [
      "Kayle",
      "Tryndamere",
      2
    ],
    [
      "Mordekaiser",
      "Nasus",
      3
    ],
    [
      "Olaf",
      "Volibear",
      3
    ],
    [
      "Trundle",
      "Volibear",
      2
    ],
    [
      "Trundle",
      "Garen",
      2
    ],
    [
      "Darius",
      "Sett",
      2
    ],
    [
      "Teemo",
      "Trundle",
      3
    ],
    [
      "Singed",
      "Olaf",
      3
    ],
    [
      "Singed",
      "Garen",
      3
    ],
    [
      "Pantheon",
      "Twitch",
      2
    ],
    [
      "Pantheon",
      "Pyke",
      2
    ],
    [
      "Pantheon",
      "Shaco",
      2
    ],
    [
      "Pantheon",
      "Teemo",
      2
    ],
    [
      "LeeSin",
      "Twitch",
      2
    ],
    [
      "LeeSin",
      "Evelynn",
      2
    ],
    [
      "LeeSin",
      "Khazix",
      2
    ],
    [
      "LeeSin",
      "Rengar",
      2
    ],
    [
      "LeeSin",
      "Shaco",
      2
    ],
    [
      "Karthus",
      "Twitch",
      2
    ],
    [
      "Karthus",
      "Evelynn",
      2
    ],
    [
      "Karthus",
      "Khazix",
      2
    ],
    [
      "Karthus",
      "Pyke",
      2
    ],
    [
      "Karthus",
      "Rengar",
      2
    ],
    [
      "Karthus",
      "Shaco",
      2
    ],
    [
      "Karthus",
      "Teemo",
      2
    ],
    [
      "Galio",
      "Ahri",
      3
    ],
    [
      "Diana",
      "Kassadin",
      2
    ],
    [
      "Cassiopeia",
      "Yasuo",
      4
    ],
    [
      "Anivia",
      "Cassiopeia",
      2
    ],
    [
      "Renata",
      "Yasuo",
      2
    ],
    [
      "Vex",
      "Ahri",
      2
    ],
    [
      "Mel",
      "Sylas",
      2
    ],
    [
      "Olaf",
      "Kayn",
      3
    ],
    [
      "Olaf",
      "Lillia",
      3
    ],
    [
      "Vi",
      "Lillia",
      2
    ],
    [
      "Lillia",
      "MasterYi",
      2
    ],
    [
      "Sejuani",
      "Diana",
      2
    ],
    [
      "Skarner",
      "Rengar",
      2
    ],
    [
      "Briar",
      "MasterYi",
      3
    ],
    [
      "Briar",
      "Lillia",
      3
    ],
    [
      "Kindred",
      "Briar",
      2
    ],
    [
      "Diana",
      "Khazix",
      2
    ],
    [
      "Diana",
      "Rengar",
      2
    ],
    [
      "RekSai",
      "Evelynn",
      2
    ],
    [
      "Graves",
      "Evelynn",
      3
    ],
    [
      "XinZhao",
      "Khazix",
      2
    ],
    [
      "Lillia",
      "Nocturne",
      2
    ],
    [
      "Shaco",
      "Twitch",
      2
    ],
    [
      "Fiddlesticks",
      "Briar",
      2
    ],
    [
      "Fiddlesticks",
      "Khazix",
      2
    ],
    [
      "Caitlyn",
      "Yunara",
      3
    ],
    [
      "Kalista",
      "Yunara",
      2
    ],
    [
      "Yunara",
      "KogMaw",
      2
    ],
    [
      "Aphelios",
      "Sivir",
      2
    ],
    [
      "Jhin",
      "Aphelios",
      2
    ],
    [
      "Kaisa",
      "Aphelios",
      2
    ],
    [
      "Jinx",
      "Aphelios",
      2
    ],
    [
      "MissFortune",
      "Aphelios",
      2
    ],
    [
      "Ezreal",
      "Kalista",
      2
    ],
    [
      "Twitch",
      "Aphelios",
      2
    ],
    [
      "Smolder",
      "Jinx",
      2
    ],
    [
      "Sivir",
      "Jhin",
      2
    ],
    [
      "Draven",
      "Tristana",
      2
    ],
    [
      "Kalista",
      "Sivir",
      2
    ],
    [
      "Bard",
      "Brand",
      2
    ],
    [
      "TahmKench",
      "Pyke",
      3
    ],
    [
      "Vayne",
      "Camille",
      2
    ],
    [
      "Ahri",
      "Veigar",
      3
    ],
    [
      "Ahri",
      "Karthus",
      3
    ],
    [
      "Ahri",
      "Xerath",
      3
    ],
    [
      "Ahri",
      "Lux",
      3
    ],
    [
      "Annie",
      "Ahri",
      2
    ],
    [
      "Ambessa",
      "Mordekaiser",
      2
    ],
    [
      "Ambessa",
      "Garen",
      2
    ],
    [
      "Ambessa",
      "Nasus",
      2
    ],
    [
      "Quinn",
      "Ambessa",
      2
    ],
    [
      "Vayne",
      "Ambessa",
      2
    ],
    [
      "Caitlyn",
      "Aphelios",
      3
    ],
    [
      "Lucian",
      "Aphelios",
      2
    ],
    [
      "Pantheon",
      "Aphelios",
      2
    ],
    [
      "Caitlyn",
      "Ashe",
      2
    ],
    [
      "Draven",
      "Ashe",
      2
    ],
    [
      "Lucian",
      "Ashe",
      2
    ],
    [
      "Pantheon",
      "Ashe",
      2
    ],
    [
      "Talon",
      "AurelionSol",
      3
    ],
    [
      "Zed",
      "AurelionSol",
      3
    ],
    [
      "Annie",
      "AurelionSol",
      3
    ],
    [
      "Pantheon",
      "Aurora",
      2
    ],
    [
      "Talon",
      "Aurora",
      2
    ],
    [
      "Annie",
      "Aurora",
      2
    ],
    [
      "Pantheon",
      "Azir",
      4
    ],
    [
      "Talon",
      "Azir",
      4
    ],
    [
      "Zed",
      "Azir",
      3
    ],
    [
      "Fizz",
      "Azir",
      3
    ],
    [
      "Diana",
      "Azir",
      3
    ],
    [
      "Akali",
      "Azir",
      3
    ],
    [
      "Lissandra",
      "Akshan",
      2
    ],
    [
      "Malzahar",
      "Akshan",
      2
    ],
    [
      "Pantheon",
      "Akshan",
      2
    ],
    [
      "Lucian",
      "Corki",
      2
    ],
    [
      "Caitlyn",
      "Corki",
      2
    ],
    [
      "Draven",
      "Corki",
      2
    ],
    [
      "Skarner",
      "Elise",
      2
    ],
    [
      "Maokai",
      "Elise",
      2
    ],
    [
      "Tristana",
      "Ezreal",
      2
    ],
    [
      "Pantheon",
      "Ezreal",
      2
    ],
    [
      "Olaf",
      "Fiddlesticks",
      4
    ],
    [
      "Pantheon",
      "Fiddlesticks",
      3
    ],
    [
      "LeeSin",
      "Fiddlesticks",
      3
    ],
    [
      "Vi",
      "Fiddlesticks",
      3
    ],
    [
      "Diana",
      "Fiddlesticks",
      2
    ],
    [
      "Karthus",
      "Fiddlesticks",
      2
    ],
    [
      "Pantheon",
      "Gragas",
      3
    ],
    [
      "Annie",
      "Gragas",
      2
    ],
    [
      "Veigar",
      "Gragas",
      2
    ],
    [
      "Lux",
      "Gragas",
      2
    ],
    [
      "Pantheon",
      "Hwei",
      3
    ],
    [
      "Talon",
      "Hwei",
      3
    ],
    [
      "Naafiri",
      "Hwei",
      2
    ],
    [
      "Annie",
      "Hwei",
      2
    ],
    [
      "Vayne",
      "Illaoi",
      3
    ],
    [
      "Quinn",
      "Illaoi",
      4
    ],
    [
      "Teemo",
      "Illaoi",
      4
    ],
    [
      "Heimerdinger",
      "Illaoi",
      4
    ],
    [
      "Camille",
      "Illaoi",
      2
    ],
    [
      "Pantheon",
      "Irelia",
      4
    ],
    [
      "Annie",
      "Irelia",
      3
    ],
    [
      "Veigar",
      "Irelia",
      3
    ],
    [
      "Lissandra",
      "Irelia",
      3
    ],
    [
      "Anivia",
      "Irelia",
      3
    ],
    [
      "Olaf",
      "Ivern",
      3
    ],
    [
      "MasterYi",
      "Ivern",
      3
    ],
    [
      "Kindred",
      "Ivern",
      2
    ],
    [
      "Briar",
      "Ivern",
      2
    ],
    [
      "Olaf",
      "JarvanIV",
      2
    ],
    [
      "Karthus",
      "JarvanIV",
      2
    ],
    [
      "Vayne",
      "Jax",
      3
    ],
    [
      "Fiora",
      "Jax",
      3
    ],
    [
      "Quinn",
      "Jax",
      3
    ],
    [
      "Teemo",
      "Jax",
      3
    ],
    [
      "Draven",
      "Jhin",
      2
    ],
    [
      "Tristana",
      "Jhin",
      2
    ],
    [
      "Pantheon",
      "Jhin",
      2
    ],
    [
      "Lucian",
      "Jinx",
      2
    ],
    [
      "Pantheon",
      "Jinx",
      2
    ],
    [
      "Caitlyn",
      "Jinx",
      2
    ],
    [
      "Vayne",
      "KSante",
      4
    ],
    [
      "Fiora",
      "KSante",
      3
    ],
    [
      "Olaf",
      "KSante",
      3
    ],
    [
      "Caitlyn",
      "Kaisa",
      2
    ],
    [
      "Draven",
      "Kaisa",
      2
    ],
    [
      "Lucian",
      "Kaisa",
      2
    ],
    [
      "Draven",
      "Kalista",
      2
    ],
    [
      "Lucian",
      "Kalista",
      2
    ],
    [
      "Pantheon",
      "Kayn",
      3
    ],
    [
      "Annie",
      "Kayn",
      2
    ],
    [
      "Vayne",
      "Kled",
      3
    ],
    [
      "Quinn",
      "Kled",
      3
    ],
    [
      "Pantheon",
      "Kled",
      2
    ],
    [
      "Pantheon",
      "Mel",
      2
    ],
    [
      "Talon",
      "Mel",
      2
    ],
    [
      "Annie",
      "Mel",
      2
    ],
    [
      "Draven",
      "MissFortune",
      2
    ],
    [
      "Pantheon",
      "MissFortune",
      2
    ],
    [
      "Pantheon",
      "MonkeyKing",
      2
    ],
    [
      "Olaf",
      "MonkeyKing",
      2
    ],
    [
      "Pantheon",
      "Neeko",
      3
    ],
    [
      "Talon",
      "Neeko",
      3
    ],
    [
      "Annie",
      "Neeko",
      2
    ],
    [
      "Olaf",
      "Nidalee",
      3
    ],
    [
      "Maokai",
      "Nidalee",
      2
    ],
    [
      "Caitlyn",
      "Nilah",
      3
    ],
    [
      "Draven",
      "Nilah",
      3
    ],
    [
      "Lucian",
      "Nilah",
      2
    ],
    [
      "Olaf",
      "Nunu",
      4
    ],
    [
      "Pantheon",
      "Nunu",
      3
    ],
    [
      "LeeSin",
      "Nunu",
      3
    ],
    [
      "Vi",
      "Nunu",
      3
    ],
    [
      "Pantheon",
      "Orianna",
      2
    ],
    [
      "Talon",
      "Orianna",
      2
    ],
    [
      "Akali",
      "Orianna",
      2
    ],
    [
      "Vayne",
      "Poppy",
      2
    ],
    [
      "Fiora",
      "Poppy",
      2
    ],
    [
      "Quinn",
      "Poppy",
      3
    ],
    [
      "Brand",
      "Rakan",
      2
    ],
    [
      "Zyra",
      "Rakan",
      2
    ],
    [
      "Leona",
      "Rakan",
      2
    ],
    [
      "Vayne",
      "Rumble",
      3
    ],
    [
      "Quinn",
      "Rumble",
      3
    ],
    [
      "Pantheon",
      "Rumble",
      2
    ],
    [
      "Pantheon",
      "Ryze",
      3
    ],
    [
      "Talon",
      "Ryze",
      3
    ],
    [
      "Annie",
      "Ryze",
      2
    ],
    [
      "Pantheon",
      "Samira",
      2
    ],
    [
      "Annie",
      "Samira",
      2
    ],
    [
      "Caitlyn",
      "Samira",
      2
    ],
    [
      "Olaf",
      "Shen",
      2
    ],
    [
      "Vayne",
      "Shen",
      3
    ],
    [
      "Trundle",
      "Shen",
      2
    ],
    [
      "Pantheon",
      "Singed",
      2
    ],
    [
      "Vayne",
      "Singed",
      3
    ],
    [
      "Quinn",
      "Singed",
      3
    ],
    [
      "Vayne",
      "Skarner",
      3
    ],
    [
      "Fiora",
      "Skarner",
      2
    ],
    [
      "Olaf",
      "Skarner",
      2
    ],
    [
      "Pantheon",
      "Swain",
      2
    ],
    [
      "Talon",
      "Swain",
      2
    ],
    [
      "Vayne",
      "Swain",
      3
    ],
    [
      "Pantheon",
      "Syndra",
      2
    ],
    [
      "Talon",
      "Syndra",
      3
    ],
    [
      "Pantheon",
      "TwistedFate",
      3
    ],
    [
      "Talon",
      "TwistedFate",
      3
    ],
    [
      "Zed",
      "TwistedFate",
      3
    ],
    [
      "Annie",
      "TwistedFate",
      3
    ],
    [
      "Pantheon",
      "Taliyah",
      2
    ],
    [
      "Talon",
      "Taliyah",
      2
    ],
    [
      "Annie",
      "Taliyah",
      2
    ],
    [
      "Pyke",
      "Taric",
      3
    ],
    [
      "Brand",
      "Taric",
      3
    ],
    [
      "Blitzcrank",
      "Taric",
      3
    ],
    [
      "Karthus",
      "Udyr",
      2
    ],
    [
      "Maokai",
      "Udyr",
      2
    ],
    [
      "Pantheon",
      "Udyr",
      2
    ],
    [
      "Vayne",
      "Urgot",
      3
    ],
    [
      "Quinn",
      "Urgot",
      3
    ],
    [
      "Fiora",
      "Urgot",
      2
    ],
    [
      "Caitlyn",
      "Varus",
      2
    ],
    [
      "Draven",
      "Varus",
      2
    ],
    [
      "Lucian",
      "Varus",
      2
    ],
    [
      "Pantheon",
      "Vex",
      3
    ],
    [
      "Talon",
      "Vex",
      3
    ],
    [
      "Annie",
      "Vex",
      2
    ],
    [
      "Olaf",
      "Viego",
      3
    ],
    [
      "LeeSin",
      "Viego",
      2
    ],
    [
      "Maokai",
      "Viego",
      2
    ],
    [
      "Pantheon",
      "Viktor",
      3
    ],
    [
      "Talon",
      "Viktor",
      3
    ],
    [
      "Zed",
      "Viktor",
      3
    ],
    [
      "Annie",
      "Viktor",
      2
    ],
    [
      "Olaf",
      "Warwick",
      3
    ],
    [
      "Karthus",
      "Warwick",
      2
    ],
    [
      "Pantheon",
      "Warwick",
      2
    ],
    [
      "Caitlyn",
      "Xayah",
      2
    ],
    [
      "Draven",
      "Xayah",
      2
    ],
    [
      "Pantheon",
      "Xayah",
      2
    ],
    [
      "Vayne",
      "Zac",
      3
    ],
    [
      "Fiora",
      "Zac",
      2
    ],
    [
      "Caitlyn",
      "Zeri",
      2
    ],
    [
      "Draven",
      "Zeri",
      2
    ],
    [
      "Pantheon",
      "Zeri",
      2
    ],
    [
      "Pyke",
      "Zilean",
      3
    ],
    [
      "Brand",
      "Zilean",
      3
    ],
    [
      "Leona",
      "Zilean",
      2
    ],
    [
      "Pantheon",
      "Zoe",
      2
    ],
    [
      "Talon",
      "Zoe",
      3
    ],
    [
      "Annie",
      "Zoe",
      2
    ],
    [
      "Karthus",
      "Akshan",
      2
    ],
    [
      "Heimerdinger",
      "Singed",
      3
    ],
    [
      "Pantheon",
      "Gangplank",
      2
    ],
    [
      "Vayne",
      "Gangplank",
      2
    ],
    [
      "Quinn",
      "Gangplank",
      2
    ],
    [
      "Annie",
      "Lux",
      2
    ],
    [
      "Annie",
      "Karthus",
      2
    ],
    [
      "Annie",
      "Brand",
      2
    ],
    [
      "Akshan",
      "Soraka",
      2
    ],
    [
      "Akshan",
      "Yuumi",
      2
    ],
    [
      "Akshan",
      "Sona",
      2
    ],
    [
      "Ashe",
      "MissFortune",
      2
    ],
    [
      "Ashe",
      "Sivir",
      2
    ],
    [
      "Ashe",
      "Kalista",
      2
    ],
    [
      "Ezreal",
      "Sivir",
      2
    ],
    [
      "Ezreal",
      "Twitch",
      2
    ],
    [
      "Ezreal",
      "Caitlyn",
      2
    ],
    [
      "Gangplank",
      "Sett",
      2
    ],
    [
      "Gangplank",
      "Mordekaiser",
      2
    ],
    [
      "Gangplank",
      "Garen",
      2
    ],
    [
      "Gragas",
      "Lillia",
      2
    ],
    [
      "Gragas",
      "MasterYi",
      2
    ],
    [
      "Gragas",
      "Karthus",
      2
    ],
    [
      "Ivern",
      "Khazix",
      2
    ],
    [
      "Ivern",
      "Rengar",
      2
    ],
    [
      "Ivern",
      "Twitch",
      2
    ],
    [
      "Kaisa",
      "Twitch",
      2
    ],
    [
      "Kaisa",
      "Ezreal",
      2
    ],
    [
      "Kaisa",
      "Senna",
      2
    ],
    [
      "Kayn",
      "Hecarim",
      2
    ],
    [
      "Kayn",
      "MasterYi",
      2
    ],
    [
      "Kayn",
      "Karthus",
      2
    ],
    [
      "Kled",
      "Tryndamere",
      2
    ],
    [
      "Kled",
      "Garen",
      2
    ],
    [
      "Kled",
      "Mordekaiser",
      2
    ],
    [
      "Mel",
      "Akali",
      2
    ],
    [
      "Mel",
      "Veigar",
      2
    ],
    [
      "Mel",
      "Brand",
      2
    ],
    [
      "MonkeyKing",
      "Tryndamere",
      2
    ],
    [
      "MonkeyKing",
      "Yorick",
      2
    ],
    [
      "MonkeyKing",
      "Garen",
      2
    ],
    [
      "Neeko",
      "Lulu",
      2
    ],
    [
      "Neeko",
      "Sona",
      2
    ],
    [
      "Neeko",
      "Soraka",
      2
    ],
    [
      "Nilah",
      "Senna",
      2
    ],
    [
      "Nilah",
      "Yuumi",
      2
    ],
    [
      "Nilah",
      "Sivir",
      2
    ],
    [
      "Nunu",
      "Heimerdinger",
      2
    ],
    [
      "Nunu",
      "Sona",
      2
    ],
    [
      "Nunu",
      "Janna",
      2
    ],
    [
      "Orianna",
      "Karthus",
      2
    ],
    [
      "Orianna",
      "MasterYi",
      2
    ],
    [
      "Orianna",
      "Tryndamere",
      2
    ],
    [
      "Poppy",
      "Yasuo",
      2
    ],
    [
      "Poppy",
      "Yone",
      2
    ],
    [
      "Poppy",
      "Zed",
      2
    ],
    [
      "Rumble",
      "Garen",
      2
    ],
    [
      "Rumble",
      "Volibear",
      2
    ],
    [
      "Rumble",
      "Sett",
      2
    ],
    [
      "Ryze",
      "Veigar",
      2
    ],
    [
      "Ryze",
      "Karthus",
      2
    ],
    [
      "Ryze",
      "Soraka",
      2
    ],
    [
      "Samira",
      "Janna",
      2
    ],
    [
      "Samira",
      "Sona",
      2
    ],
    [
      "Samira",
      "Lux",
      2
    ],
    [
      "Swain",
      "Yasuo",
      2
    ],
    [
      "Swain",
      "Akali",
      2
    ],
    [
      "Swain",
      "Twitch",
      2
    ],
    [
      "Syndra",
      "Sivir",
      2
    ],
    [
      "Syndra",
      "Yuumi",
      2
    ],
    [
      "Syndra",
      "Soraka",
      2
    ],
    [
      "Taliyah",
      "Yasuo",
      2
    ],
    [
      "Taliyah",
      "Yone",
      2
    ],
    [
      "Taliyah",
      "Akali",
      2
    ],
    [
      "Taric",
      "Vayne",
      2
    ],
    [
      "Taric",
      "Aphelios",
      2
    ],
    [
      "Taric",
      "Twitch",
      2
    ],
    [
      "TwistedFate",
      "Karthus",
      2
    ],
    [
      "TwistedFate",
      "Sona",
      2
    ],
    [
      "TwistedFate",
      "Yuumi",
      2
    ],
    [
      "Udyr",
      "Lulu",
      2
    ],
    [
      "Udyr",
      "Yuumi",
      2
    ],
    [
      "Urgot",
      "Sett",
      2
    ],
    [
      "Urgot",
      "Mordekaiser",
      2
    ],
    [
      "Urgot",
      "Aatrox",
      2
    ],
    [
      "Varus",
      "Sivir",
      2
    ],
    [
      "Varus",
      "Yuumi",
      2
    ],
    [
      "Varus",
      "Sona",
      2
    ],
    [
      "Vex",
      "Akali",
      2
    ],
    [
      "Vex",
      "Zed",
      2
    ],
    [
      "Vex",
      "Yasuo",
      2
    ],
    [
      "Viego",
      "Sona",
      2
    ],
    [
      "Viego",
      "Soraka",
      2
    ],
    [
      "Viego",
      "Yuumi",
      2
    ],
    [
      "Viktor",
      "Sona",
      2
    ],
    [
      "Viktor",
      "Yuumi",
      2
    ],
    [
      "Viktor",
      "Soraka",
      2
    ],
    [
      "Warwick",
      "Yuumi",
      2
    ],
    [
      "Warwick",
      "Soraka",
      2
    ],
    [
      "Warwick",
      "Sona",
      2
    ],
    [
      "Xayah",
      "Twitch",
      2
    ],
    [
      "Xayah",
      "Yuumi",
      2
    ],
    [
      "Xayah",
      "Sivir",
      2
    ],
    [
      "Zeri",
      "Soraka",
      2
    ],
    [
      "Zeri",
      "Sona",
      2
    ],
    [
      "Zeri",
      "Yuumi",
      2
    ],
    [
      "Zilean",
      "Yuumi",
      2
    ],
    [
      "Zilean",
      "Soraka",
      2
    ],
    [
      "Zilean",
      "Sona",
      2
    ],
    [
      "Zoe",
      "Karthus",
      2
    ],
    [
      "Zoe",
      "Soraka",
      2
    ],
    [
      "Zoe",
      "Sona",
      2
    ],
    [
      "Caitlyn",
      "Annie",
      2
    ],
    [
      "Pantheon",
      "Annie",
      2
    ],
    [
      "Lissandra",
      "Annie",
      2
    ],
    [
      "Vladimir",
      "Annie",
      2
    ],
    [
      "Quinn",
      "Galio",
      3
    ],
    [
      "Camille",
      "Galio",
      2
    ],
    [
      "Twitch",
      "Lucian",
      2
    ],
    [
      "Briar",
      "LeeSin",
      2
    ],
    [
      "Olaf",
      "LeeSin",
      2
    ],
    [
      "Trundle",
      "Quinn",
      2
    ],
    [
      "Riven",
      "Quinn",
      2
    ],
    [
      "Vayne",
      "Cassiopeia",
      2
    ],
    [
      "Quinn",
      "Cassiopeia",
      2
    ],
    [
      "Leona",
      "Bard",
      3
    ],
    [
      "Nautilus",
      "Bard",
      2
    ],
    [
      "Pantheon",
      "Belveth",
      2
    ],
    [
      "LeeSin",
      "Belveth",
      2
    ],
    [
      "Talon",
      "Belveth",
      2
    ],
    [
      "Brand",
      "Braum",
      3
    ],
    [
      "Zyra",
      "Braum",
      3
    ],
    [
      "Pyke",
      "Braum",
      2
    ],
    [
      "Lux",
      "Braum",
      2
    ],
    [
      "Quinn",
      "Fiora",
      3
    ],
    [
      "Vladimir",
      "Fiora",
      3
    ],
    [
      "Teemo",
      "Fiora",
      3
    ],
    [
      "Camille",
      "Gnar",
      2
    ],
    [
      "Riven",
      "Gnar",
      2
    ],
    [
      "Briar",
      "Graves",
      2
    ],
    [
      "Quinn",
      "Gwen",
      3
    ],
    [
      "Pantheon",
      "Gwen",
      2
    ],
    [
      "Vayne",
      "Malphite",
      4
    ],
    [
      "Fiora",
      "Malphite",
      3
    ],
    [
      "Quinn",
      "Malphite",
      2
    ],
    [
      "Pyke",
      "Morgana",
      2
    ],
    [
      "Brand",
      "Morgana",
      2
    ],
    [
      "Lux",
      "Morgana",
      2
    ],
    [
      "Brand",
      "Rell",
      2
    ],
    [
      "Briar",
      "RekSai",
      2
    ],
    [
      "Camille",
      "Teemo",
      3
    ],
    [
      "TahmKench",
      "Teemo",
      2
    ],
    [
      "Karthus",
      "Vi",
      2
    ],
    [
      "MasterYi",
      "Vi",
      2
    ],
    [
      "Briar",
      "Vi",
      2
    ],
    [
      "Trundle",
      "Mordekaiser",
      2
    ],
    [
      "Yuumi",
      "Sona",
      1
    ],
    [
      "Yuumi",
      "Soraka",
      1
    ],
    [
      "Yuumi",
      "Karma",
      1
    ],
    [
      "Yasuo",
      "Karthus",
      2
    ],
    [
      "Yone",
      "Karthus",
      2
    ],
    [
      "MasterYi",
      "Soraka",
      3
    ],
    [
      "MasterYi",
      "Yuumi",
      3
    ],
    [
      "Khazix",
      "Yuumi",
      3
    ],
    [
      "Khazix",
      "Soraka",
      3
    ],
    [
      "Kassadin",
      "Karthus",
      2
    ],
    [
      "Nami",
      "Sona",
      1
    ],
    [
      "Nami",
      "Soraka",
      1
    ],
    [
      "Nami",
      "Yuumi",
      2
    ],
    [
      "Rengar",
      "Yuumi",
      3
    ],
    [
      "Rengar",
      "Soraka",
      3
    ],
    [
      "Tryndamere",
      "Karthus",
      2
    ],
    [
      "Riven",
      "Karthus",
      2
    ],
    [
      "Sion",
      "Soraka",
      2
    ],
    [
      "Sion",
      "Yuumi",
      2
    ],
    [
      "Sion",
      "Sona",
      1
    ],
    [
      "Sivir",
      "Soraka",
      1
    ],
    [
      "Sivir",
      "Yuumi",
      1
    ],
    [
      "Sivir",
      "Sona",
      1
    ],
    [
      "Aphelios",
      "Soraka",
      1
    ],
    [
      "Aphelios",
      "Yuumi",
      1
    ],
    [
      "AurelionSol",
      "Soraka",
      1
    ],
    [
      "AurelionSol",
      "Yuumi",
      1
    ],
    [
      "Aurora",
      "Soraka",
      2
    ],
    [
      "Aurora",
      "Yuumi",
      2
    ],
    [
      "Azir",
      "Soraka",
      1
    ],
    [
      "Azir",
      "Yuumi",
      1
    ],
    [
      "Chogath",
      "Soraka",
      2
    ],
    [
      "Chogath",
      "Yuumi",
      2
    ],
    [
      "Chogath",
      "Smolder",
      2
    ],
    [
      "Corki",
      "Soraka",
      1
    ],
    [
      "Corki",
      "Yuumi",
      1
    ],
    [
      "Ekko",
      "Soraka",
      2
    ],
    [
      "Ekko",
      "Yuumi",
      2
    ],
    [
      "Evelynn",
      "Soraka",
      3
    ],
    [
      "Evelynn",
      "Yuumi",
      3
    ],
    [
      "Hwei",
      "Soraka",
      2
    ],
    [
      "Hwei",
      "Yuumi",
      2
    ],
    [
      "Irelia",
      "Soraka",
      2
    ],
    [
      "Irelia",
      "Yuumi",
      2
    ],
    [
      "Jax",
      "Soraka",
      2
    ],
    [
      "Jax",
      "Yuumi",
      1
    ],
    [
      "Jhin",
      "Soraka",
      2
    ],
    [
      "Jhin",
      "Yuumi",
      1
    ],
    [
      "Jinx",
      "Soraka",
      1
    ],
    [
      "Jinx",
      "Yuumi",
      1
    ],
    [
      "Kaisa",
      "Soraka",
      2
    ],
    [
      "Kaisa",
      "Yuumi",
      2
    ],
    [
      "Kalista",
      "Soraka",
      2
    ],
    [
      "Kalista",
      "Yuumi",
      1
    ],
    [
      "Katarina",
      "Soraka",
      3
    ],
    [
      "Katarina",
      "Yuumi",
      3
    ],
    [
      "Katarina",
      "Karthus",
      2
    ],
    [
      "KogMaw",
      "Soraka",
      1
    ],
    [
      "KogMaw",
      "Yuumi",
      1
    ],
    [
      "MissFortune",
      "Soraka",
      2
    ],
    [
      "MissFortune",
      "Yuumi",
      2
    ],
    [
      "Qiyana",
      "Soraka",
      2
    ],
    [
      "Qiyana",
      "Yuumi",
      2
    ],
    [
      "Qiyana",
      "Karthus",
      2
    ],
    [
      "Rakan",
      "Soraka",
      2
    ],
    [
      "Rammus",
      "Soraka",
      2
    ],
    [
      "Rammus",
      "Yuumi",
      1
    ],
    [
      "Renata",
      "Soraka",
      2
    ],
    [
      "Renata",
      "Yuumi",
      2
    ],
    [
      "Seraphine",
      "Soraka",
      1
    ],
    [
      "Seraphine",
      "Yuumi",
      1
    ],
    [
      "Shaco",
      "Soraka",
      2
    ],
    [
      "Shaco",
      "Yuumi",
      2
    ],
    [
      "Shen",
      "Soraka",
      1
    ],
    [
      "Shyvana",
      "Soraka",
      2
    ],
    [
      "Smolder",
      "Soraka",
      1
    ],
    [
      "Smolder",
      "Yuumi",
      1
    ],
    [
      "Udyr",
      "Soraka",
      2
    ],
    [
      "Yunara",
      "Soraka",
      2
    ],
    [
      "Yunara",
      "Yuumi",
      2
    ],
    [
      "Yunara",
      "Sona",
      1
    ],
    [
      "Zac",
      "Soraka",
      2
    ],
    [
      "Zac",
      "Yuumi",
      2
    ],
    [
      "AurelionSol",
      "Caitlyn",
      1
    ],
    [
      "AurelionSol",
      "Heimerdinger",
      1
    ],
    [
      "AurelionSol",
      "Senna",
      1
    ],
    [
      "Azir",
      "Caitlyn",
      1
    ],
    [
      "Azir",
      "Twitch",
      1
    ],
    [
      "Azir",
      "Kalista",
      1
    ],
    [
      "Corki",
      "Smolder",
      2
    ],
    [
      "Corki",
      "KogMaw",
      2
    ],
    [
      "Corki",
      "Senna",
      2
    ],
    [
      "Evelynn",
      "Senna",
      2
    ],
    [
      "Evelynn",
      "Smolder",
      2
    ],
    [
      "Illaoi",
      "Garen",
      3
    ],
    [
      "Illaoi",
      "Sett",
      3
    ],
    [
      "Illaoi",
      "Mordekaiser",
      2
    ],
    [
      "Irelia",
      "Garen",
      2
    ],
    [
      "KogMaw",
      "Sett",
      2
    ],
    [
      "KogMaw",
      "Mordekaiser",
      2
    ],
    [
      "KogMaw",
      "Sion",
      2
    ],
    [
      "Ornn",
      "Mordekaiser",
      1
    ],
    [
      "Ornn",
      "Sett",
      1
    ],
    [
      "Ornn",
      "Tryndamere",
      1
    ],
    [
      "Rakan",
      "Sona",
      2
    ],
    [
      "Rengar",
      "Sona",
      2
    ],
    [
      "Rengar",
      "Smolder",
      2
    ],
    [
      "Rengar",
      "Senna",
      2
    ],
    [
      "Seraphine",
      "Sona",
      1
    ],
    [
      "Seraphine",
      "Karma",
      1
    ],
    [
      "Seraphine",
      "Senna",
      1
    ],
    [
      "Shyvana",
      "Sona",
      2
    ],
    [
      "Shyvana",
      "Senna",
      2
    ],
    [
      "Shyvana",
      "Smolder",
      2
    ],
    [
      "Sona",
      "Karma",
      1
    ],
    [
      "Sona",
      "Senna",
      1
    ],
    [
      "Sona",
      "Smolder",
      1
    ],
    [
      "Yasuo",
      "Caitlyn",
      2
    ],
    [
      "Yasuo",
      "Senna",
      1
    ],
    [
      "Yone",
      "Caitlyn",
      2
    ],
    [
      "Yone",
      "Senna",
      1
    ],
    [
      "Zac",
      "Sona",
      2
    ],
    [
      "Zac",
      "Senna",
      2
    ],
    [
      "Zac",
      "Smolder",
      2
    ],
    [
      "Zac",
      "Karthus",
      2
    ],
    [
      "Brand",
      "Alistar",
      2
    ],
    [
      "Aatrox",
      "Ambessa",
      2
    ],
    [
      "Trundle",
      "Ambessa",
      2
    ],
    [
      "Janna",
      "Amumu",
      2
    ],
    [
      "Lulu",
      "Amumu",
      2
    ],
    [
      "Soraka",
      "Amumu",
      2
    ],
    [
      "Zyra",
      "Bard",
      2
    ],
    [
      "Alistar",
      "Bard",
      2
    ],
    [
      "Maokai",
      "Briar",
      2
    ],
    [
      "Janna",
      "Briar",
      2
    ],
    [
      "Soraka",
      "Elise",
      1
    ],
    [
      "Janna",
      "Elise",
      1
    ],
    [
      "Lulu",
      "Elise",
      1
    ],
    [
      "Brand",
      "Galio",
      2
    ],
    [
      "Karthus",
      "Galio",
      2
    ],
    [
      "Vayne",
      "Galio",
      2
    ],
    [
      "Akali",
      "Gnar",
      2
    ],
    [
      "Pantheon",
      "Gnar",
      2
    ],
    [
      "Janna",
      "Graves",
      2
    ],
    [
      "Maokai",
      "Graves",
      2
    ],
    [
      "Sejuani",
      "Graves",
      2
    ],
    [
      "Janna",
      "Gwen",
      2
    ],
    [
      "Lulu",
      "Gwen",
      2
    ],
    [
      "Soraka",
      "Gwen",
      2
    ],
    [
      "Janna",
      "JarvanIV",
      2
    ],
    [
      "Lulu",
      "JarvanIV",
      2
    ],
    [
      "Soraka",
      "JarvanIV",
      2
    ],
    [
      "Lulu",
      "Lissandra",
      1
    ],
    [
      "Soraka",
      "Lissandra",
      1
    ],
    [
      "Janna",
      "Lucian",
      2
    ],
    [
      "Soraka",
      "Lucian",
      2
    ],
    [
      "Lulu",
      "Lucian",
      2
    ],
    [
      "Janna",
      "Malzahar",
      2
    ],
    [
      "Lulu",
      "Malzahar",
      2
    ],
    [
      "Soraka",
      "Malzahar",
      2
    ],
    [
      "Janna",
      "MonkeyKing",
      2
    ],
    [
      "Lulu",
      "MonkeyKing",
      2
    ],
    [
      "Soraka",
      "MonkeyKing",
      2
    ],
    [
      "Janna",
      "Nidalee",
      2
    ],
    [
      "Lulu",
      "Nidalee",
      2
    ],
    [
      "Soraka",
      "Nidalee",
      2
    ],
    [
      "Janna",
      "Nocturne",
      2
    ],
    [
      "Lulu",
      "Nocturne",
      2
    ],
    [
      "Soraka",
      "Nocturne",
      2
    ],
    [
      "Janna",
      "RekSai",
      2
    ],
    [
      "Lulu",
      "RekSai",
      2
    ],
    [
      "Soraka",
      "RekSai",
      2
    ],
    [
      "Janna",
      "Syndra",
      2
    ],
    [
      "Lulu",
      "Syndra",
      2
    ],
    [
      "Janna",
      "Tristana",
      2
    ],
    [
      "Lulu",
      "Tristana",
      2
    ],
    [
      "Soraka",
      "Tristana",
      2
    ],
    [
      "Janna",
      "Trundle",
      2
    ],
    [
      "Lulu",
      "Trundle",
      2
    ],
    [
      "Soraka",
      "Trundle",
      2
    ],
    [
      "Janna",
      "XinZhao",
      2
    ],
    [
      "Lulu",
      "XinZhao",
      2
    ],
    [
      "Soraka",
      "XinZhao",
      2
    ],
    [
      "Lux",
      "Thresh",
      2
    ],
    [
      "Brand",
      "Thresh",
      1
    ],
    [
      "Lux",
      "Rell",
      2
    ],
    [
      "Pyke",
      "Lissandra",
      2
    ],
    [
      "Brand",
      "Lissandra",
      2
    ],
    [
      "Talon",
      "Nautilus",
      2
    ],
    [
      "Akali",
      "Nautilus",
      2
    ],
    [
      "Pyke",
      "Rell",
      2
    ],
    [
      "Akali",
      "Thresh",
      2
    ],
    [
      "Brand",
      "Zyra",
      2
    ],
    [
      "Pyke",
      "Zyra",
      2
    ],
    [
      "Tryndamere",
      "Garen",
      2
    ],
    [
      "Tryndamere",
      "Olaf",
      2
    ],
    [
      "Tryndamere",
      "Renekton",
      2
    ]
  ];

  // lib/draftAI/data.ts
  var HARD_COUNTERS = hardCounters_default;

  // lib/draftAI/helpers.ts
  function buildCounterLookup(source) {
    const m = /* @__PURE__ */ new Map();
    for (const [c, v, b] of source) {
      if (!m.has(c)) m.set(c, /* @__PURE__ */ new Map());
      m.get(c).set(v, b);
    }
    return m;
  }
  var BASELINE_COUNTER_LOOKUP = buildCounterLookup(HARD_COUNTERS);

  // lib/rng.ts
  function createRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // lib/chemistry.ts
  function clamp2(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }
  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rosterSeed(roster) {
    return roster.map((p) => `${p.lane}:${p.tier}:${p.goodChamps.join(",")}:${p.badChamps.join(",")}`).join("|");
  }
  function signedRoll(rng) {
    return Math.round((rng() - rng()) * 100) / 100;
  }
  function isFullyAssigned(roster) {
    if (roster.some((p) => p.id == null)) return false;
    for (let i = 0; i < roster.length; i++) {
      for (let j = i + 1; j < roster.length; j++) {
        const a = roster[i];
        const b = roster[j];
        const has = a.synergy?.[b.id] != null || b.synergy?.[a.id] != null;
        if (!has) return false;
      }
    }
    return true;
  }
  function assignSynergies(roster, seedKey) {
    if (isFullyAssigned(roster)) return roster;
    const rng = createRng(hashString(seedKey ?? rosterSeed(roster)));
    const players = roster.map((p) => ({
      ...p,
      id: p.id ?? makePlayerId(rng),
      synergy: { ...p.synergy ?? {} }
    }));
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        if (a.synergy[b.id] != null || b.synergy[a.id] != null) continue;
        const v = signedRoll(rng);
        a.synergy[b.id] = v;
        b.synergy[a.id] = v;
      }
    }
    return players;
  }
  var CHEM_TIME_STEP = 0.03;
  var CHEM_TIME_TARGET = 0.35;
  function driftRoster(roster, fn) {
    const players = roster.map((p) => ({
      ...p,
      synergy: { ...p.synergy ?? {} }
    }));
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        if (a.id == null || b.id == null) continue;
        const hasA = a.synergy[b.id] != null;
        const hasB = b.synergy[a.id] != null;
        if (!hasA && !hasB) continue;
        const cur = hasA ? a.synergy[b.id] : b.synergy[a.id];
        const next = clamp2(fn(cur), -1, 1);
        a.synergy[b.id] = next;
        b.synergy[a.id] = next;
      }
    }
    return players;
  }
  function driftSynergiesOverTime(roster, step = CHEM_TIME_STEP) {
    return driftRoster(
      roster,
      (cur) => cur < CHEM_TIME_TARGET ? Math.min(CHEM_TIME_TARGET, cur + step) : cur
    );
  }

  // lib/sim/descriptions.ts
  var NO_KDA = Object.freeze({ blue: {}, red: {} });

  // lib/matchSimulator.ts
  var RATING_BASE = 5;
  var RATING_KDA_SCALE = 2.4;
  var RATING_KDA_DIVISOR = 7;
  var RATING_INVOLVEMENT_SCALE = 1.2;
  var RATING_GOLD_SATURATION = 2e3;
  var RATING_RESULT_BONUS = 0.45;
  var ROLE_RATING = {
    top: { invCenter: 0.42, assistWeight: 0.72, goldWeight: 1.08 },
    jungle: { invCenter: 0.69, assistWeight: 0.38, goldWeight: 0.75 },
    middle: { invCenter: 0.62, assistWeight: 0.55, goldWeight: 0.95 },
    bottom: { invCenter: 0.6, assistWeight: 0.62, goldWeight: 0.92 },
    support: { invCenter: 0.53, assistWeight: 0.52, goldWeight: 0.76 }
  };
  function ratePlayerGame(k, d, a, laneGoldDiff, won, teamKills, lane) {
    const role = ROLE_RATING[lane];
    const killPoints = k + a * role.assistWeight;
    const kdaScore = RATING_KDA_SCALE * Math.tanh((killPoints - d) / RATING_KDA_DIVISOR);
    const participation = Math.min(1, (k + a) / Math.max(1, teamKills));
    const involvement = (participation - role.invCenter) * RATING_INVOLVEMENT_SCALE;
    const goldScore = role.goldWeight * Math.max(-1, Math.min(1, laneGoldDiff / RATING_GOLD_SATURATION));
    const result = won ? RATING_RESULT_BONUS : -RATING_RESULT_BONUS;
    const raw = RATING_BASE + kdaScore + involvement + goldScore + result;
    return Math.round(Math.max(1, Math.min(10, raw)) * 10) / 10;
  }
  function computeGameRatings(recap, winner) {
    const kda = recap.perPickKDA;
    if (!kda) return null;
    const lanes = ["top", "jungle", "middle", "bottom", "support"];
    const sum = (side) => side.reduce((s, e) => s + (e?.k ?? 0), 0);
    const blueKills = sum(kda.blue);
    const redKills = sum(kda.red);
    const rate = (side) => lanes.map((lane, i) => {
      const entry = (side === "blue" ? kda.blue : kda.red)[i] ?? {
        k: 0,
        d: 0,
        a: 0
      };
      const goldBlue = recap.laneGoldDiff?.[lane] ?? 0;
      const gold = side === "blue" ? goldBlue : -goldBlue;
      return ratePlayerGame(
        entry.k,
        entry.d,
        entry.a,
        gold,
        winner === side,
        side === "blue" ? blueKills : redKills,
        lane
      );
    });
    return { blue: rate("blue"), red: rate("red") };
  }

  // lib/season/types.ts
  var LEAGUE_IDS = [
    "LCK",
    "LPL",
    "LEC",
    "LCS",
    "CBLOL",
    "LCP"
  ];
  var TEAMS_PER_LEAGUE = 10;
  var SPLIT_LABELS = {
    winter: "Winter Split",
    spring: "Spring Split",
    summer: "Summer Split"
  };
  var GLOBAL_CUP_NAME = "Global Cup";
  var INTERNATIONAL_LABELS = {
    "first-stand": "First Stand",
    msi: "MSI",
    worlds: "Worlds",
    "global-cup": GLOBAL_CUP_NAME
  };
  var QUALIFYING_SPLIT = {
    "first-stand": "winter",
    msi: "spring",
    worlds: "summer",
    "global-cup": "summer"
    // Runs after Worlds in the same calendar year
  };

  // lib/season/transfers.ts
  var W_PERF = 0.35;
  var W_META = 0.4;
  var GRADE_NEUTRAL = 5.5;
  var POOL_NEUTRAL = TIER_VALUE.B;
  var VALUE_GAP_MIN = 0.8;
  var MAX_MOVES_PER_LANE = 6;
  var OFFSEASON_GAP_MIN = 0.35;
  var OFFSEASON_MAX_MOVES = 10;
  var CROSS_REGION_TIER_CAP = PLAYER_TIER_VALUE.A;
  function crossRegionBlocked(star, fromLeague, toLeague) {
    return fromLeague !== toLeague && PLAYER_TIER_VALUE[star.tier] > CROSS_REGION_TIER_CAP;
  }
  function isVacancyStub(p) {
    return !!p?.id?.startsWith("__vacancy__");
  }
  function metaTierAt(alias, lane, meta) {
    return meta.metaOverride?.[alias]?.[lane] ?? CHAMPION_META[alias]?.metaTiers?.[lane] ?? null;
  }
  function poolFit(player, byId, meta) {
    let wsum = 0;
    let vsum = 0;
    player.goodChamps.forEach((id, i) => {
      const champ = byId.get(id);
      if (!champ) return;
      const tier = metaTierAt(champ.alias, player.lane, meta);
      if (!tier) return;
      const w = i < MAIN_POOL ? 1 : SECONDARY_COMFORT;
      wsum += w;
      vsum += w * (TIER_VALUE[tier] - POOL_NEUTRAL);
    });
    return wsum > 0 ? vsum / wsum : 0;
  }
  var W_COHESION = 0.5;
  function transferValue(player, grade, byId, meta) {
    let v = PLAYER_TIER_VALUE[player.tier];
    if (grade != null) v += W_PERF * (grade - GRADE_NEUTRAL);
    v += W_META * poolFit(player, byId, meta);
    const acc = Math.max(0, Math.min(1, player.acclimation ?? 1));
    v -= W_COHESION * (1 - acc);
    return v;
  }
  var IMPORT_ACC_INSEASON = 0.15;
  var IMPORT_ACC_OFFSEASON = 0.5;
  function settle(player, fromLeague, toLeague, preseason = false) {
    if (!player.homeRegion) return player;
    if (toLeague === player.homeRegion) return { ...player, acclimation: 1 };
    if (toLeague === fromLeague) return player;
    return {
      ...player,
      acclimation: preseason ? IMPORT_ACC_OFFSEASON : IMPORT_ACC_INSEASON
    };
  }
  function splitLaneGrades(season, tournamentIds) {
    const teams = new Map(season.teams.map((t) => [t.id, t]));
    const sum = /* @__PURE__ */ new Map();
    const count = /* @__PURE__ */ new Map();
    for (const tid of tournamentIds) {
      const t = season.tournaments[tid];
      if (!t) continue;
      for (const match of t.matches) {
        if (match.isBye || !match.series) continue;
        const games = match.series.games;
        for (const teamId of [match.blueTeamId, match.redTeamId]) {
          if (!teamId) continue;
          const team = teams.get(teamId);
          for (const game of games) {
            if (game.status !== "complete" || game.winner == null) continue;
            const recap = game.recap;
            if (!recap) continue;
            let ratings = recap.ratings ?? null;
            if (!ratings && recap.perPickKDA) ratings = computeGameRatings(recap, game.winner);
            if (!ratings) continue;
            const side = team && game.blueTeam === team.name ? "blue" : team && game.redTeam === team.name ? "red" : teamId === match.blueTeamId ? "blue" : "red";
            const notes = side === "blue" ? ratings.blue : ratings.red;
            const ids = recap.perPickIds?.[side];
            for (let i = 0; i < 5; i++) {
              const v = notes[i];
              const pid = ids?.[i] ?? team?.players[i]?.id;
              if (!pid || typeof v !== "number" || !Number.isFinite(v)) continue;
              sum.set(pid, (sum.get(pid) ?? 0) + v);
              count.set(pid, (count.get(pid) ?? 0) + 1);
            }
          }
        }
      }
    }
    const out = /* @__PURE__ */ new Map();
    for (const team of season.teams) {
      out.set(team.id, [0, 1, 2, 3, 4].map((i) => {
        const id = team.players[i]?.id;
        const c = id ? count.get(id) : void 0;
        return id && c ? sum.get(id) / c : null;
      }));
    }
    return out;
  }
  var TRANSFER_PRESTIGE_WEIGHT = 0.5;
  function regionBonus(league) {
    return (LEAGUE_IDS.length - LEAGUE_IDS.indexOf(league)) * TRANSFER_PRESTIGE_WEIGHT;
  }
  function destScores(season, split) {
    const finishByLeague = split && season.splitResults[split] || {};
    const out = /* @__PURE__ */ new Map();
    for (const team of season.teams) {
      const order = finishByLeague[team.leagueId] ?? [];
      const idx = order.indexOf(team.id);
      const finish = idx >= 0 ? TEAMS_PER_LEAGUE - idx : TEAMS_PER_LEAGUE / 2;
      out.set(team.id, regionBonus(team.leagueId) + finish);
    }
    return out;
  }
  var norm = (x, lo, hi) => hi > lo ? (x - lo) / (hi - lo) : 0.5;
  function planLaneSwaps(entries, opts = {}) {
    const gapMin = opts.gapMin ?? VALUE_GAP_MIN;
    const maxMoves = opts.maxMoves ?? MAX_MOVES_PER_LANE;
    const swaps = [];
    const used = /* @__PURE__ */ new Set();
    for (let move = 0; move < maxMoves; move++) {
      const pool = entries.filter((e) => !used.has(e.teamId));
      if (pool.length < 2) break;
      const vs = pool.map((e) => e.value);
      const ds = pool.map((e) => e.dest);
      const [vlo, vhi] = [Math.min(...vs), Math.max(...vs)];
      const [dlo, dhi] = [Math.min(...ds), Math.max(...ds)];
      let star = null;
      let link = null;
      let starM = -Infinity;
      let linkM = -Infinity;
      for (const e of pool) {
        const m = norm(e.value, vlo, vhi) - norm(e.dest, dlo, dhi);
        if (m > starM) starM = m, star = e;
        if (-m > linkM) linkM = -m, link = e;
      }
      if (!star || !link || star.teamId === link.teamId) break;
      if (star.value - link.value < gapMin) break;
      if (link.dest <= star.dest) break;
      swaps.push({ aTeamId: star.teamId, bTeamId: link.teamId });
      used.add(star.teamId);
      used.add(link.teamId);
    }
    return swaps;
  }
  function snapshot(player, grade) {
    return {
      ...player.id ? { id: player.id } : {},
      ...player.name ? { name: player.name } : {},
      tier: player.tier,
      grade,
      goodChamps: [...player.goodChamps]
    };
  }
  function applyTransfers(season, champions, intlPhase) {
    if (!season.config.playerTransfers) return season;
    const event = intlPhase.event;
    if (!event || event === "worlds") return season;
    const split = QUALIFYING_SPLIT[event];
    const byId = new Map(champions.map((c) => [c.id, c]));
    const grades = splitLaneGrades(season, windowGradeTids(season, event));
    const dest = destScores(season, split);
    const meta = season.currentMeta;
    const teams = new Map(season.teams.map((t) => [t.id, { ...t, players: [...t.players] }]));
    const transfers = [];
    const proposals = [];
    const controlledId = season.config.controlledTeamId;
    const gradeOf = (teamId, li) => grades.get(teamId)?.[li] ?? null;
    const cap = maxUserTransfers(event);
    const teamMoves = /* @__PURE__ */ new Map();
    const atCap = (id) => (teamMoves.get(id) ?? 0) >= cap;
    const bump = (id) => teamMoves.set(id, (teamMoves.get(id) ?? 0) + 1);
    for (let li = 0; li < LANE_ORDER.length; li++) {
      const lane = LANE_ORDER[li];
      const entries = [];
      for (const team of teams.values()) {
        const player = team.players[li];
        if (!player || isVacancyStub(player)) continue;
        entries.push({
          teamId: team.id,
          value: transferValue(player, gradeOf(team.id, li), byId, meta),
          dest: dest.get(team.id) ?? 0
        });
      }
      for (const { aTeamId, bTeamId } of planLaneSwaps(entries)) {
        if (atCap(aTeamId) || atCap(bTeamId)) continue;
        const a = teams.get(aTeamId);
        const b = teams.get(bTeamId);
        const pa = a.players[li];
        const pb = b.players[li];
        if (!pa || !pb || isVacancyStub(pa) || isVacancyStub(pb)) continue;
        if (pa.id && pb.id && pa.id === pb.id) continue;
        if (pa.name && pb.name && pa.name === pb.name) continue;
        if (crossRegionBlocked(pa, a.leagueId, b.leagueId) || crossRegionBlocked(pb, b.leagueId, a.leagueId))
          continue;
        const starSnap = snapshot(pa, gradeOf(aTeamId, li));
        const swapSnap = snapshot(pb, gradeOf(bTeamId, li));
        if (controlledId && (aTeamId === controlledId || bTeamId === controlledId)) {
          const isController = aTeamId === controlledId;
          proposals.push({
            event,
            lane,
            laneIndex: li,
            controlledTeamId: controlledId,
            otherTeamId: isController ? bTeamId : aTeamId,
            kind: isController ? "outgoing" : "incoming",
            mine: isController ? starSnap : swapSnap,
            theirs: isController ? swapSnap : starSnap
          });
          continue;
        }
        const rosterBefore = structuredClone([a, b]);
        a.players[li] = settle(pb, b.leagueId, a.leagueId);
        b.players[li] = settle(pa, a.leagueId, b.leagueId);
        transfers.push({ teamSnapshots: captureMarketTeamSnapshots(rosterBefore, [a, b], [a.id, b.id], { before: season.franchise?.inactivePool ?? [], after: season.franchise?.inactivePool ?? [] }), origin: marketOrigin(season, event), event, lane, fromTeamId: aTeamId, toTeamId: bTeamId, star: starSnap, swap: swapSnap });
        bump(aTeamId);
        bump(bTeamId);
      }
    }
    if (transfers.length === 0 && proposals.length === 0) return season;
    return {
      ...season,
      teams: [...teams.values()],
      transfersByEvent: { ...season.transfersByEvent, [event]: transfers },
      proposedTransfers: proposals
    };
  }
  function windowGradeTids(season, event) {
    const split = QUALIFYING_SPLIT[event];
    const splitPhase = season.phases.find((p) => p.kind === "split" && p.split === split);
    const intlPhase = season.phases.find((p) => p.kind === "international" && p.event === event);
    return [...splitPhase?.tournamentIds ?? [], ...intlPhase?.tournamentIds ?? []];
  }
  function activeWindowTransfers(season, event) {
    const moves = season.transfersByEvent?.[event] ?? [];
    const baseline = event === "worlds" ? season.worldsOffseasonBaseline ?? 0 : 0;
    return moves.filter((move, index) => move.origin && season.id ? belongsToMarketWindow(move.origin, { id: season.id, franchise: season.franchise }, event) : index >= baseline && transferEventStamp(move, event) === event);
  }
  function transferEventStamp(move, bucket) {
    return move.event ?? bucket;
  }
  function transfersForHistoryArchive(season) {
    const byEvent = season.transfersByEvent ?? {};
    const baseline = season.worldsOffseasonBaseline ?? 0;
    const out = [];
    for (const [bucket, moves] of Object.entries(byEvent)) {
      const list = moves ?? [];
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        const stamp = transferEventStamp(m, bucket);
        if (m.origin && season.id && !belongsToMarketWindow(m.origin, { id: season.id, franchise: season.franchise }, stamp)) continue;
        if (!m.origin && bucket === "worlds" && baseline > 0 && i < baseline && stamp === "worlds") {
          continue;
        }
        out.push(stamp === m.event ? m : { ...m, event: stamp });
      }
    }
    return out;
  }
  function transferDedupeKey(m) {
    return [
      m.origin?.seasonId ?? "",
      m.origin?.year ?? "",
      m.origin?.windowId ?? "",
      m.event,
      m.lane,
      m.fromTeamId,
      m.toTeamId,
      m.star.id ?? m.star.name ?? "",
      m.swap.id ?? m.swap.name ?? ""
    ].join("|");
  }
  function rebucketTransfersByStamp(byEvent) {
    if (!byEvent) return {};
    const next = {};
    const seen = /* @__PURE__ */ new Set();
    for (const [bucket, moves] of Object.entries(byEvent)) {
      for (const m of moves ?? []) {
        const stamp = transferEventStamp(m, bucket);
        const row = stamp === m.event ? m : { ...m, event: stamp };
        const key = transferDedupeKey(row);
        if (seen.has(key)) continue;
        seen.add(key);
        (next[stamp] ??= []).push(row);
      }
    }
    return next;
  }
  function teamMovedAtLane(season, event, teamId, lane) {
    return activeWindowTransfers(season, event).some(
      (m) => m.lane === lane && (m.fromTeamId === teamId || m.toTeamId === teamId)
    );
  }
  var USER_MAX_TRANSFERS_PER_WINDOW = 2;
  var USER_MAX_TRANSFERS_OFFSEASON = 4;
  function maxUserTransfers(event) {
    return event === "worlds" ? USER_MAX_TRANSFERS_OFFSEASON : USER_MAX_TRANSFERS_PER_WINDOW;
  }
  function userTransferCount(season, event, teamId) {
    return activeWindowTransfers(season, event).filter(
      (m) => m.fromTeamId === teamId || m.toTeamId === teamId
    ).length;
  }
  function userTransferCapReached(season, event, teamId) {
    return userTransferCount(season, event, teamId) >= maxUserTransfers(event);
  }
  function offseasonTransferPass(teams, gradeOf, byId, meta, skipTeamId, movedLanes, priorMoves = [], inactivePool = []) {
    const map = new Map(teams.map((t) => [t.id, { ...t, players: [...t.players] }]));
    const moves = [];
    const prestige = (lg) => (LEAGUE_IDS.length - LEAGUE_IDS.indexOf(lg)) * TRANSFER_PRESTIGE_WEIGHT;
    const cap = maxUserTransfers("worlds");
    const teamMoves = /* @__PURE__ */ new Map();
    for (const m of priorMoves) {
      teamMoves.set(m.fromTeamId, (teamMoves.get(m.fromTeamId) ?? 0) + 1);
      teamMoves.set(m.toTeamId, (teamMoves.get(m.toTeamId) ?? 0) + 1);
    }
    const atCap = (id) => (teamMoves.get(id) ?? 0) >= cap;
    const bump = (id) => teamMoves.set(id, (teamMoves.get(id) ?? 0) + 1);
    for (let li = 0; li < LANE_ORDER.length; li++) {
      const lane = LANE_ORDER[li];
      const entries = [];
      for (const t of map.values()) {
        const p = t.players[li];
        if (!p || isVacancyStub(p)) continue;
        if (t.id === skipTeamId) continue;
        if (movedLanes?.(t.id, li)) continue;
        entries.push({
          teamId: t.id,
          value: transferValue(p, gradeOf(t.id, li), byId, meta),
          dest: deriveStar(t.players) + prestige(t.leagueId)
        });
      }
      for (const { aTeamId, bTeamId } of planLaneSwaps(entries, {
        gapMin: OFFSEASON_GAP_MIN,
        maxMoves: OFFSEASON_MAX_MOVES
      })) {
        if (atCap(aTeamId) || atCap(bTeamId)) continue;
        const a = map.get(aTeamId);
        const b = map.get(bTeamId);
        const pa = a.players[li];
        const pb = b.players[li];
        if (!pa || !pb || isVacancyStub(pa) || isVacancyStub(pb)) continue;
        if (pa.id && pb.id && pa.id === pb.id) continue;
        if (pa.name && pb.name && pa.name === pb.name) continue;
        if (crossRegionBlocked(pa, a.leagueId, b.leagueId) || crossRegionBlocked(pb, b.leagueId, a.leagueId))
          continue;
        const rosterBefore = structuredClone([a, b]);
        a.players[li] = settle(pb, b.leagueId, a.leagueId, true);
        b.players[li] = settle(pa, a.leagueId, b.leagueId, true);
        bump(aTeamId);
        bump(bTeamId);
        moves.push({
          teamSnapshots: captureMarketTeamSnapshots(rosterBefore, [a, b], [a.id, b.id], { before: inactivePool, after: inactivePool }),
          event: "worlds",
          lane,
          fromTeamId: aTeamId,
          toTeamId: bTeamId,
          star: snapshot(pa, gradeOf(aTeamId, li)),
          swap: snapshot(pb, gradeOf(bTeamId, li))
        });
      }
    }
    return { teams: [...map.values()], moves };
  }

  // lib/season/poolDrift.ts
  var BAD_DRIFT_SHARE = 0.25;
  var MAIN_SWAP_SHARE = 0.4;
  var META_DRIFT_LEAN = 0.7;
  function pickIncoming(pool, lane, rng) {
    if (rng() >= META_DRIFT_LEAN) {
      return pool[Math.floor(rng() * pool.length)].id;
    }
    let bestId = pool[0].id;
    let bestKey = -1;
    for (const c of pool) {
      const tier = getMetaTiers(c.alias)[lane];
      const weight = tier ? MAIN_TIER_WEIGHT[tier] : 2;
      const key = Math.pow(rng() || 1e-9, 1 / weight);
      if (key > bestKey) {
        bestKey = key;
        bestId = c.id;
      }
    }
    return bestId;
  }
  function driftPlayerPool(p, champions, rng) {
    const used = /* @__PURE__ */ new Set([...p.goodChamps, ...p.badChamps]);
    const eligible = champions.filter((c) => !used.has(c.id) && playableInLane(c, p.lane));
    if (eligible.length === 0) return p;
    const driftBad = p.badChamps.length > 0 && (p.goodChamps.length === 0 || rng() < BAD_DRIFT_SHARE);
    if (driftBad) {
      const badChamps = p.badChamps.slice();
      badChamps[Math.floor(rng() * badChamps.length)] = eligible[Math.floor(rng() * eligible.length)].id;
      return { ...p, badChamps };
    }
    if (p.goodChamps.length === 0) return p;
    const incoming = pickIncoming(eligible, p.lane, rng);
    const mainCount = Math.min(MAIN_POOL, p.goodChamps.length);
    const hasSecondary = p.goodChamps.length > MAIN_POOL;
    const swapMain = !hasSecondary || rng() < MAIN_SWAP_SHARE;
    const idx = swapMain ? Math.floor(rng() * mainCount) : MAIN_POOL + Math.floor(rng() * (p.goodChamps.length - MAIN_POOL));
    const goodChamps = p.goodChamps.slice();
    goodChamps[idx] = incoming;
    return { ...p, goodChamps };
  }

  // lib/season/faMarket.ts
  var ACADEMY_YEARS = 3;
  var TOTAL_INACTIVE_BEFORE_RETIRE = 7;
  var FREE_AGENT_YEARS = TOTAL_INACTIVE_BEFORE_RETIRE - ACADEMY_YEARS;
  var ACADEMY_YEARS_MIN = 2;
  var ACADEMY_YEARS_MAX = 4;
  var ACADEMY_GRADUATE_CAP_PER_YEAR = 16;
  var ACADEMY_EARLY_EXIT_MAX_VALUE = -1.6;
  var ACADEMY_EXTEND_MIN_VALUE = 1.25;
  function inactiveClockYear(entry) {
    return entry.clockYear ?? entry.demotedYear;
  }
  var ACADEMY_PASS_GAP = 1.05;
  var ROOKIE_VALUE_FLOOR = -0.55;
  var FA_OPEN_REPLACE_GAP = 0.9;
  var ACADEMY_OPEN_REPLACE_GAP = 0.55;
  var MAX_OPEN_FA_REPLACES_PER_TEAM = 1;
  var MAX_OPEN_ACADEMY_PROMOTES_PER_TEAM = 1;
  var AI_ACADEMY_PROMOTE_CHANCE = 0.62;
  var ACADEMY_MAX_PER_TEAM = 5;
  var MAX_AI_ACADEMY_STASH_PER_TEAM = 1;
  var AI_ACADEMY_STASH_MIN_VALUE = 0.55;
  var AI_ACADEMY_STASH_CHANCE = 0.78;
  var AI_ACADEMY_STASH_CHANCE_MID_SPLIT = 0.42;
  var AI_OPEN_FA_CHANCE_MID_SPLIT = 0.14;
  var MAX_AI_ACADEMY_RELEASE_PER_TEAM = 1;
  var AI_ACADEMY_RELEASE_MIN_COUNT = 3;
  var AI_ACADEMY_RELEASE_MAX_VALUE = 0.55;
  var AI_ACADEMY_RELEASE_MIN_SCORE = 1.75;
  var AI_ACADEMY_RELEASE_CHANCE = 0.36;
  var TARGET_FA_POOL = { min: 22, max: 48 };
  var INITIAL_OPENING_FA_POOL = TARGET_FA_POOL.min;
  var FA_OVERFLOW_KEEP_GRADUATES = 6;
  var FA_OVERFLOW_ACCEL_ABOVE = TARGET_FA_POOL.max + 8;
  var MAX_AI_ACADEMY_ROOKIE_PER_TEAM = 1;
  var AI_ACADEMY_ROOKIE_FA_THIN = TARGET_FA_POOL.min;
  var AI_ACADEMY_ROOKIE_CHANCE = 0.22;
  var AI_ACADEMY_ROOKIE_CHANCE_MID_SPLIT = 0.08;
  var AI_ACADEMY_ROOKIE_DEPTH_BELOW = 2;
  var USER_ACADEMY_ROOKIE_SOFT_MAX = ACADEMY_MAX_PER_TEAM - 1;
  var VACANCY_ID_PREFIX = "__vacancy__";
  function isRosterVacancy(p) {
    return !!p?.id?.startsWith(VACANCY_ID_PREFIX);
  }
  function makeVacancyPlaceholder(lane) {
    return {
      id: `${VACANCY_ID_PREFIX}${lane}`,
      lane,
      tier: "D",
      goodChamps: [],
      badChamps: []
    };
  }
  function countTeamAcademy(pool, teamId) {
    let n = 0;
    for (const e of pool) {
      if (e.status === "academy" && e.lastTeamId === teamId) n++;
    }
    return n;
  }
  function teamAcademyHasRoom(pool, teamId) {
    return countTeamAcademy(pool, teamId) < ACADEMY_MAX_PER_TEAM;
  }
  function countAcademyRookiesMintedInYear(pool, teamId, year) {
    let n = 0;
    for (const e of pool) {
      if (e.status !== "academy" || e.lastTeamId !== teamId) continue;
      if (e.demotedYear !== year) continue;
      if (e.player.debutYear !== year) continue;
      n++;
    }
    return n;
  }
  function findOldestTeamAcademyIdx(pool, teamId, year) {
    const arrivedThisYear = (e) => year != null && inactiveClockYear(e) === year;
    let best = -1;
    for (let i = 0; i < pool.length; i++) {
      const e = pool[i];
      if (e.status !== "academy" || e.lastTeamId !== teamId) continue;
      if (best < 0) {
        best = i;
        continue;
      }
      const b = pool[best];
      if (arrivedThisYear(e) !== arrivedThisYear(b)) {
        if (!arrivedThisYear(e)) best = i;
        continue;
      }
      const ey = Math.max(1, e.inactiveYears < 1 ? 1 : e.inactiveYears);
      const by = Math.max(1, b.inactiveYears < 1 ? 1 : b.inactiveYears);
      if (ey !== by) {
        if (ey > by) best = i;
        continue;
      }
      const ec = inactiveClockYear(e);
      const bc = inactiveClockYear(b);
      if (ec !== bc) {
        if (ec < bc) best = i;
        continue;
      }
      if (e.demotedYear < b.demotedYear) best = i;
    }
    return best;
  }
  function toFreeAgentFromAcademy(entry, year) {
    return {
      ...entry,
      status: "free-agent",
      inactiveYears: ACADEMY_YEARS + 1,
      ...year != null ? { clockYear: year } : {}
    };
  }
  function bumpOldestAcademyToFa(pool, teamId, year) {
    const idx = findOldestTeamAcademyIdx(pool, teamId, year);
    if (idx < 0) return { pool: [...pool], bumped: null };
    const bumped = toFreeAgentFromAcademy(pool[idx], year);
    return {
      pool: pool.map((e, i) => i === idx ? bumped : e),
      bumped
    };
  }
  function addToTeamAcademy(pool, entry) {
    if (entry.player.id) {
      const existing = pool.findIndex((e) => e.player.id === entry.player.id);
      if (existing >= 0) {
        const next2 = [...pool];
        next2[existing] = entry;
        return { pool: next2, bumped: null };
      }
    }
    let bumped = null;
    let next;
    if (countTeamAcademy(pool, entry.lastTeamId) >= ACADEMY_MAX_PER_TEAM) {
      const res = bumpOldestAcademyToFa(
        pool,
        entry.lastTeamId,
        inactiveClockYear(entry)
      );
      next = res.pool;
      bumped = res.bumped;
    } else {
      next = [...pool];
    }
    next.push(entry);
    return { pool: next, bumped };
  }
  var SAME_PLAYER_STATUS_NOTES = /* @__PURE__ */ new Set([
    "became-fa",
    "retired",
    "academy-bump",
    "academy-release",
    "agency-override",
    "agency-leave",
    "manual-demote",
    "ai-demote"
  ]);
  function isSamePlayerReplaceNoise(n) {
    if (n.marketNote && SAME_PLAYER_STATUS_NOTES.has(n.marketNote)) return false;
    if (n.departedId && n.entrantId && n.departedId === n.entrantId) return true;
    if (n.departedName && n.entrantName && n.departedName === n.entrantName && n.entrantName !== "") {
      return true;
    }
    return false;
  }
  function reconcileRosterPoolDuplicates(teams, pool) {
    const rosterById = /* @__PURE__ */ new Map();
    teams.forEach((t, ti) => {
      t.players.forEach((p, pi) => {
        if (p?.id && !isRosterVacancy(p)) rosterById.set(p.id, { ti, pi });
      });
    });
    const nextTeams = teams.map((t) => ({ ...t, players: [...t.players] }));
    const nextPool = [];
    for (const e of pool) {
      if (isRosterVacancy(e.player)) continue;
      const id = e.player.id;
      if (!id || !rosterById.has(id)) {
        nextPool.push(e);
        continue;
      }
      const loc = rosterById.get(id);
      const rosterP = nextTeams[loc.ti].players[loc.pi];
      let next = rosterP;
      if (PLAYER_TIER_VALUE[e.player.tier] > PLAYER_TIER_VALUE[rosterP.tier]) {
        next = { ...next, tier: e.player.tier };
      }
      const potPool = PLAYER_TIER_VALUE[e.player.potential ?? e.player.tier];
      const potRost = PLAYER_TIER_VALUE[next.potential ?? next.tier];
      if (potPool > potRost) {
        next = { ...next, potential: e.player.potential ?? e.player.tier };
      }
      nextTeams[loc.ti].players[loc.pi] = next;
    }
    return { teams: nextTeams, inactivePool: nextPool };
  }
  function makeBecameFaNews(entry, marketNote) {
    const p = entry.player;
    return {
      teamId: entry.lastTeamId,
      lane: p.lane,
      ...p.name ? { departedName: p.name } : {},
      departedTier: p.tier,
      ...p.age != null ? { departedAge: p.age } : {},
      ...p.id ? { departedId: p.id } : {},
      entrantName: p.name ?? "",
      entrantTier: p.tier,
      entrantPotential: p.potential ?? p.tier,
      ...p.id ? { entrantId: p.id } : {},
      entrantSource: "free-agent",
      marketNote
    };
  }
  function makeRetiredNews(entry, previous) {
    const p = entry.player;
    return {
      teamId: entry.lastTeamId,
      lane: p.lane,
      ...p.name ? { departedName: p.name } : {},
      departedTier: p.tier,
      ...p.age != null ? { departedAge: p.age } : {},
      ...p.id ? { departedId: p.id } : {},
      entrantName: p.name ?? "",
      entrantTier: p.tier,
      entrantPotential: p.potential ?? p.tier,
      ...p.id ? { entrantId: p.id } : {},
      entrantSource: "free-agent",
      marketNote: "retired",
      ...previous && previous.status !== "retired" ? { retirement: { from: previous.status, ...p.age != null ? { age: p.age } : {}, ...entry.inactiveTenure } } : {}
    };
  }
  function releaseAcademyToFa(pool, teamId, playerId, year) {
    const idx = pool.findIndex(
      (e) => e.status === "academy" && e.lastTeamId === teamId && e.player.id === playerId
    );
    if (idx < 0) return { pool: [...pool], released: null };
    const released = toFreeAgentFromAcademy(pool[idx], year);
    const next = pool.map((e, i) => i === idx ? released : e);
    return { pool: next, released };
  }
  var SHADOW_BLEND_LAST = 0.6;
  var SHADOW_DECAY_PER_YEAR = 0.15;
  var COMEBACK_RUST_PER_YEAR = 0.08;
  var ACADEMY_DEV_CHANCE = 0.45;
  var ACADEMY_DEV_TIER_BUMP_CHANCE = 0.55;
  var ACADEMY_DEV_SHADOW_TIER = 0.28;
  var ACADEMY_DEV_SHADOW_SOFT = 0.14;
  var INACTIVE_POOL_DRIFT_RATE = 0.22;
  var GRADE_NEUTRAL2 = 5.5;
  var clamp3 = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  var NEUTRAL_META = {
    metaOverride: null,
    metaEnabled: false,
    synergyOverride: null,
    counterOverride: null
  };
  function inactiveMarketGrade(entry) {
    const last = entry.lastActiveGrade;
    const shadow = entry.shadowGrade;
    if (last == null && shadow == null) return null;
    if (last == null) return shadow;
    if (shadow == null) return last;
    const years = Math.max(0, (entry.inactiveYears < 1 ? 1 : entry.inactiveYears) - 1);
    const lastW = clamp3(SHADOW_BLEND_LAST - SHADOW_DECAY_PER_YEAR * years, 0.25, 0.85);
    return last * lastW + shadow * (1 - lastW);
  }
  function inactiveTransferValue(entry, byId, meta) {
    return transferValue(entry.player, inactiveMarketGrade(entry), byId, meta);
  }
  function inactiveValueBreakdown(entry, byId, meta) {
    const grade = inactiveMarketGrade(entry);
    const tier = PLAYER_TIER_VALUE[entry.player.tier];
    const form = grade != null ? 0.35 * (grade - GRADE_NEUTRAL2) : 0;
    const metaFit = 0.4 * poolFit(entry.player, byId, meta);
    const acc = Math.max(0, Math.min(1, entry.player.acclimation ?? 1));
    const total = tier + form + metaFit - 0.5 * (1 - acc);
    return { total, tier, form, metaFit };
  }
  function applyComebackRust(player, inactiveYears, toLeagueId) {
    const years = Math.max(0, inactiveYears < 1 ? 0 : inactiveYears - 1);
    const rust = clamp3(1 - COMEBACK_RUST_PER_YEAR * years, 0.35, 1);
    const home = player.homeRegion;
    let baseAcc = player.acclimation ?? 1;
    if (home && toLeagueId && home !== toLeagueId) baseAcc = 0.5;
    else if (home && toLeagueId && home === toLeagueId) baseAcc = 1;
    return { ...player, badStreak: 0, acclimation: clamp3(baseAcc * rust, 0.2, 1) };
  }
  function tickInactiveYear(entry, champions, rng) {
    let player = entry.player;
    let developed = false;
    const grade = inactiveMarketGrade(entry);
    const expected = GRADE_NEUTRAL2 + PLAYER_TIER_VALUE[player.tier] * 0.7;
    const prevShadow = entry.shadowGrade ?? grade ?? expected;
    const academyBoost = entry.status === "academy" ? 0.2 + rng() * 0.45 : 0;
    const noise = (rng() - 0.5) * 1.1;
    let shadowGrade = clamp3(
      prevShadow * 0.5 + expected * 0.5 + noise + academyBoost,
      1,
      10
    );
    if (entry.status === "academy" && rng() < ACADEMY_DEV_CHANCE) {
      const tierVal = PLAYER_TIER_VALUE[player.tier];
      const potVal = PLAYER_TIER_VALUE[player.potential ?? player.tier];
      if (tierVal < potVal && rng() < ACADEMY_DEV_TIER_BUMP_CHANCE) {
        player = { ...player, tier: valueToTier(tierVal + 1) };
        shadowGrade = clamp3(shadowGrade + ACADEMY_DEV_SHADOW_TIER, 1, 10);
        developed = true;
      } else if (potVal < 3) {
        player = { ...player, potential: valueToTier(potVal + 1) };
        if (tierVal < potVal + 1 && rng() < 0.28) {
          player = { ...player, tier: valueToTier(tierVal + 1) };
        }
        shadowGrade = clamp3(shadowGrade + ACADEMY_DEV_SHADOW_SOFT, 1, 10);
        developed = true;
      } else if (tierVal < 2 && rng() < 0.12) {
        player = { ...player, tier: valueToTier(tierVal + 1) };
        developed = true;
      } else {
        shadowGrade = clamp3(shadowGrade + ACADEMY_DEV_SHADOW_SOFT, 1, 10);
        developed = true;
      }
    }
    if (rng() < INACTIVE_POOL_DRIFT_RATE) {
      player = driftPlayerPool(player, champions, rng);
    }
    return { player, shadowGrade, developed };
  }
  function eligibleAcademy(pool, lane, teamId, excludePlayerIds) {
    return pool.map((entry, idx) => ({ entry, idx })).filter(
      ({ entry }) => entry.status === "academy" && entry.player.lane === lane && !!entry.player.id && entry.lastTeamId === teamId && !excludePlayerIds?.has(entry.player.id)
    );
  }
  function eligibleFa(pool, lane, excludePlayerIds) {
    return pool.map((entry, idx) => ({ entry, idx })).filter(
      ({ entry }) => entry.status === "free-agent" && entry.player.lane === lane && !!entry.player.id && !excludePlayerIds?.has(entry.player.id)
    );
  }
  function pickScoredReturnee(pool, lane, teamId, byId, meta, rng, excludePlayerIds) {
    const academy = eligibleAcademy(pool, lane, teamId, excludePlayerIds);
    const fas = eligibleFa(pool, lane, excludePlayerIds);
    if (academy.length === 0 && fas.length === 0) return null;
    const score = (e) => inactiveTransferValue(e, byId, meta);
    academy.sort((a, b) => score(b.entry) - score(a.entry) || (rng() < 0.5 ? -1 : 1));
    fas.sort((a, b) => score(b.entry) - score(a.entry) || (rng() < 0.5 ? -1 : 1));
    const bestAcy = academy[0] ?? null;
    const bestFa = fas[0] ?? null;
    const acyV = bestAcy ? score(bestAcy.entry) : -Infinity;
    const faV = bestFa ? score(bestFa.entry) : -Infinity;
    if (bestAcy && (!bestFa || faV < acyV + ACADEMY_PASS_GAP)) {
      if (acyV < ROOKIE_VALUE_FLOOR) return null;
      return { idx: bestAcy.idx, entry: bestAcy.entry, marketNote: "academy-recall" };
    }
    if (bestFa) {
      if (faV < ROOKIE_VALUE_FLOOR) return null;
      return {
        idx: bestFa.idx,
        entry: bestFa.entry,
        ...bestAcy?.entry.player.name ? { passedAcademyName: bestAcy.entry.player.name, marketNote: "academy-pass" } : { marketNote: "fa-sign" }
      };
    }
    return null;
  }
  function resolveCompetitiveFills(vacancies, pool, byId, meta, rng, excludePlayerIds, bidBoost) {
    const working = [...pool];
    const fills = [];
    const claimed = /* @__PURE__ */ new Set();
    const faLocked = /* @__PURE__ */ new Set();
    for (let vi = 0; vi < vacancies.length; vi++) {
      const v = vacancies[vi];
      const academy = eligibleAcademy(working, v.lane, v.teamId, excludePlayerIds).filter(
        (c) => !faLocked.has(c.idx)
      );
      if (academy.length === 0) continue;
      academy.sort(
        (a, b) => inactiveTransferValue(b.entry, byId, meta) - inactiveTransferValue(a.entry, byId, meta)
      );
      const bestAcy = academy[0];
      const acyV = inactiveTransferValue(bestAcy.entry, byId, meta);
      const fas = eligibleFa(working, v.lane, excludePlayerIds).filter(
        (c) => !faLocked.has(c.idx)
      );
      let bestFaV = -Infinity;
      for (const f of fas) {
        bestFaV = Math.max(bestFaV, inactiveTransferValue(f.entry, byId, meta));
      }
      if (bestFaV < acyV + ACADEMY_PASS_GAP) {
        if (acyV < ROOKIE_VALUE_FLOOR) continue;
        const entrant = applyComebackRust(
          bestAcy.entry.player,
          bestAcy.entry.inactiveYears,
          v.leagueId
        );
        faLocked.add(bestAcy.idx);
        claimed.add(vi);
        fills.push({
          vacancy: v,
          entrant,
          source: "academy",
          poolIdx: bestAcy.idx,
          marketNote: "academy-recall"
        });
      }
    }
    const bids = [];
    for (let vi = 0; vi < vacancies.length; vi++) {
      if (claimed.has(vi)) continue;
      const v = vacancies[vi];
      for (const { entry, idx } of eligibleFa(working, v.lane, excludePlayerIds)) {
        if (faLocked.has(idx)) continue;
        const rawValue = inactiveTransferValue(entry, byId, meta);
        const boost = bidBoost ? bidBoost(entry, v) : 0;
        bids.push({
          vi,
          poolIdx: idx,
          value: rawValue + boost,
          rawValue,
          ...entry.player.name ? { faName: entry.player.name } : {}
        });
      }
    }
    bids.sort((a, b) => b.value - a.value || (rng() < 0.5 ? -1 : 1));
    const vacancyTaken = new Set(claimed);
    const faNamesByVacancy = /* @__PURE__ */ new Map();
    for (const b of bids) {
      if (!b.faName) continue;
      const arr = faNamesByVacancy.get(b.vi) ?? [];
      arr.push(b.faName);
      faNamesByVacancy.set(b.vi, arr);
    }
    for (const b of bids) {
      if (vacancyTaken.has(b.vi) || faLocked.has(b.poolIdx)) continue;
      if (b.rawValue < ROOKIE_VALUE_FLOOR) continue;
      const v = vacancies[b.vi];
      const entry = working[b.poolIdx];
      const academy = eligibleAcademy(working, v.lane, v.teamId, excludePlayerIds);
      const passed = academy[0]?.entry.player.name;
      const entrant = applyComebackRust(entry.player, entry.inactiveYears, v.leagueId);
      vacancyTaken.add(b.vi);
      faLocked.add(b.poolIdx);
      const rivals = (faNamesByVacancy.get(b.vi) ?? []).filter((n) => n !== entrant.name);
      const agencyNote = bidBoost && b.value - b.rawValue >= 0.4;
      fills.push({
        vacancy: v,
        entrant,
        source: "free-agent",
        poolIdx: b.poolIdx,
        ...passed ? { passedAcademyName: passed, marketNote: "academy-pass" } : {
          marketNote: agencyNote ? "agency-sign" : "fa-sign"
        },
        ...rivals.length > 0 ? { beatenNames: rivals.slice(0, 2) } : {}
      });
    }
    const removeIdx = [...faLocked].sort((a, b) => b - a);
    const remainingPool = [...working];
    for (const idx of removeIdx) remainingPool.splice(idx, 1);
    return { fills, remainingPool };
  }
  function runOpenFaReplacePass(teams, pool, byId, meta, outcomesById, rng, demoteYear, opts) {
    let working = [...pool];
    const news = [];
    const resultTeams = teams.map((t) => ({ id: t.id, players: [...t.players] }));
    const teamReplaces = /* @__PURE__ */ new Map();
    const usedSlot = /* @__PURE__ */ new Set();
    const skip = opts?.skipTeamIds;
    const attemptChance = opts?.attemptChance ?? 1;
    const allowTeam = /* @__PURE__ */ new Set();
    for (const t of teams) {
      if (skip?.has(t.id)) continue;
      if (attemptChance >= 1 || rng() < attemptChance) allowTeam.add(t.id);
    }
    let guard = teams.length * MAX_OPEN_FA_REPLACES_PER_TEAM + 2;
    while (guard-- > 0) {
      let best = null;
      for (let ti = 0; ti < resultTeams.length; ti++) {
        if (!allowTeam.has(teams[ti].id)) continue;
        const used = teamReplaces.get(ti) ?? 0;
        if (used >= MAX_OPEN_FA_REPLACES_PER_TEAM) continue;
        const roster = resultTeams[ti].players;
        for (let slot = 0; slot < roster.length; slot++) {
          if (usedSlot.has(`${ti}:${slot}`)) continue;
          const incumbent = roster[slot];
          const incV = transferValue(
            incumbent,
            incumbent.id ? outcomesById.get(incumbent.id)?.grade ?? null : null,
            byId,
            meta
          );
          for (let pi = 0; pi < working.length; pi++) {
            const fa = working[pi];
            if (fa.status !== "free-agent" || fa.player.lane !== incumbent.lane || !fa.player.id) {
              continue;
            }
            const gain = inactiveTransferValue(fa, byId, meta) - incV;
            if (gain >= FA_OPEN_REPLACE_GAP && (!best || gain > best.gain)) {
              best = { teamIdx: ti, slot, poolIdx: pi, gain, fa, incumbent };
            }
          }
        }
      }
      if (!best) break;
      const team = teams[best.teamIdx];
      const entrant = applyComebackRust(best.fa.player, best.fa.inactiveYears, team.leagueId);
      if (best.incumbent.id && entrant.id && best.incumbent.id === entrant.id) {
        working.splice(best.poolIdx, 1);
        if (PLAYER_TIER_VALUE[entrant.tier] > PLAYER_TIER_VALUE[best.incumbent.tier]) {
          resultTeams[best.teamIdx].players[best.slot] = {
            ...best.incumbent,
            tier: entrant.tier,
            potential: entrant.potential ?? best.incumbent.potential
          };
        }
        continue;
      }
      const vacant = isRosterVacancy(best.incumbent);
      working.splice(best.poolIdx, 1);
      if (!vacant) {
        const grade = best.incumbent.id ? outcomesById.get(best.incumbent.id)?.grade ?? null : null;
        const parked = addToTeamAcademy(working, {
          player: { ...best.incumbent, badStreak: 0 },
          status: "academy",
          inactiveTenure: { academyYears: 0, freeAgentYears: 0 },
          inactiveYears: 1,
          demotedYear: demoteYear,
          clockYear: demoteYear,
          lastTeamId: team.id,
          lastTeamName: team.name,
          ...grade != null ? { lastActiveGrade: grade, shadowGrade: grade } : {}
        });
        working = parked.pool;
        if (parked.bumped) news.push(makeBecameFaNews(parked.bumped, "academy-bump"));
      }
      resultTeams[best.teamIdx].players[best.slot] = entrant;
      teamReplaces.set(best.teamIdx, (teamReplaces.get(best.teamIdx) ?? 0) + 1);
      usedSlot.add(`${best.teamIdx}:${best.slot}`);
      const openFaNews = {
        teamId: team.id,
        lane: entrant.lane,
        ...!vacant && best.incumbent.name ? { departedName: best.incumbent.name } : {},
        ...!vacant ? { departedTier: best.incumbent.tier } : {},
        ...!vacant && best.incumbent.age != null ? { departedAge: best.incumbent.age } : {},
        ...!vacant && best.incumbent.id ? { departedId: best.incumbent.id } : {},
        ...!vacant ? { departedDestination: "academy" } : {},
        entrantName: entrant.name ?? "",
        entrantTier: entrant.tier,
        entrantPotential: entrant.potential ?? entrant.tier,
        ...entrant.id ? { entrantId: entrant.id } : {},
        entrantSource: "free-agent",
        marketNote: "open-fa",
        ...!vacant && best.incumbent.name ? { beatenNames: [best.incumbent.name] } : {}
      };
      if (!isSamePlayerReplaceNoise(openFaNews)) news.push(openFaNews);
    }
    return { teams: resultTeams, inactivePool: working, news };
  }
  function runOpenAcademyReplacePass(teams, pool, byId, meta, outcomesById, rng, demoteYear, opts) {
    let working = [...pool];
    const news = [];
    const resultTeams = teams.map((t) => ({ id: t.id, players: [...t.players] }));
    const teamPromotes = /* @__PURE__ */ new Map();
    const usedSlot = /* @__PURE__ */ new Set();
    const skip = opts?.skipTeamIds;
    const exclude = opts?.excludePlayerIds;
    const rolled = /* @__PURE__ */ new Set();
    let guard = teams.length * MAX_OPEN_ACADEMY_PROMOTES_PER_TEAM + 2;
    while (guard-- > 0) {
      let best = null;
      for (let ti = 0; ti < resultTeams.length; ti++) {
        if (skip?.has(teams[ti].id)) continue;
        const used = teamPromotes.get(ti) ?? 0;
        if (used >= MAX_OPEN_ACADEMY_PROMOTES_PER_TEAM) continue;
        if (!rolled.has(ti)) {
          rolled.add(ti);
          if (rng() > AI_ACADEMY_PROMOTE_CHANCE) {
            teamPromotes.set(ti, MAX_OPEN_ACADEMY_PROMOTES_PER_TEAM);
            continue;
          }
        }
        const roster = resultTeams[ti].players;
        const teamId = teams[ti].id;
        for (let slot = 0; slot < roster.length; slot++) {
          if (usedSlot.has(`${ti}:${slot}`)) continue;
          const incumbent = roster[slot];
          if (isRosterVacancy(incumbent)) continue;
          const incV = transferValue(
            incumbent,
            incumbent.id ? outcomesById.get(incumbent.id)?.grade ?? null : null,
            byId,
            meta
          );
          for (let pi = 0; pi < working.length; pi++) {
            const acy = working[pi];
            if (acy.status !== "academy" || acy.lastTeamId !== teamId || acy.player.lane !== incumbent.lane || !acy.player.id) {
              continue;
            }
            if (exclude?.has(acy.player.id)) continue;
            const gain = inactiveTransferValue(acy, byId, meta) - incV;
            if (gain >= ACADEMY_OPEN_REPLACE_GAP && (!best || gain > best.gain)) {
              best = { teamIdx: ti, slot, poolIdx: pi, gain, acy, incumbent };
            }
          }
        }
      }
      if (!best) break;
      const team = teams[best.teamIdx];
      const entrant = applyComebackRust(best.acy.player, best.acy.inactiveYears, team.leagueId);
      if (best.incumbent.id && entrant.id && best.incumbent.id === entrant.id) {
        working.splice(best.poolIdx, 1);
        if (PLAYER_TIER_VALUE[entrant.tier] > PLAYER_TIER_VALUE[best.incumbent.tier]) {
          resultTeams[best.teamIdx].players[best.slot] = {
            ...best.incumbent,
            tier: entrant.tier,
            potential: entrant.potential ?? best.incumbent.potential
          };
        }
        continue;
      }
      const grade = best.incumbent.id ? outcomesById.get(best.incumbent.id)?.grade ?? null : null;
      working.splice(best.poolIdx, 1);
      const parked = addToTeamAcademy(working, {
        player: { ...best.incumbent, badStreak: 0 },
        status: "academy",
        inactiveTenure: { academyYears: 0, freeAgentYears: 0 },
        inactiveYears: 1,
        demotedYear: demoteYear,
        clockYear: demoteYear,
        lastTeamId: team.id,
        lastTeamName: team.name,
        ...grade != null ? { lastActiveGrade: grade, shadowGrade: grade } : {}
      });
      working = parked.pool;
      if (parked.bumped) news.push(makeBecameFaNews(parked.bumped, "academy-bump"));
      resultTeams[best.teamIdx].players[best.slot] = entrant;
      teamPromotes.set(best.teamIdx, (teamPromotes.get(best.teamIdx) ?? 0) + 1);
      usedSlot.add(`${best.teamIdx}:${best.slot}`);
      const recallNews = {
        teamId: team.id,
        lane: entrant.lane,
        ...best.incumbent.name ? { departedName: best.incumbent.name } : {},
        departedTier: best.incumbent.tier,
        ...best.incumbent.age != null ? { departedAge: best.incumbent.age } : {},
        ...best.incumbent.id ? { departedId: best.incumbent.id } : {},
        entrantName: entrant.name ?? "",
        entrantTier: entrant.tier,
        entrantPotential: entrant.potential ?? entrant.tier,
        ...entrant.id ? { entrantId: entrant.id } : {},
        entrantSource: "academy",
        marketNote: "academy-recall",
        departedDestination: "academy",
        ...best.incumbent.name ? { beatenNames: [best.incumbent.name] } : {}
      };
      if (!isSamePlayerReplaceNoise(recallNews)) news.push(recallNews);
    }
    return { teams: resultTeams, inactivePool: working, news };
  }
  function executeUserAcademyRecall(teams, pool, teamId, lane, academyPlayerId, byId, meta, year, gradeOf, opts) {
    const passthrough = {
      teams: teams.map((t) => ({ id: t.id, players: [...t.players] })),
      inactivePool: [...pool],
      news: []
    };
    if (opts?.excludePlayerIds?.has(academyPlayerId)) {
      return { ...passthrough, ok: false, reason: "same-window-demote" };
    }
    const team = teams.find((t) => t.id === teamId);
    if (!team) return { ...passthrough, ok: false, reason: "no-team" };
    const slot = team.players.findIndex((p) => p.lane === lane);
    if (slot < 0) return { ...passthrough, ok: false, reason: "no-slot" };
    const acyIdx = pool.findIndex(
      (e) => e.status === "academy" && e.lastTeamId === teamId && e.player.id === academyPlayerId && e.player.lane === lane
    );
    if (acyIdx < 0) return { ...passthrough, ok: false, reason: "acy-gone" };
    const acy = pool[acyIdx];
    const incumbent = team.players[slot];
    const vacant = isRosterVacancy(incumbent);
    const requireGap = opts?.requireGap ?? true;
    if (requireGap && !vacant) {
      const incGrade = incumbent.id && gradeOf ? gradeOf(incumbent.id) : null;
      const gain = inactiveTransferValue(acy, byId, meta) - transferValue(incumbent, incGrade, byId, meta);
      if (gain < ACADEMY_OPEN_REPLACE_GAP) {
        return { ...passthrough, ok: false, reason: "gap" };
      }
    }
    const entrant = applyComebackRust(acy.player, acy.inactiveYears, team.leagueId);
    let nextPool = pool.filter((_, i) => i !== acyIdx);
    const newsOut = [];
    if (!vacant) {
      const grade = incumbent.id && gradeOf ? gradeOf(incumbent.id) : null;
      const parked = addToTeamAcademy(nextPool, {
        player: { ...incumbent, badStreak: 0 },
        status: "academy",
        inactiveTenure: { academyYears: 0, freeAgentYears: 0 },
        inactiveYears: 1,
        demotedYear: year,
        clockYear: year,
        lastTeamId: team.id,
        lastTeamName: team.name,
        ...grade != null ? { lastActiveGrade: grade, shadowGrade: grade } : {}
      });
      nextPool = parked.pool;
      if (parked.bumped) newsOut.push(makeBecameFaNews(parked.bumped, "academy-bump"));
    }
    const nextTeams = teams.map((t) => {
      if (t.id !== teamId) return { id: t.id, players: [...t.players] };
      const players = [...t.players];
      players[slot] = entrant;
      return { id: t.id, players };
    });
    return {
      teams: nextTeams,
      inactivePool: nextPool,
      news: [
        ...newsOut,
        {
          teamId,
          lane,
          ...!vacant && incumbent.name ? { departedName: incumbent.name } : {},
          ...!vacant ? { departedTier: incumbent.tier } : {},
          ...!vacant && incumbent.age != null ? { departedAge: incumbent.age } : {},
          ...!vacant && incumbent.id ? { departedId: incumbent.id } : {},
          entrantName: entrant.name ?? "",
          entrantTier: entrant.tier,
          entrantPotential: entrant.potential ?? entrant.tier,
          ...entrant.id ? { entrantId: entrant.id } : {},
          entrantSource: "academy",
          marketNote: "academy-recall",
          ...!vacant ? { departedDestination: "academy" } : {},
          ...!vacant && incumbent.name ? { beatenNames: [incumbent.name] } : {}
        }
      ],
      ok: true
    };
  }
  function academyReleaseScore(entry, orgAcademy, byId, meta) {
    const value = inactiveTransferValue(entry, byId, meta);
    const breakdown = inactiveValueBreakdown(entry, byId, meta);
    let score = 0;
    if (value <= AI_ACADEMY_RELEASE_MAX_VALUE) {
      score += 1.4 + (AI_ACADEMY_RELEASE_MAX_VALUE - value);
    }
    if (breakdown.metaFit < -0.15) score += 0.6;
    let bestMateVal = -Infinity;
    for (const m of orgAcademy) {
      if (m.player.id === entry.player.id) continue;
      if (m.player.lane !== entry.player.lane) continue;
      bestMateVal = Math.max(bestMateVal, inactiveTransferValue(m, byId, meta));
    }
    if (bestMateVal > -Infinity) {
      const gap = bestMateVal - value;
      if (gap >= 0.45) score += 1.2 + Math.min(2, gap);
    }
    const age = entry.player.age ?? 22;
    const shadow = entry.shadowGrade ?? entry.lastActiveGrade ?? GRADE_NEUTRAL2;
    if (age >= 26 && shadow < 5.2) score += 1.2;
    if (age >= 28) score += 0.7;
    if (shadow < 4.5) score += 0.9;
    const years = Math.max(1, entry.inactiveYears < 1 ? 1 : entry.inactiveYears);
    const tenure = academyTenureYears(entry);
    if (years >= tenure) score += 2;
    else if (years >= tenure - 1) score += 1.2;
    return score;
  }
  function runAiAcademyReleasePass(teams, pool, byId, meta, rng, releaseYear, opts) {
    let working = [...pool];
    const news = [];
    const skip = opts?.skipTeamIds;
    const exclude = opts?.excludePlayerIds;
    const releasedByTeam = /* @__PURE__ */ new Map();
    for (const team of teams) {
      if (skip?.has(team.id)) continue;
      if ((releasedByTeam.get(team.id) ?? 0) >= MAX_AI_ACADEMY_RELEASE_PER_TEAM) continue;
      if (countTeamAcademy(working, team.id) < AI_ACADEMY_RELEASE_MIN_COUNT) continue;
      if (rng() > AI_ACADEMY_RELEASE_CHANCE) continue;
      const org = working.filter(
        (e) => e.status === "academy" && e.lastTeamId === team.id && !!e.player.id
      );
      let bestIdx = -1;
      let bestScore = -Infinity;
      for (let i = 0; i < working.length; i++) {
        const e = working[i];
        if (e.status !== "academy" || e.lastTeamId !== team.id || !e.player.id) continue;
        if (exclude?.has(e.player.id)) continue;
        const s = academyReleaseScore(e, org, byId, meta);
        if (s < AI_ACADEMY_RELEASE_MIN_SCORE) continue;
        if (s > bestScore || s === bestScore && rng() < 0.5) {
          bestScore = s;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) continue;
      const victim = working[bestIdx];
      const pid = victim.player.id;
      const { pool: next, released } = releaseAcademyToFa(
        working,
        team.id,
        pid,
        releaseYear
      );
      if (!released) continue;
      working = next;
      releasedByTeam.set(team.id, (releasedByTeam.get(team.id) ?? 0) + 1);
      news.push(makeBecameFaNews(released, "academy-release"));
    }
    return { inactivePool: working, news };
  }
  function executeAddAcademyRookie(pool, teamId, teamName, rookie, year) {
    const passthrough = {
      inactivePool: [...pool],
      news: []
    };
    if (!teamAcademyHasRoom(pool, teamId)) {
      return { ...passthrough, ok: false, reason: "academy-full" };
    }
    if (!rookie.id) return { ...passthrough, ok: false, reason: "no-id" };
    const nextPool = addToTeamAcademy(pool, {
      player: { ...rookie, badStreak: 0 },
      status: "academy",
      inactiveTenure: { academyYears: 0, freeAgentYears: 0 },
      inactiveYears: 1,
      demotedYear: year,
      clockYear: year,
      lastTeamId: teamId,
      lastTeamName: teamName
    }).pool;
    return {
      inactivePool: nextPool,
      news: [
        {
          teamId,
          lane: rookie.lane,
          entrantName: rookie.name ?? "",
          entrantTier: rookie.tier,
          entrantPotential: rookie.potential ?? rookie.tier,
          entrantId: rookie.id,
          entrantSource: "rookie",
          marketNote: "academy-rookie"
        }
      ],
      ok: true
    };
  }
  function shallowestAcademyLane(pool, teamId, lanes, rng) {
    const counts = /* @__PURE__ */ new Map();
    for (const lane of lanes) counts.set(lane, 0);
    for (const e of pool) {
      if (e.status !== "academy" || e.lastTeamId !== teamId) continue;
      counts.set(e.player.lane, (counts.get(e.player.lane) ?? 0) + 1);
    }
    let best = lanes[0];
    let bestN = Infinity;
    for (const lane of lanes) {
      const n = counts.get(lane) ?? 0;
      if (n < bestN || n === bestN && rng() < 0.5) {
        bestN = n;
        best = lane;
      }
    }
    return best;
  }
  function runAiAcademyStashPass(teams, pool, byId, meta, rng, stashYear, opts) {
    let working = [...pool];
    const news = [];
    const skip = opts?.skipTeamIds;
    const stashedByTeam = /* @__PURE__ */ new Map();
    const midSplit = opts?.midSplit ?? false;
    const chance = midSplit ? AI_ACADEMY_STASH_CHANCE_MID_SPLIT : AI_ACADEMY_STASH_CHANCE;
    const allowTeam = /* @__PURE__ */ new Set();
    for (const t of teams) {
      if (skip?.has(t.id)) continue;
      if (chance >= 1 || rng() < chance) allowTeam.add(t.id);
    }
    const faCount = working.filter((e) => e.status === "free-agent").length;
    if (faCount < AI_ACADEMY_ROOKIE_FA_THIN) {
      return { inactivePool: working, news };
    }
    let guard = teams.length * MAX_AI_ACADEMY_STASH_PER_TEAM + 2;
    while (guard-- > 0) {
      let best = null;
      for (let ti = 0; ti < teams.length; ti++) {
        const team2 = teams[ti];
        if (!allowTeam.has(team2.id)) continue;
        if ((stashedByTeam.get(team2.id) ?? 0) >= MAX_AI_ACADEMY_STASH_PER_TEAM) continue;
        if (!teamAcademyHasRoom(working, team2.id)) continue;
        for (let pi = 0; pi < working.length; pi++) {
          const fa2 = working[pi];
          if (fa2.status !== "free-agent" || !fa2.player.id) continue;
          const value = inactiveTransferValue(fa2, byId, meta);
          if (value < AI_ACADEMY_STASH_MIN_VALUE) continue;
          const incumbent = team2.players.find((p) => p.lane === fa2.player.lane);
          if (incumbent && !isRosterVacancy(incumbent)) {
            const gain = value - transferValue(incumbent, null, byId, meta);
            if (gain >= FA_OPEN_REPLACE_GAP) continue;
          }
          if (!best || value > best.value || value === best.value && rng() < 0.5) {
            best = { teamIdx: ti, poolIdx: pi, value, fa: fa2 };
          }
        }
      }
      if (!best) break;
      const team = teams[best.teamIdx];
      const fa = working[best.poolIdx];
      working.splice(best.poolIdx, 1);
      working = addToTeamAcademy(working, {
        player: { ...fa.player, badStreak: 0 },
        status: "academy",
        inactiveTenure: fa.inactiveTenure ? { ...fa.inactiveTenure } : void 0,
        inactiveYears: 1,
        demotedYear: fa.demotedYear,
        clockYear: stashYear,
        lastTeamId: team.id,
        lastTeamName: team.name,
        ...fa.lastActiveGrade != null ? { lastActiveGrade: fa.lastActiveGrade, shadowGrade: fa.shadowGrade ?? fa.lastActiveGrade } : fa.shadowGrade != null ? { shadowGrade: fa.shadowGrade } : {}
      }).pool;
      stashedByTeam.set(team.id, (stashedByTeam.get(team.id) ?? 0) + 1);
      news.push({
        teamId: team.id,
        lane: fa.player.lane,
        entrantName: fa.player.name ?? "",
        entrantTier: fa.player.tier,
        entrantPotential: fa.player.potential ?? fa.player.tier,
        ...fa.player.id ? { entrantId: fa.player.id } : {},
        entrantSource: "free-agent",
        marketNote: "academy-stash"
      });
      if (working.filter((e) => e.status === "free-agent").length < AI_ACADEMY_ROOKIE_FA_THIN) {
        break;
      }
    }
    return { inactivePool: working, news };
  }
  function graduatePressureValue(entry) {
    const tier = PLAYER_TIER_VALUE[entry.player.tier] ?? 0;
    const pot = entry.player.potential ? PLAYER_TIER_VALUE[entry.player.potential] ?? tier : tier;
    const shadow = entry.shadowGrade ?? entry.lastActiveGrade ?? GRADE_NEUTRAL2;
    return tier + 0.35 * pot + 0.08 * (shadow - GRADE_NEUTRAL2);
  }
  function academyTenureYears(entry) {
    const v = graduatePressureValue(entry);
    const base = v < ACADEMY_EARLY_EXIT_MAX_VALUE ? ACADEMY_YEARS_MIN : v >= ACADEMY_EXTEND_MIN_VALUE ? ACADEMY_YEARS_MAX : ACADEMY_YEARS;
    const shift = entry.academyTenureShift ?? 0;
    if (shift === 0) return base;
    return Math.max(1, Math.min(ACADEMY_YEARS_MAX, base + shift));
  }
  function applyAcademyGraduateCap(before, after) {
    const beforeById = new Map(
      before.filter((e) => e.player.id).map((e) => [e.player.id, e])
    );
    const graduateIdx = [];
    for (let i = 0; i < after.length; i++) {
      const e = after[i];
      if (e.status !== "free-agent" || !e.player.id) continue;
      const prev = beforeById.get(e.player.id);
      if (prev?.status === "academy") graduateIdx.push(i);
    }
    if (graduateIdx.length === 0) return [...after];
    const snapFa = (e) => toFreeAgentFromAcademy(e);
    if (graduateIdx.length <= ACADEMY_GRADUATE_CAP_PER_YEAR) {
      const set = new Set(graduateIdx);
      return after.map((e, i) => set.has(i) ? snapFa(e) : e);
    }
    const ranked = graduateIdx.map((i) => ({ i, v: graduatePressureValue(after[i]) })).sort((a, b) => b.v - a.v || a.i - b.i);
    const keepFa = new Set(
      ranked.slice(0, ACADEMY_GRADUATE_CAP_PER_YEAR).map((r) => r.i)
    );
    const gradSet = new Set(graduateIdx);
    return after.map((e, i) => {
      if (!gradSet.has(i)) return e;
      if (keepFa.has(i)) return snapFa(e);
      const prev = e.player.id ? beforeById.get(e.player.id) : void 0;
      const advancedYears = prev ? (prev.inactiveYears < 1 ? 1 : prev.inactiveYears) + 1 : e.inactiveYears < 1 ? 1 : e.inactiveYears;
      if (advancedYears <= ACADEMY_YEARS_MAX) {
        return { ...e, status: "academy", inactiveYears: advancedYears };
      }
      return { ...e, status: "retired", inactiveYears: advancedYears };
    });
  }
  function applyFaGraduatePressure(before, after) {
    const beforeById = new Map(
      before.filter((e) => e.player.id).map((e) => [e.player.id, e])
    );
    const faExcludingGraduates = after.filter((e) => {
      if (e.status !== "free-agent" || !e.player.id) return false;
      const prev = beforeById.get(e.player.id);
      return !(prev?.status === "academy");
    }).length;
    if (faExcludingGraduates < TARGET_FA_POOL.max) return [...after];
    const graduateIdx = [];
    for (let i = 0; i < after.length; i++) {
      const e = after[i];
      if (e.status !== "free-agent" || !e.player.id) continue;
      const prev = beforeById.get(e.player.id);
      if (prev?.status === "academy") graduateIdx.push(i);
    }
    if (graduateIdx.length <= FA_OVERFLOW_KEEP_GRADUATES) return [...after];
    const ranked = graduateIdx.map((i) => ({ i, v: graduatePressureValue(after[i]) })).sort((a, b) => b.v - a.v || a.i - b.i);
    const retireIdx = new Set(ranked.slice(FA_OVERFLOW_KEEP_GRADUATES).map((r) => r.i));
    return after.map((e, i) => retireIdx.has(i) ? { ...e, status: "retired" } : e);
  }
  function cullWeakFaWhenOversized(pool) {
    const faIdx = [];
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].status === "free-agent") faIdx.push(i);
    }
    if (faIdx.length <= FA_OVERFLOW_ACCEL_ABOVE) return [...pool];
    const eligible = faIdx.filter((i) => {
      const y = pool[i].inactiveYears < 1 ? 1 : pool[i].inactiveYears;
      return y >= ACADEMY_YEARS + 2;
    }).map((i) => ({ i, v: graduatePressureValue(pool[i]) })).sort((a, b) => a.v - b.v || a.i - b.i);
    const excess = faIdx.length - TARGET_FA_POOL.max;
    if (excess <= 0 || eligible.length === 0) return [...pool];
    const retireIdx = new Set(eligible.slice(0, excess).map((r) => r.i));
    if (retireIdx.size === 0) return [...pool];
    return pool.map((e, i) => retireIdx.has(i) ? { ...e, status: "retired" } : e);
  }

  // lib/season/rosterNews.ts
  function currentOffseasonRosterNews(season) {
    return (season.rosterNews ?? []).filter((news, index) => {
      if (news.origin) return !!season.id && belongsToMarketWindow(news.origin, { id: season.id, franchise: season.franchise }, "Offseason");
      return season.offseasonRosterNewsBaseline != null && index >= season.offseasonRosterNewsBaseline && news.timeMark === "Offseason";
    });
  }
  function initializeOffseasonRosterNewsBoundary(season) {
    return season.status === "complete" && season.offseasonRosterNewsBaseline == null ? { ...season, offseasonRosterNewsBaseline: season.rosterNews?.length ?? 0 } : season;
  }

  // lib/draftAI/personalities.ts
  var PERSONALITIES = {
    balanced: {
      id: "balanced",
      name: "Balanced",
      description: "The default drafter \u2014 weighs meta, synergy, matchups and comfort evenly.",
      // Empty = every component at weight 1 → exact current behavior.
      weights: {}
    },
    "meta-slave": {
      id: "meta-slave",
      name: "Meta Slave",
      description: "Follows the tier list religiously \u2014 S-tier or nothing, no pocket picks.",
      weights: {
        metaTier: 1.6,
        playerComfort: 0.6,
        laneMatchup: 0.9,
        crossGameCounter: 0.85
      },
      // Sharp, near-deterministic sampling: always the top of the tier list.
      sampling: {
        pickTemperatureMul: 0.45,
        banTemperatureMul: 0.45,
        pickTopNDelta: -1,
        banTopNDelta: -1
      },
      pocketPickProbMul: 0
    },
    "comfort-first": {
      id: "comfort-first",
      name: "Comfort First",
      description: "Drafts around its players' champion pools, even when they're off-meta.",
      weights: {
        playerComfort: 3.5,
        metaTier: 0.75,
        // Values enemy pools too — understands what a signature pick is worth.
        targetBan: 1.4
      },
      sampling: { pickTemperatureMul: 0.9 },
      pocketPickProbMul: 2,
      offMetaComfortBonus: 2.5
    },
    "counter-picker": {
      id: "counter-picker",
      name: "Counter Picker",
      description: "Reactive drafter \u2014 lives for lane counters, target bans and prediction.",
      weights: {
        laneMatchup: 1.8,
        crossGameCounter: 1.7,
        targetBan: 1.5,
        threatBan: 1.3,
        lookahead: 1.5,
        metaTier: 0.85
      },
      sampling: { pickTemperatureMul: 0.8 }
    },
    cheese: {
      id: "cheese",
      name: "Cheese Merchant",
      description: "Chaotic pocket picks and surprise bans \u2014 expect the unexpected.",
      weights: {
        metaTier: 0.6,
        playerComfort: 1.5,
        laneMatchup: 0.8,
        // Its bans are unpredictable rather than surgical.
        targetBan: 0.7,
        threatBan: 0.7
      },
      sampling: {
        pickTemperatureMul: 2.2,
        pickTopNDelta: 3,
        banTemperatureMul: 2,
        banTopNDelta: 2
      },
      pocketPickProbMul: 6,
      offMetaComfortBonus: 3
    },
    "synergy-architect": {
      id: "synergy-architect",
      name: "Synergy Architect",
      description: "Builds the perfect comp \u2014 synergies and identity over raw tier power.",
      weights: {
        synergy: 1.9,
        archetypeSynergy: 1.9,
        identity: 1.8,
        metaTier: 0.85,
        laneMatchup: 0.85
      },
      sampling: { pickTemperatureMul: 0.9 }
    }
  };
  var PERSONALITY_LIST = [
    PERSONALITIES.balanced,
    PERSONALITIES["meta-slave"],
    PERSONALITIES["comfort-first"],
    PERSONALITIES["counter-picker"],
    PERSONALITIES.cheese,
    PERSONALITIES["synergy-architect"]
  ];

  // lib/season/realPlayerNames.json
  var realPlayerNames_default = {
    LCK: {
      "Gen.G Esports": {
        top: "Kiin",
        jungle: "Canyon",
        middle: "Chovy",
        bottom: "Ruler",
        support: "Duro"
      },
      "Hanwha Life Esports": {
        top: "Zeus",
        jungle: "Kanavi",
        middle: "Zeka",
        bottom: "Gumayusi",
        support: "Delight"
      },
      "NONGSHIM RED FORCE": {
        top: "Kingen",
        jungle: "Sponge",
        middle: "Scout",
        bottom: "Diable",
        support: "Lehends"
      },
      T1: {
        top: "Doran",
        jungle: "Oner",
        middle: "Faker",
        bottom: "Peyz",
        support: "Keria"
      },
      "kt Rolster": {
        top: "PerfecT",
        jungle: "Cuzz",
        middle: "Bdd",
        bottom: "Jiwoo",
        support: "Effort"
      },
      "Dplus KIA": {
        top: "Siwoo",
        jungle: "Lucid",
        middle: "ShowMaker",
        bottom: "Smash",
        support: "Career"
      },
      "BNK FEARX": {
        top: "Clear",
        jungle: "Raptor",
        middle: "VicLa",
        bottom: "Taeyoon",
        support: "Kellin"
      },
      "HANJIN BRION": {
        top: "Casting",
        jungle: "GIDEON",
        middle: "Roamer",
        bottom: "Teddy",
        support: "Namgung"
      },
      "DN SOOPers": {
        top: "DuDu",
        jungle: "Pyosik",
        middle: "Clozer",
        bottom: "deokdam",
        support: "Peter"
      },
      "KIWOOM DRX": {
        top: "Rich",
        jungle: "Willer",
        middle: "Ucal",
        bottom: "Aiming",
        support: "Andil"
      }
    },
    LPL: {
      "BILIBILI GAMING": {
        top: "Bin",
        jungle: "Xun",
        middle: "Knight",
        bottom: "Viper",
        support: "ON"
      },
      "Beijing JDG Esports": {
        top: "Xiaoxu",
        jungle: "JunJia",
        middle: "HongQ",
        bottom: "GALA",
        support: "Vampire"
      },
      "TOP ESPORTS": {
        top: "ZUIAN",
        jungle: "Tian",
        middle: "Creme",
        bottom: "JackeyLove",
        support: "Zhuo"
      },
      "Anyone's Legend": {
        top: "Breathe",
        jungle: "Tarzan",
        middle: "Shanks",
        bottom: "Hope",
        support: "Kael"
      },
      "Shenzhen NINJAS IN PYJAMAS": {
        top: "Hoya",
        jungle: "Guwon",
        middle: "Care",
        bottom: "Photic",
        support: "fengyue"
      },
      "EDWARD GAMING": {
        top: "Zdz",
        jungle: "Jiejie",
        middle: "sinian",
        bottom: "Leave",
        support: "Parukia"
      },
      "LGD GAMING": {
        top: "Burdol",
        jungle: "Heng",
        middle: "Tangyuan",
        bottom: "Shaoye",
        support: "Crisp"
      },
      "Invictus Gaming": {
        top: "TheShy",
        jungle: "Wei",
        middle: "Rookie",
        bottom: "JiaQi",
        support: "Meiko"
      },
      "Xi'an Team WE": {
        top: "Cube",
        jungle: "Monki",
        middle: "Karis",
        bottom: "About",
        support: "Erha"
      },
      "THUNDER TALK GAMING": {
        top: "Keshi",
        jungle: "Junhao",
        middle: "Heru",
        bottom: "Ahn",
        support: "Feather"
      }
    },
    LEC: {
      "SK Gaming": {
        top: "Wunder",
        jungle: "Skeanz",
        middle: "LIDER",
        bottom: "Jopa",
        support: "Mikyx"
      },
      GIANTX: {
        top: "Lot",
        jungle: "ISMA",
        middle: "Jackies",
        bottom: "Noah",
        support: "Jun"
      },
      "Movistar KOI": {
        top: "Myrwn",
        jungle: "Elyoya",
        middle: "Jojopyun",
        bottom: "Supa",
        support: "Alvaro"
      },
      Shifters: {
        top: "Rooster",
        jungle: "Sheo",
        middle: "nuc",
        bottom: "Paduck",
        support: "Trymbi"
      },
      "Team Heretics": {
        top: "Tracyn",
        jungle: "Daglas",
        middle: "Serin",
        bottom: "Ice",
        support: "Way"
      },
      "Karmine Corp": {
        top: "Canna",
        jungle: "Yike",
        middle: "kyeahoo",
        bottom: "Caliste",
        support: "Busio"
      },
      "Natus Vincere": {
        top: "Maynter",
        jungle: "Rhilech",
        middle: "Poby",
        bottom: "SamD",
        support: "Parus"
      },
      Fnatic: {
        top: "Empyros",
        jungle: "Razork",
        middle: "Vladi",
        bottom: "Upset",
        support: "Lospa"
      },
      "G2 Esports": {
        top: "BrokenBlade",
        jungle: "SkewMond",
        middle: "Caps",
        bottom: "Hans Sama",
        support: "Labrov"
      },
      "Team Vitality": {
        top: "Naak Nako",
        jungle: "Lyncas",
        middle: "Humanoid",
        bottom: "Carzzy",
        support: "Fleshy"
      }
    },
    LCS: {
      Disguised: {
        top: "Srtty",
        jungle: "KryRa",
        middle: "Callme",
        bottom: "sajed",
        support: "Lyonz"
      },
      "Shopify Rebellion": {
        top: "Fudge",
        jungle: "Contractz",
        middle: "Zinie",
        bottom: "Bvoy",
        support: "Zeyzal"
      },
      "Cloud9 Kia": {
        top: "Thanatos",
        jungle: "Blaber",
        middle: "APA",
        bottom: "Zven",
        support: "Vulcan"
      },
      Dignitas: {
        top: "Photon",
        jungle: "eXyu",
        middle: "Palafox",
        bottom: "FBI",
        support: "IgNar"
      },
      "Team Liquid Alienware": {
        top: "Morgan",
        jungle: "Josedeodo",
        middle: "Quid",
        bottom: "Yeon",
        support: "CoreJJ"
      },
      FlyQuest: {
        top: "Gakgos",
        jungle: "Gryffinn",
        middle: "Quad",
        bottom: "Massu",
        support: "Cryogen"
      },
      LYON: {
        top: "Dhokla",
        jungle: "Inspired",
        middle: "Saint",
        bottom: "Berserker",
        support: "Isles"
      },
      Sentinels: {
        top: "Impact",
        jungle: "HamBak",
        middle: "DARKWINGS",
        bottom: "Rahel",
        support: "huhi"
      },
      "100 Thieves": {
        top: null,
        jungle: "River",
        middle: null,
        bottom: null,
        support: "Eyla"
      },
      "NRG Kia": {
        top: "Zamudo",
        jungle: "Kisno",
        middle: "PhyMini",
        bottom: "Sushee",
        support: "Spica"
      }
    },
    CBLOL: {
      "RED Canids Kalunga": {
        top: "zynts",
        jungle: "STEPZ",
        middle: null,
        bottom: "Morttheus",
        support: "frosty"
      },
      FURIA: {
        top: "Guigo",
        jungle: "Tatu",
        middle: "Tutsz",
        bottom: "Ayu",
        support: "JoJo"
      },
      "Vivo Keyd Stars": {
        top: "zekas",
        jungle: "sarolu",
        middle: "Mireu",
        bottom: "Jeskla",
        support: "scamber"
      },
      LOS: {
        top: "Zest",
        jungle: "Curse",
        middle: "Feisty",
        bottom: "Duduhh",
        support: "Ackerman"
      },
      Fluxo: {
        top: "curty",
        jungle: "Peach",
        middle: "cody",
        bottom: "BAO",
        support: "Momochi"
      },
      LOUD: {
        top: "Xyno",
        jungle: "Sinatra",
        middle: "Kaze",
        bottom: "Rabelo",
        support: "uZent"
      },
      "paiN Gaming": {
        top: "Boal",
        jungle: "CarioK",
        middle: "Keine",
        bottom: "Hena",
        support: "Ceos"
      },
      LEVIAT\u00C1N: {
        top: "Devost",
        jungle: "Booki",
        middle: "Enga",
        bottom: "Strensh",
        support: "Shiku"
      },
      "KaBuM!": {
        top: null,
        jungle: null,
        middle: null,
        bottom: null,
        support: null
      },
      INTZ: {
        top: "Kiari",
        jungle: "StineR",
        middle: "Leleko",
        bottom: "Netuno",
        support: "konseki"
      }
    },
    LCP: {
      "Team Secret Whales": {
        top: "Pun",
        jungle: "Hizto",
        middle: "Dire",
        bottom: "Eddie",
        support: "Bie"
      },
      "GAM Esports": {
        top: "Kiaya",
        jungle: "Draktharr",
        middle: "Gloryy",
        bottom: "Artemis",
        support: "Taki"
      },
      "MVK Esports": {
        top: "Kratos",
        jungle: "Gury",
        middle: "Seany",
        bottom: "Harky",
        support: "SiuLoong"
      },
      "Fukuoka SoftBank HAWKS gaming": {
        top: "Evi",
        jungle: "Van1",
        middle: "Aria",
        bottom: "Marble",
        support: "Vsta"
      },
      "Relove Deep Cross Gaming": {
        top: "Flauren",
        jungle: "Pop9",
        middle: "HongSuo",
        bottom: "Feng",
        support: "ShiauC"
      },
      "CTBC Flying Oyster": {
        top: "Rest",
        jungle: "Shad0w",
        middle: "POUT",
        bottom: "Doggo",
        support: "Kino"
      },
      "Ground Zero Gaming": {
        top: "1Jiang",
        jungle: "Husha",
        middle: "Uniboy",
        bottom: "Shunn",
        support: "Kaiwing"
      },
      "DetonatioN FocusMe": {
        top: "Momo",
        jungle: "Citrus",
        middle: "Fisher",
        bottom: "Kakkun",
        support: null
      },
      "PSG Talon": {
        top: "Azhi",
        jungle: "Karsa",
        middle: "Maple",
        bottom: "Betty",
        support: "Woody"
      },
      "The Chiefs Esports Club": {
        top: "BioPanther",
        jungle: "Whynot",
        middle: "JimieN",
        bottom: "Slayder",
        support: "Luon"
      }
    },
    extraTeamLogos: {
      WeiboGaming: {
        top: "Zika",
        jungle: "Xiaohao",
        middle: "Xiaohu",
        bottom: "Elk",
        support: "Jwei"
      },
      "Suzhou LNG Esports": {
        top: "sheer",
        jungle: "Croco",
        middle: "Nia1",
        bottom: "1xn",
        support: "MISSING"
      },
      "Ultra Prime": {
        top: "sasii",
        jungle: "climber",
        middle: "Saber",
        bottom: null,
        support: "Xiaoxia"
      },
      "Oh My God": {
        top: "Hery",
        jungle: "re0",
        middle: "haichao",
        bottom: "Starry",
        support: "Moham"
      }
    }
  };

  // lib/season/realCoachNames.json
  var realCoachNames_default = {
    LCK: {
      "Gen.G Esports": "Ryu",
      "Hanwha Life Esports": "Homme",
      "NONGSHIM RED FORCE": "DanDy",
      T1: "kkOma",
      "kt Rolster": "Score",
      "Dplus KIA": null,
      "BNK FEARX": "Edo",
      "HANJIN BRION": "Sensation",
      "DN SOOPers": "oDin",
      "KIWOOM DRX": "Joker"
    },
    LPL: {
      "BILIBILI GAMING": "Daeny",
      "Beijing JDG Esports": "Tabe",
      "TOP ESPORTS": "Poppy",
      "Anyone's Legend": "BigWei",
      "Shenzhen NINJAS IN PYJAMAS": "Maizijian",
      WeiboGaming: "Shine",
      "Invictus Gaming": "Helper",
      "Xi'an Team WE": "JinJin",
      "Suzhou LNG Esports": "Edgar",
      "THUNDER TALK GAMING": "NONAME"
    },
    LEC: {
      "SK Gaming": "OWN3R",
      GIANTX: "Guilhoto",
      "Movistar KOI": null,
      Shifters: null,
      "Team Heretics": "Nukeduck",
      "Karmine Corp": "Reapered",
      "Natus Vincere": "TheRock",
      Fnatic: "GrabbZ",
      "G2 Esports": "Dylan Falco",
      "Team Vitality": "Pad"
    },
    LCS: {
      Disguised: "ido",
      "Shopify Rebellion": null,
      "Cloud9 Kia": "IWDominate",
      Dignitas: "Swiffer",
      "Team Liquid Alienware": "Spawn",
      FlyQuest: "Thinkcard",
      LYON: null,
      Sentinels: "Goldenglue",
      "100 Thieves": null,
      "NRG Kia": null
    },
    CBLOL: {
      "RED Canids Kalunga": "tockers",
      FURIA: "furyz",
      "Vivo Keyd Stars": "Smiley",
      LOS: null,
      Fluxo: "Bp",
      LOUD: "Raise",
      "paiN Gaming": "Sarkis",
      LEVIAT\u00C1N: null,
      "KaBuM!": null,
      INTZ: null
    },
    LCP: {
      "Team Secret Whales": "WarHorse",
      "GAM Esports": "Naul",
      "MVK Esports": "BigKoro",
      "Fukuoka SoftBank HAWKS gaming": "CorGi",
      "Relove Deep Cross Gaming": "REFRA1N",
      "CTBC Flying Oyster": "Chawy",
      "Ground Zero Gaming": "Skywalk",
      "DetonatioN FocusMe": "Paz",
      "PSG Talon": null,
      "The Chiefs Esports Club": null
    }
  };

  // lib/season/playerNames.ts
  function isValidHandle(name) {
    const t = name.trim();
    if (!t) return false;
    if (/\d$/.test(t)) return false;
    if (/\s+(?:X|IX|VIII|VII|VI|V|IV|III|II|I)$/i.test(t)) return false;
    return true;
  }
  var RAW = realPlayerNames_default;
  function normalizeTeamName(name) {
    return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  var REAL_BY_TEAM = (() => {
    const map = /* @__PURE__ */ new Map();
    for (const byTeam of Object.values(RAW)) {
      for (const [name, roster] of Object.entries(byTeam)) {
        map.set(normalizeTeamName(name), roster);
      }
    }
    return map;
  })();
  var COACH_BY_TEAM = (() => {
    const map = /* @__PURE__ */ new Map();
    const raw = realCoachNames_default;
    for (const byTeam of Object.values(raw)) {
      for (const [name, coach] of Object.entries(byTeam)) {
        if (coach) map.set(normalizeTeamName(name), coach);
      }
    }
    return map;
  })();
  var ONSETS_GLOBAL = [
    "Vex",
    "Kyro",
    "Zeph",
    "Nyx",
    "Riven",
    "Volt",
    "Drax",
    "Sol",
    "Kael",
    "Fenn",
    "Ryze",
    "Jinx",
    "Zed",
    "Aero",
    "Bly",
    "Cinder",
    "Dusk",
    "Echo",
    "Frost",
    "Glyph",
    "Hex",
    "Iro",
    "Jett",
    "Korr",
    "Lux",
    "Myst",
    "Nova",
    "Orin",
    "Pyre",
    "Quill",
    "Raze",
    "Surge",
    "Talon",
    "Umbra",
    "Vyse",
    "Wraith",
    "Xan",
    "Yor",
    "Zix"
  ];
  var CODAS_GLOBAL = [
    "",
    "",
    "",
    "ix",
    "or",
    "en",
    "ar",
    "yn",
    "us",
    "el",
    "ax",
    "io",
    "ee",
    "oh",
    "za",
    "ku",
    "mi",
    "ro",
    "sy",
    "th"
  ];
  var REGIONAL = {
    LCK: {
      onsets: ["Jin", "Hyeon", "Min", "Seo", "Yun", "Kye", "Hwan", "Dor", "Pea", "Ker", "Show", "Gum", "Kan", "Vic"],
      codas: ["", "woo", "ho", "jae", "jun", "ha", "ri", "on", "in", "eo"]
    },
    LPL: {
      onsets: ["Xing", "Wei", "Tian", "Bin", "Ning", "Rook", "Xia", "Jack", "Cry", "Sof", "Gala"],
      codas: ["", "ming", "yu", "hao", "jie", "feng", "xin", "qi", "lan"]
    },
    LEC: {
      onsets: ["Caps", "Rekk", "Wunder", "Jank", "Miky", "Carz", "Human", "Larss", "Upset", "Raz", "Comp", "Yike"],
      codas: ["", "les", "er", "en", "ix", "or", "yn", "us", "el"]
    },
    LCS: {
      onsets: ["Blab", "Core", "Impact", "Bjerg", "Double", "Sneaky", "Contract", "Inspired", "Yeon", "Quad", "River"],
      codas: ["", "er", "ie", "ix", "or", "en", "us", "el", "y"]
    },
    CBLOL: {
      onsets: ["Robo", "Cariok", "Route", "Ceos", "Guigo", "Netuno", "Titan", "Dynqueo"],
      codas: ["", "ao", "inho", "ito", "ix", "or", "en"]
    },
    LCP: {
      onsets: ["Rest", "Betty", "Shunn", "Junjia", "Azhi", "Karsa", "Maple", "Doggo", "Hong", "FoFo"],
      codas: ["", "ao", "en", "ix", "or", "yu", "in"]
    }
  };
  function syllableSets(region) {
    const regional = region ? REGIONAL[region] : void 0;
    if (!regional) return { onsets: ONSETS_GLOBAL, codas: CODAS_GLOBAL };
    return {
      onsets: [...regional.onsets, ...ONSETS_GLOBAL],
      codas: [...regional.codas, ...CODAS_GLOBAL]
    };
  }
  function normalizeHandle(name) {
    return name.normalize("NFKC").trim().toLowerCase();
  }
  function generateHandle(rng, taken, region) {
    const reserved = new Set([...taken].map(normalizeHandle));
    const { onsets, codas } = syllableSets(region);
    for (let attempt = 0; attempt < 80; attempt++) {
      const onset = onsets[Math.floor(rng() * onsets.length)];
      const coda = codas[Math.floor(rng() * codas.length)];
      const handle = onset + coda;
      if (!reserved.has(normalizeHandle(handle)) && isValidHandle(handle)) {
        taken.add(handle);
        return handle;
      }
    }
    const base = onsets[0] ?? "Vex";
    for (let suffix = "aa"; ; ) {
      const handle = base + suffix;
      if (!reserved.has(normalizeHandle(handle)) && isValidHandle(handle)) {
        taken.add(handle);
        return handle;
      }
      const letters = suffix.split("");
      let i = letters.length - 1;
      while (i >= 0 && letters[i] === "z") letters[i--] = "a";
      if (i < 0) letters.unshift("a");
      else letters[i] = String.fromCharCode(letters[i].charCodeAt(0) + 1);
      suffix = letters.join("");
    }
  }

  // lib/season/playerAgency.ts
  var AGENCY_MIN_TIER_VALUE = 1;
  var AGENCY_MIN_VALUE = 0.85;
  var AGENCY_LEAVE_GAP = 0.9;
  var AGENCY_TARGET_TEAM_GAP = 1.35;
  var AGENCY_LEAVE_CHANCE = 0.28;
  var AGENCY_CALLUP_CHANCE = 0.38;
  var AGENCY_DEPART_ACADEMY_CHANCE = 0.22;
  var AGENCY_MAX_LEAVES_PER_TEAM = 1;
  var AGENCY_MAX_LEAVES_TRANSFER = 8;
  var AGENCY_MAX_LEAVES_OFFSEASON = 14;
  var AGENCY_MAX_PROSPECT_DEMANDS = 10;
  var AGENCY_W_ORG = 0.55;
  var AGENCY_W_ROLE_STARTER = 1.15;
  var AGENCY_W_ROLE_ACADEMY = -0.55;
  var AGENCY_W_REGION = 0.28;
  var AGENCY_W_VACANCY = 0.7;
  var AGENCY_W_STUCK_ACADEMY = -0.35;
  function hasPlayerAgency(player, value) {
    if (PLAYER_TIER_VALUE[player.tier] < AGENCY_MIN_TIER_VALUE) return false;
    return value >= AGENCY_MIN_VALUE;
  }
  function orgStrengthScore(players) {
    return AGENCY_W_ORG * (deriveStar([...players]) - 3);
  }
  function regionFitBonus(player, teamLeagueId) {
    if (!player.homeRegion || !teamLeagueId) return 0;
    return player.homeRegion === teamLeagueId ? AGENCY_W_REGION : 0;
  }
  function destinationScore(player, team, role) {
    let s = orgStrengthScore(team.players);
    s += role === "starter" ? AGENCY_W_ROLE_STARTER : AGENCY_W_ROLE_ACADEMY;
    s += regionFitBonus(player, team.leagueId);
    if (role === "starter") {
      const slot = team.players.find((p) => p.lane === player.lane);
      if (slot && isRosterVacancy(slot)) s += AGENCY_W_VACANCY;
    }
    return s;
  }
  function currentStarterSeatScore(player, team) {
    return destinationScore(player, team, "starter");
  }
  function currentAcademySeatScore(player, team) {
    return destinationScore(player, team, "academy") + AGENCY_W_STUCK_ACADEMY;
  }
  function rankDestinations(player, teams, opts) {
    const prefs = [];
    const limit = opts?.limit ?? 5;
    for (const team of teams) {
      if (opts?.excludeTeamId && team.id === opts.excludeTeamId && !opts.includeHome) {
        continue;
      }
      prefs.push({
        teamId: team.id,
        teamName: team.name,
        role: "starter",
        score: destinationScore(player, team, "starter")
      });
      if (opts?.includeAcademy) {
        prefs.push({
          teamId: team.id,
          teamName: team.name,
          role: "academy",
          score: destinationScore(player, team, "academy")
        });
      }
    }
    prefs.sort((a, b) => b.score - a.score);
    return prefs.slice(0, limit);
  }
  function makeDemandId(playerId, kind) {
    return `${playerId}:${kind}`;
  }
  function generateAgencyDemands(teams, pool, byId, meta, rng, opts) {
    const demands = [];
    const leavesByTeam = /* @__PURE__ */ new Map();
    const maxLeaves = opts.window === "offseason" ? AGENCY_MAX_LEAVES_OFFSEASON : AGENCY_MAX_LEAVES_TRANSFER;
    let leaveCount = 0;
    let prospectCount = 0;
    const teamById = new Map(teams.map((t) => [t.id, t]));
    const rosterCandidates = [];
    for (const team of teams) {
      for (const player of team.players) {
        if (!player.id || isRosterVacancy(player)) continue;
        const grade = opts.gradeOf?.(player.id) ?? null;
        const value = transferValue(player, grade, byId, meta);
        if (!hasPlayerAgency(player, value)) continue;
        const current = currentStarterSeatScore(player, team);
        const prefs = rankDestinations(player, teams, {
          excludeTeamId: team.id,
          includeAcademy: false,
          limit: 4
        });
        const best = prefs[0];
        if (!best) continue;
        const gap = best.score - current;
        if (gap < AGENCY_LEAVE_GAP) continue;
        rosterCandidates.push({ team, player, value, current, prefs, gap });
      }
    }
    rosterCandidates.sort((a, b) => b.gap - a.gap || b.value - a.value);
    for (const c of rosterCandidates) {
      if (leaveCount >= maxLeaves) break;
      const used = leavesByTeam.get(c.team.id) ?? 0;
      if (used >= AGENCY_MAX_LEAVES_PER_TEAM) continue;
      if (rng() > AGENCY_LEAVE_CHANCE) continue;
      const best = c.prefs[0];
      const target = c.gap >= AGENCY_TARGET_TEAM_GAP ? best : void 0;
      const wantRole = target ? target.role : "fa";
      demands.push({
        id: makeDemandId(c.player.id, "leave"),
        playerId: c.player.id,
        ...c.player.name ? { playerName: c.player.name } : {},
        playerTier: c.player.tier,
        lane: c.player.lane,
        kind: "leave",
        fromTeamId: c.team.id,
        fromTeamName: c.team.name,
        ...target ? { wantTeamId: target.teamId, wantTeamName: target.teamName } : {},
        wantRole,
        preferenceGap: c.gap,
        rankedPrefs: c.prefs.slice(0, 3),
        status: "pending"
      });
      leavesByTeam.set(c.team.id, used + 1);
      leaveCount++;
    }
    const prospectCandidates = [];
    for (const entry of pool) {
      if (entry.status !== "academy" || !entry.player.id) continue;
      const team = teamById.get(entry.lastTeamId);
      if (!team) continue;
      const value = inactiveTransferValue(entry, byId, meta);
      if (!hasPlayerAgency(entry.player, value)) continue;
      const incumbent = team.players.find((p) => p.lane === entry.player.lane);
      const canCallUp = !!incumbent && (isRosterVacancy(incumbent) || inactiveTransferValue(entry, byId, meta) - transferValue(
        incumbent,
        incumbent.id ? opts.gradeOf?.(incumbent.id) ?? null : null,
        byId,
        meta
      ) >= ACADEMY_OPEN_REPLACE_GAP);
      if (canCallUp) {
        const homeStarter = destinationScore(entry.player, team, "starter");
        const current2 = currentAcademySeatScore(entry.player, team);
        const gap = homeStarter - current2;
        if (gap >= AGENCY_LEAVE_GAP * 0.55) {
          prospectCandidates.push({
            entry,
            team,
            value,
            kind: "call-up",
            prefs: [
              {
                teamId: team.id,
                teamName: team.name,
                role: "starter",
                score: homeStarter
              }
            ],
            gap
          });
        }
      }
      const current = currentAcademySeatScore(entry.player, team);
      const prefs = rankDestinations(entry.player, teams, {
        excludeTeamId: team.id,
        includeAcademy: true,
        limit: 4
      });
      const best = prefs[0];
      if (best && best.score - current >= AGENCY_LEAVE_GAP) {
        prospectCandidates.push({
          entry,
          team,
          value,
          kind: "depart-academy",
          prefs,
          gap: best.score - current
        });
      }
    }
    prospectCandidates.sort((a, b) => b.gap - a.gap || b.value - a.value);
    const seenProspect = /* @__PURE__ */ new Set();
    for (const c of prospectCandidates) {
      if (prospectCount >= AGENCY_MAX_PROSPECT_DEMANDS) break;
      const pid = c.entry.player.id;
      if (seenProspect.has(pid)) continue;
      const chance = c.kind === "call-up" ? AGENCY_CALLUP_CHANCE : AGENCY_DEPART_ACADEMY_CHANCE;
      if (rng() > chance) continue;
      seenProspect.add(pid);
      const best = c.prefs[0];
      const target = c.kind === "call-up" || c.gap >= AGENCY_TARGET_TEAM_GAP ? best : void 0;
      const wantRole = c.kind === "call-up" ? "starter" : target ? target.role : "fa";
      demands.push({
        id: makeDemandId(pid, c.kind),
        playerId: pid,
        ...c.entry.player.name ? { playerName: c.entry.player.name } : {},
        playerTier: c.entry.player.tier,
        lane: c.entry.player.lane,
        kind: c.kind,
        fromTeamId: c.team.id,
        fromTeamName: c.team.name,
        ...target ? { wantTeamId: target.teamId, wantTeamName: target.teamName } : {},
        wantRole,
        preferenceGap: c.gap,
        rankedPrefs: c.prefs.slice(0, 3),
        status: "pending"
      });
      prospectCount++;
    }
    return demands;
  }
  function agencyFaBidBoost(player, value, team, controlledTeamId) {
    if (!hasPlayerAgency(player, value)) {
      return controlledTeamId && team.id === controlledTeamId ? 0.15 : 0;
    }
    let boost = destinationScore(player, team, "starter") * 0.35;
    if (controlledTeamId && team.id === controlledTeamId) boost += 0.55;
    return boost;
  }
  function honorDemand(demands, demandId) {
    return demands.map(
      (d) => d.id === demandId && d.status === "pending" ? { ...d, status: "honored" } : d
    );
  }
  function expirePendingDemands(demands) {
    return demands.map(
      (d) => d.status === "pending" ? { ...d, status: "expired" } : d
    );
  }

  // lib/season/rookieNames.json
  var rookieNames_default = { top: ["1jw", "2188", "3MK MAX", "3z", "96NKtaityo", "Abaddon", "Acce", "Acidy", "Acorn", "Adam", "Adamson", "Addusto", "Adizai", "advance", "afonso", "Agresivoo", "Aiko", "Akemi", "Akira", "Akirei", "Akkers", "Akrantor", "Akunma", "Aligan", "Allerz", "Alliance", "Annchirisu", "antana", "applepasta", "Arbrio", "Archfiend", "Arcziks", "Ariana", "Aristo", "ARMUT", "Arnaxas", "ArQuel", "Arumik", "ashen1", "Atom", "atomicnoxus", "Ayel", "Ayeye", "Aytekn", "Badlulu", "Baka Prase", "Bala", "Balls", "Balukos", "Bambiii", "Baro", "BartekToJa", "Baus", "Bayonet", "Bazu", "Benz", "Berik", "BestBox", "Billrok", "Bingus", "Bisk", "Blesia", "Blice", "Blight", "Boal", "Bobsik", "Boda", "BoilTheOil", "Boras", "BOSS", "Br0kk", "Bradley", "Brayaron", "brexx", "Brightsteel", "BrokenBlade", "Broxy", "Brut", "Buggax", "Burdol", "Burrito", "Bust", "Busvicke", "ByFalco", "Cabochard", "Campello", "Carita", "Carlsen", "Castle", "Caucha", "Cehin", "Cha0s", "Chad", "Chakroun", "Challenq", "Chan", "Chasy", "Chibi Mtz", "Chippys", "Chitan", "Chordy", "chuba", "Clasicoz", "claude", "Cloyy", "Coated", "Code", "Conformista", "Conse", "Conta", "CoolifeGame", "Copper", "Coyote", "CPM", "cRa", "Crimson", "Cripple", "Crop", "Cube ARCH", "Cursee", "CuVee", "Dadan", "Daemon", "Dal", "dan1hl", "Dani", "Danilo", "Darkeszy", "Darkin", "DarkMoon", "Darky2", "Darlik", "Darshan", "Davidao", "Davyyyy", "Dcoy", "DDahyuk", "deathleap", "Deidara", "Delawen", "Delitto", "Denathor", "Dertako", "DesoLinee", "Dethron", "didie", "Diesel", "Difference", "Dinastik", "Diogoo", "Dionelux", "Direnc", "Doodlz", "doraemon", "Dragoon", "Drali", "Draptix", "Draxo5", "Dreampull", "Driver", "DrSaw", "Duclou", "Duende", "Duke", "Dumbinho", "Dunks ARCH", "Duo Dino", "Dusseldrop", "Dustin", "Dyrus", "Dzeffry", "Dziuba", "Dzoni", "Effigy", "Egemen", "EL ZORA1", "Electric", "Eloha", "Emiw", "Eradan", "Ersin", "Escanor", "Etude", "Exiled Wolf", "existence", "Expession", "fabFabulous", "FakeGod", "Fakey", "Falleo", "Famus", "Fat Yoda", "Fejkyy", "ffernandes", "Fiji", "Finicky", "Firejack", "Flame", "Flamerrrr", "FlashInTheNight", "Flaxxish", "FloKy", "Force", "Forlin", "Formes", "FornoReason", "Forsaken1", "Fouka", "frajgo", "FREAKYBOB", "Frog", "FuraFura", "Gabbo", "Galileo", "Gamsu", "gaucho", "Gecko", "Gego", "Geiger", "Giankios", "Godux", "gogoing", "Goldmen", "Gongas", "Gonti", "Granduz", "GreatGary", "Grzybek", "Guachi", "Guardian", "Guilford", "Gymrat", "H1ro", "Haaland", "Haenam", "Haetae", "Haka", "Hakari", "Hammock", "Hamsi", "Hanabi", "handm", "Hanma", "Hannah", "hanya", "Harald", "Hasta Deum", "Hasu7", "Hater", "Hauntzer", "Hazard", "Haze", "Hecabrand", "Hedonist", "Helcrank", "Helior", "Herif", "Hery", "HeSSZero", "Hiro02", "HO JIN LEE", "Hojin", "Horder", "Hunter", "Hyper720", "Hyperek", "IamSunlight", "Ibai", "iBo", "IceBox", "Ichiik46", "Ichik", "IGli", "Illumi", "ILYXOUUU", "Infe", "Interor", "Iobellan", "Iras", "Irrelevant", "Islaa", "ItzFrozen", "iu", "IzaenK", "Izk", "Jacklong", "Jaeger", "Jaehyuk", "Janus", "Jaqen", "Jarro Light", "JeiiZe", "Jenax", "Jenxas", "Jer0m", "Jervo", "jmz", "Johntheman", "Jokah", "Joos", "Jovi", "JP6RU8", "JRachel", "JTL", "jucky", "Julian9", "Julzh", "JustJohnny", "JustLikeThat", "K0ala", "Kaermo", "Kai", "Kaigu", "Kaizen2", "Kallesyn", "Kane", "Kangin", "Kanra", "Kantoshi", "Kaplica", "KappaKarma", "Kaylem", "Kayleqlated", "Keii", "Kekko80", "Kenius", "Kenma", "kev1n", "Khan", "Kichan", "Kim1", "Kingsley", "Kinsey Star", "Kio", "kkkkkkkkk", "Klofan", "Kookykrook", "Korick", "Koro1", "Korokke", "Kozi", "kPr", "Krasito", "Krenashh", "Kritias", "Krosak", "Kryze", "Kryzpo", "Kubon1", "Kyoshi", "LA FIJA", "Lag", "Lambda", "Lamoula1", "Lancer", "Lara", "Last last", "Lawrence1", "Lays", "leaf", "League", "Leks", "Lenpace", "Leny", "Leocich", "LEQINHO6", "LeQu", "Lerax", "Leshin", "Letme", "Lexa", "Libra", "Licorice", "Lie", "Likai", "Lindarang", "Lingwi", "LJW", "lkoala", "LLT", "Loading", "Lobellan", "LoL Pit", "Looper", "Ludwig", "Luiku", "lukasnegro", "lunacia", "LVS", "Mabud", "Madara1", "maged", "Magic2", "Magmawave", "MaiYuk", "Makes", "Mando", "ManoloGap", "Mans", "Marcel", "MaRin", "Masuhana", "Maunter", "Maxibillion", "Maximize", "Mazin0", "medaluslv", "MEHRIO", "Meow", "Merciful", "Mexia", "Mias", "Midir", "Mietek", "Mikkell", "M\xEDkoto Suoh", "Mimic", "MinetasJR", "Misaki", "Misaya", "Mito", "MMD", "Moka", "Monnr", "Monokotiledon", "MooseHater", "Moreiraoo", "Morokei", "Muka", "MyCash", "Myha", "N0body", "N0name", "NaakNako", "NaFT", "Nakamoto", "NaRaKyle", "Nary", "Nate", "Nern", "Nervarien", "NeSMonstro", "Nevid", "Nexus", "NiceGuyBen", "NickiTaylor", "nicOOOOOO", "NightSlayer", "Niles", "Nille", "Ninja Tiger", "Ninuo", "Nipphu", "NL", "NoNholy", "Nper", "NtatsiCash", "NuQ", "nvillada", "OBELISK", "Occlumats", "Octomalus", "Oliver", "Onyoz", "ORION", "Orzecz", "ouroboy", "Outskale", "Owpi", "p1ng", "Pan", "Panther", "Papiteero", "papryze", "Pasamelcelo", "PatkicaA", "PatxiElPira", "Paulao", "Paz", "PCL", "PeateeSD", "peop", "Perle", "Pes3", "PesE", "Pet", "Petoska", "Philipp", "Phraser", "Pillo", "PingPong", "PiNK", "Pinky", "Pinnnk", "Pio", "PK", "PmK", "PolskiKoz", "PonG", "Potent", "Potential", "Poweh", "Prachoun", "prey", "Profit", "Qingwa", "QTV", "Quas", "Ques", "Quincidence", "Quinncidenc", "R1ngoKun", "Raccoon", "raedz", "Raffy", "Raglem", "Ragner", "Raiin", "Rando", "RayFarky", "Rbow", "R\xE8d", "Renas", "Respeta", "Rexuss", "Rhal", "RickLafleur", "Rineko", "Ripple", "River1", "Rizzler", "Robocop", "Rock", "Rockky", "Romuka", "Rubenxico", "RyuK2", "S0ul", "Sabisu", "Sacre", "Sailuo", "Sala", "Samanan", "Samson", "Sanah", "Sander", "Sangrod", "Sankaizer", "SappyMS", "SARA", "sasii", "Sater", "Save", "ScarHope", "Scrappy", "sea", "Semin", "Seminol", "Send0o", "Senmary", "September14", "Septico1", "Seraph2", "Sero", "Shadow7", "Shadowest", "ShaQuinn", "Shavo", "Shelfmade", "Shellkunchi", "Shendo", "Sherkaan", "sheru", "Shikari", "Shiku", "Shin", "Shinn", "Shinsekai", "Shiro2", "Shourdy", "Shtegre", "Sir Jekyll", "SivHD", "SkaR", "SkB", "Skeeto", "Skiler99", "Sky0", "Skye1", "SLT", "Smacl3r", "Smart", "Smeb", "Smurf", "Sniper", "SnowRabbit", "SOA", "sOAZ", "Soboro", "SoimuMIC", "Solis", "Sorrymbggff", "Sotsy", "Sparda", "Spasio", "Speed", "Speltz", "Splendor", "Spooder", "Sprotte", "SSADY", "Ssumday", "Stanley", "star", "StarScreen", "Steellar", "Stefanko", "Stein", "Stellar3", "Stelya", "Stibi", "Straight", "Strava", "Sukru", "Summit", "Sunblast", "Sunlight", "SuperCleber", "Surdinz", "Suske", "Suzu", "Suzzysaur", "Sveglia", "Sven", "Swip3rR", "SwiT", "SwitRaptor", "Synapse", "Szafa", "Szygenda", "SzymeXo", "T1moha", "Taco", "Tada", "Taicho", "Tamoz", "Tao", "Tapinq", "Tasaa", "Tayron", "Teacher Three", "TemptAzn", "Terco", "Th3Antonio", "theblindboy", "TheCheeng", "TheMountain", "Theoloris", "TheSerius", "TheShy", "Thien", "Thoughless", "Tobi4", "Togep1", "tol2", "Tomasino", "Tomem", "Tommygun", "tomomaso", "Tony Top", "tonyroo", "Topo", "Toppy", "Tortu", "Tozue", "Troop", "Tropy16", "Tuercas", "Tuomari", "turtle", "Twendddy", "Twice2", "Typical", "Tyran", "TYSON", "UC Escanor", "udon", "Umy", "Untara", "Uprising", "Ussii", "v1SaG3", "V1tal", "Valkyr1e", "Valuxitax", "Venour", "Ventair", "Vertigo", "Virgo2", "Virtuso", "Vizicsacsi", "Vodin", "VorpalSwords", "Vortum", "Vuja", "Wake", "Wamu", "Wao", "Weizhe", "WhiteWolf", "Wickd", "Wiz1", "Wizer", "Wolffi", "Wondro", "Woodon", "Wrecking", "WSH BlEN", "Wufo", "Xbix", "xChronofox", "Xeanny", "xGenesis", "Xhi", "XI LAI", "xLud", "xMaxis", "Yang0", "YellowYoshi", "Yeti", "yOFT", "yokiha", "Yoppa", "YSKM", "Yuji", "YuJian", "Yupps", "Yuu", "YuxiaoC", "Z03N", "Zaary", "Zaiiche", "Zantins", "Zartheit1", "ZAYCEAR", "ZD1", "Zdz", "Zeiko", "ZeroOo", "Zeros", "Zeycce", "Zeytum", "Zezin", "Zhayend", "Zheir", "ZionSpartan", "Ziv", "Zkai", "Zoen", "Zolazy", "Zora", "Zorenous", "ZUIAN", "ZZZ"], jungle: ["0ri", "113", "1an", "1Dany", "361efe", "4ever", "665", "667", "89", "9God", "Abow", "Acerola", "Acrozo", "Adsiit", "Aegis", "AeonCrystal", "Afroboi", "Agonistic", "Agosaurio", "Agran", "AHaHaCiK", "Akabane", "Alba", "Albi1", "Albinha", "Alex", "Alexx", "Alitan", "Alluk", "Aloned", "Amazing", "AMBAN", "Ambition", "Ambush", "Amel", "Andathy", "Anitta", "Ankochan", "ANKS", "Annataqui", "Annyeong", "Ano", "Arashi", "Arcano", "Arcueid", "Artx1", "Aspect", "Athyz", "Awful", "Azakana", "AzizYildirm", "Babu", "Badlyyga", "Balkane", "Bambii", "Bananiasty", "Baran", "Barsas", "Baumeef", "BBA", "bbk", "Bbyoan", "Becomin", "bedi", "belit", "Ben3k", "Bengi", "Benny", "Beyond", "Bicas", "Bio", "Bizon", "Blame", "Blank", "Blank III", "Blind Walke", "Blindwalker", "Bluealert", "Blueboar", "bluerzor", "Blutlotus", "Boby", "BornThisWay", "Boukada", "Broxah", "Bruce", "Bruness", "Bugi", "BullyMguire", "burningstar", "Butter", "Bwipo", "CAPE", "Carim", "Castle7", "Cboi", "Cebolas", "Cedric", "Cerelac", "Chang", "Chaos", "Chelouche", "Chente", "Chrislai", "Chuffylol", "ClatoS", "ClearLove", "CLEARS", "Clicker", "Clid", "climber", "Clown", "Corazon", "Cott", "Courage", "Cow", "CptJacob", "Crackadon", "Cran", "Crawl", "Crumbz", "Cryps", "Crystal", "Cyanide", "D4nKa", "D4SH", "Dabot", "Dadou", "Dandom", "Dandriel", "DanDy", "Dardoch", "Dawciu", "Dayllen", "DDoiV", "De", "Dean", "Death", "Definitly", "Delicate", "Densi", "Derakhil", "Devil deGrey", "Diamondprox", "DIBU", "Dinai", "Dinrok", "Disamis", "Dizin", "Djoko", "Dmitar", "DNK", "DoeDoii", "Donny", "doomlance", "Dopaminw", "Dovi", "Drago", "Dragonblood", "Dragowski", "Drakehero", "DRIFTER", "Drofan", "Duduu", "Dunzi", "duong pro", "DVLK", "Eagle", "Eckas", "Edgar1", "Edi2", "Efot", "ekkusu", "EL", "Elative", "Elix1r", "Ellim", "ElOjoInka", "Elramir", "Emok1ng", "Emprez", "Emvipi", "enayi", "Encounters", "Ender", "Engak", "Enricfh", "Epic", "Equa", "Errado", "Ever", "Ex1", "Exan", "Excelsis", "Exile1", "FallenAngel", "Fallouch", "Fanatiik", "Fantasyleaf", "Faun", "favo", "Fendras", "F\xE9nec", "Ferrari", "Ferret", "Fiko", "Fireloli", "Fishue", "Fitty", "Flamyy", "Flaw1ess", "flini", "Fluffy", "Fokkus", "Follow", "Fooneses", "foreigner", "Fourex", "Fr0m02Her0", "Fragio", "Fragola", "freaky dao", "Freire", "Frenzy", "Frenzyy", "Freshx", "Frizi", "Frost", "Frost1", "Frost4", "froy", "FS", "Fubuki", "FullClear", "Funahwi", "Funky", "Galers", "Gankk", "Ganks", "Gato", "Gavan", "GekkoSzaby", "Gemini", "GFP1", "GIOMATIC", "Gjerg", "Goksi", "Goliah", "Goo", "Goodo", "Gouyu", "Gremy", "Griffin", "Grit", "Gromix", "Groudon", "Guertas", "Guidoxi", "Guilty", "Guizzy", "Guli", "Gyeom", "H0NE", "h0pe", "Habubu", "HackerPanda", "HADES1", "HALdesu", "Ham", "Hankat", "Hardstyle", "HarryLaCruu", "Haru", "Hatred", "Heartless", "HeavyDream", "Hellish", "Heng", "HmlssMaster", "Holo", "HRK", "HUNTER2", "Hunter3", "Hyo", "Hyphe", "HyunSim", "Ibai0", "iCandy", "Icaruss", "ice1", "IlTipo", "Imagine", "Immersive", "Infinity", "inkos", "inSec", "Invictis", "Itsi", "Ivama", "Izo", "J0HNNY", "j1n5", "Jackal", "Jackson", "Janeq", "Janghy", "Jankos", "Jean", "Jekko", "Jg Test0", "JGY", "Jhoel", "Jiahao", "jisoo girl", "Jjun", "Jmicta", "Joekie", "jokaa", "Joki37", "Jony", "Jorx", "Josifek04", "Jota1", "Juhan", "Julaxe", "Juves", "Jwic", "Kaboom", "Kaczy102", "Kadir", "Kai1", "KaKAO", "Kalium", "Kalushi", "kamel", "Kangkuk", "Kania", "KarimKT", "Kase", "Keel", "Keksik", "Kenrix", "keve", "Kevy", "Khema", "Khynmm", "Kijac", "Kiki", "Kiko", "Killer2", "Killerqueen", "Kimo", "KinGi", "KingKingDan", "KINGPOWER", "Kireas", "Kitzuo", "Kiy1n9", "Ko1eee", "Kobs", "Koczis", "Kokos", "Kolthro", "Kongyue", "kory", "koughi", "Koxi", "Koxira", "kraM", "Kreative", "Kreox", "Krysia", "Kryzen7", "Kudy", "Kurama", "Lamabear", "larvinho", "Lauva", "Leader1", "Leaky", "Leao", "leao1", "Leemo", "LeeSA", "Leinad", "Leitinho", "Lelouch", "Leosia", "Leozuxo", "Lesranct", "Lethenor", "Letter", "Levi", "Levizin", "lilded", "Lio", "LiquidDiego", "Lira", "Listo", "Lit King", "Llenia", "Lloyd", "Lojaz", "Lolkol", "LoLpop", "Lotus23", "Lotuss", "Lucas", "Luchoo", "Luckmeow", "Lulas", "Lullaby", "Luncafoer", "Lurox", "Lylajn", "Lynn0", "Machete", "Mafro", "mag1cian", "Makelaar", "Maly", "Manaty", "Maniac", "Manjarres", "mannelig", "Mario", "Markoon", "Markus", "martote", "mata1", "Mataz", "Matty", "Maul", "MAXI", "Maxx", "Mazi", "mb", "Mcf", "Meii", "Meliodas", "Melvln", "Mental", "Meraiel", "Merlyy", "Meteos", "Meteos XXD", "meto", "Metroflox", "MexanikCH", "Mgutis", "MihawK", "mikusik", "Milkshake", "Minec", "MiraiX", "Mistt", "Mlxg", "moaixd", "moe", "Mojito", "Mokwaii", "Monkeking", "monkey0", "Motomoto", "Mountain", "MrClean", "MrJackson", "MrLemon", "Mtnops", "Mudblaster", "Munchy", "Muscle", "Music", "Mutton", "MxDragon", "N3znamy", "naau", "nainess", "Nakimura", "Naros", "Nasut", "NattyNatt", "negroNE", "NemezIS", "Neo7", "ner4", "Nero", "Nidhogg", "Nips", "Niton", "NMRT", "No One", "Noltey", "Nomai", "NoName", "Noodle", "Nops", "Norwegian", "Novyy", "nox1", "Noxus", "NPC", "nTnT", "nvidek", "Nxi", "Nyx", "Obsess", "Oddie", "Odi", "Oleg", "OmulFinn", "Once", "Op4uH", "Oriloler", "Owaga", "OWLONSKY", "Own3r", "Painter", "Pallet", "Pancake", "Panda", "Paresz", "Partyfosil", "Patate", "Pato1109", "Peanut", "Peche", "Pegaso", "Penguin", "Penniey", "Phaxi", "Phuc1", "pil", "PinnaRzilla", "Pipibaat", "Pivolj", "Piwo", "Pluto", "Pocok", "Podex", "Pootis", "popon", "Potluck", "Pressure", "Psilakhs", "Punisher88", "QaspieL", "qLibali", "QQMore", "qualzy", "Raaay", "Rabble", "Racon", "Rahasya", "Rainight", "Rakyl", "Rame", "RAMES", "RaNdal", "Ranger", "Raon", "Rapid", "Rashdan", "Rawbin IV", "Ray Lefty", "Raydell", "rayq", "Razor", "re0", "RealR", "Reignover", "Rellik", "Renewal", "RenHao", "RenYe", "Reshiram1", "REVENG", "Revolta", "Rhast", "rnascimento", "rnz", "Robin", "Rod", "Roshan", "Rudy", "RueL", "ruinez", "Ruyi", "Ryan", "Rybson", "Ryu", "Ryujin", "Saeko", "saibotbias", "Saiko IV", "Saintsu", "Samriser", "Sandroxx", "SanSan", "SANTA", "Santorin", "SantoS", "Santx", "Sapphire", "Sasi", "Sassappel", "Savero", "Saya", "Scary", "Scofield", "Score", "SCP", "Seb", "Sebal", "SeeN", "Selfflag", "Selfmade", "Sentherus", "SeongHwan", "Seriousblak", "SGooB", "Shadow5", "sHAKa", "Shanks2", "Sharp", "Sharvel", "ShazQ", "Shernfire", "shibi", "Shift", "Shiina", "Shimmer", "ShizuOo", "Shook", "Shookz", "Shordan", "ShorterACE", "Showkz", "Shrimp", "SiddyWiddy", "Sikterr", "Silence", "Silva", "Sinatra", "Skinny", "Sleep yume", "SneakyLemon", "Snow Panda", "socceryakyu", "SoCool", "SofM", "Sorn", "Soul", "Sounda", "Soweto", "Spear", "SpeeDy", "Spiderlair", "Spinda", "Spirit", "Spooky", "SryNotSry", "Ssaiko", "St0rm", "stalken", "Stargazer1", "Stefan", "Stefwhynot", "Style", "Sultan1", "Sunriser", "suyahime", "Svenskeren", "Sybol", "Sylvie", "T0ki", "TA0", "Tabasko", "Taikki", "Taizan", "Tatsu", "Techoteco", "Teh", "Tempo", "Teogen", "Test JG1", "Test JG2", "Thallnoss", "Thayger", "TheFakeOne", "Theocacs", "Theop", "Tiancito", "Tiann", "Tiansito", "Tianzhen", "Tierwulf", "Tigaz", "Tikyl", "Tima", "Time", "Timmer", "Tinchoxar", "tiphat", "Toilet", "tomaspal", "Tomio", "Toomaszek", "tooshi", "Toxicity", "trashy", "Travanques", "Trez", "Trick", "Tricky", "Trobax", "ts Canya", "Twight", "Typhoon", "Tyrion", "UCIULINHO2", "Umi", "Uroskg", "Vakin", "Vakulich", "Vann", "Velja", "Vibe", "Vichen", "Vincent", "Vincenzo", "Visible", "Vulatskee", "wallflower", "Warden", "Watch", "Westdoor", "wewo", "whisper", "White", "Whiteakitou", "Wilder", "Will", "Wilson", "Winner", "Winter 7", "Witek", "Woldjo", "woofi", "woolpo", "Woundmaker", "WSL", "wysek", "Xagog", "XAppen", "Xaragonas", "Xeonerr", "Xerd", "XGine", "xHauzen", "Xiaohao", "xiaomi", "Xmithie", "XnS", "XTegos", "XuWei", "Xypherz", "YallaSafSaf", "Yasikof", "Yatooo", "Yesu", "Yoyomax", "Yukino", "Yunika", "Yuuji", "Za3blawy", "Zanzarah", "Zeiss", "Zekali", "Zephyr", "Zero Impact", "Zicssi", "Zlatan", "Zwickl"], middle: ["010", "1116", "11ofSpadeS", "1buki", "1CE", "7amoodchi", "aadam", "Abbedagge", "Ablazeolive", "AbuDeif", "Ace9", "Achilles", "AD", "Adiogs", "Adyyy", "Afeto", "Ag0nyPain", "Air", "Aisu", "AisyL", "AKaJe", "Akashii", "Aken", "Akvender", "Alcaffee", "Alen", "Alex Mercer", "Alex0", "Alix", "Alleycat", "Alpha", "Alps", "Alvanai", "Amarizo", "ANDROM", "Angel", "AoJune", "Apex", "Apoka", "Apollonia", "Aqua2", "Araque", "Ariendel", "Aronid", "ArrHedge", "Articuna", "Artoria", "arutnevjr", "Asakura", "Asilah", "Aspierina", "Astronyx", "Atlas", "Avarosa", "aveng3r", "Azazel", "Azura", "Backlund", "BakeryBoy", "Bankai", "bbmuffin", "Bdoink", "Beaupere", "BEEHIV3", "Benda", "BeWhite", "Birkyy", "Bischu", "Biven", "Bjergsen", "Bl0oMi", "Blackengel", "Blackout", "BLACKY", "Blazes", "Blazze", "Blesss", "BLINDNESS", "Bloom", "Blue", "Bolulu", "BonQuish", "Boye", "BramGyBhoo", "Buda", "Budino", "buffi", "BuLuKaKa", "c0st0m", "C7N", "Calix", "carlins", "Cdric", "Celest", "Ceros", "Chain1", "CHALEEED", "Chapapi", "Chazz", "Chika", "Chirp", "Chungy", "Cid", "Coco", "Cohle", "coing", "Cor", "corvus", "CptShrimps", "Cracker", "Creal", "CROmpir", "Crown", "Cruzer", "Cryo", "Cupic", "Czajek", "D1verse", "Dade", "Daedra", "Daemi", "DaJeung", "Dajor", "Danos", "Dark", "DarkBlue", "Dashkai", "Davemon", "Davidd", "Davros", "Dawidsonek", "DayBeats", "Daystar", "Deadly1", "Debounair", "Decay", "Deceiving", "Deepe", "DejaVu", "Deliria", "Deliver", "Dia1", "diabolica", "DICE", "DiDi", "DIGA", "Dioge", "Discoland", "Divine", "DNA", "Doinb", "Dolis", "Domas", "Domi", "domoles67", "DON ADY", "Don NoWay", "DONGGY", "Doni", "Dooma", "Downed", "Doxa", "Dragflick", "Dream Maker", "Duglas", "Dyego", "dyNquedo", "Dysuo", "Easyhoon", "eguto", "eHopp", "Elitex", "EMENES", "Emil2", "Emo", "En0tPlosKun", "Enigma", "EnLightEnd", "Envy Carry", "Er Capitano", "Ereshkigal", "Eria", "Error", "ESCIK", "Eternal1", "Evenstar", "Exoo000", "Exosen", "F1V5", "Facen", "Fade", "FANG", "fantomisto", "Fas", "FattyP", "Fayo", "Fayonix", "Febiven", "FeeNiixZ", "Feit", "Fenix", "Fenz1", "Fersito", "FIERCE", "FireAscept", "Fishireal", "Flip", "Fogzy", "Franky", "FRED", "Freestyle", "FreshKiller", "Fresskowy", "Friday", "Froggen", "Frozen", "Frozen2", "FrznNuggets", "FSZ", "Furukisu", "Fuuu", "G4", "Gaaloul", "Galeon", "Gambite", "Garden", "GBM", "Genesis", "Gennie", "Get Lost", "Ggoong", "Gh0st", "Ghastly", "Ghost2", "Ghost3", "giannivedi", "GiaQui", "Giyuu", "Glorious", "Gloryy", "godfan", "Goku", "Goldenglue", "goose", "Gori", "GoWonBin", "Grevthar", "Griffon", "gtrik", "Guapi", "GukBo", "Gus", "Guti", "H0NEST", "Haeri", "hAFu", "Hai", "haichao", "Haku", "Hang2", "Hangjoo", "Harunabi", "hauz", "Hax", "helforca", "Henra", "Heroic", "Hitsu", "Hobbler", "Hong2", "Hosto", "Humnam", "Hwichan", "Hy", "Hydra", "Ibrahimzzz", "ichida", "Icy1", "Idrk1", "Ihsnet", "Imaginer", "ImFurby", "Immortoru", "Improver", "Incursio", "InDeed", "Infamous", "Insanity", "Inspireeeee", "Intensitive", "IntoxqZz", "Inzuh", "Itachi Uchi", "Ivok", "Ivory", "iwanan", "IWANAN3", "j3lly", "J3MZZ", "Jackso", "Jacob", "Jason", "Javier", "Jawa", "JayJay", "Jenikk", "Jensen", "Jericho", "Jiizuke", "Jimsnop", "Joao", "joelbebo", "Joinlav", "Jool", "Juggernaut", "K B", "Kadlicek", "kaito", "Kamiloo", "Kanin", "Kanji", "Kappa1", "Karaage", "Karoq", "Kashtelan", "Kazuki", "Kearzy", "KeeiTa", "Kemish", "kePt", "Ketrab", "kiloxx", "Kina", "Kiraxx", "Kirito", "Kisee", "Klowd", "Kobra", "Kobrq", "Koearn kid", "Kofte", "Koussay", "KRAUSER", "Krimson", "Krisimaru", "KSAEZ", "Kunduz", "KURBAX", "Kurckoo", "Kuro", "Kuroneel", "Kutarra", "Kyose", "Kyoto", "Lacis", "Lagolinas", "LakatosD", "Larssen", "lee sang", "Legions", "LeMy", "Lesmartt", "Leza", "Lezar", "Librid", "Lightshaw", "Linsanity", "Lmzs", "Loeloal", "Loers", "Loki", "Lolo", "LongB", "LONVEY", "Lotus", "Louis", "Luke", "Lukee", "Lukys", "Lulos", "Lumity", "Lunarage", "Lunatik", "Lychee", "Madrid1st", "Magico", "Mago", "Magus", "Maintenance", "many", "Maple Syrup", "Marbirius", "MarrowOoze", "Maselko", "Master Jos", "mateardovic", "MathisV", "Matislaw", "Max108", "Maxim", "Maximillion", "mayblis", "Medevv", "Megaman", "Megumin", "Meifan", "Melon", "MelyaP", "MeMo1", "Mercy9", "Meslo", "Mettalica", "mfis", "MGX", "Mickey", "midali", "Midalia", "Midbeast", "Midnight", "Mildorff", "minedomoles", "Miniduke", "minji", "Mirage", "Mitir", "Monk3", "Monstrob", "Moonblack", "Mors", "Mrozku", "Murillo", "MVPain", "N N", "Naehyun", "Nafkelah", "Nagne", "Namiru", "Nangning", "Nano", "Narttaker", "Nathell", "Neadz", "Necro", "Neczo", "Nemesis", "Nia1", "Nisqy", "Nite", "Nitz", "Nobody", "Nogo", "NOMA", "Nomanz", "Nox", "Nuclex", "NuL1", "Numandiel", "NvN", "OlegaTr", "omly", "OMON", "On3Sh0t", "Onat", "OniiKhan", "Opeduy", "Oran", "Orange", "Orion1", "Orrisot", "Oshiro", "Ouzi", "Overload", "Overpow", "Pacou", "Painful", "PAK", "Palhau", "Panda2", "Pandabb", "Paranoia", "Pasu", "Patosh", "Patrick ARC", "Paul227", "Pauporter", "Pawn", "pdr", "Peaker", "Pelirrojo", "Pendulum", "Peng", "Pepii", "Pepito", "Peppe", "Peraxy", "Perkz", "Pesho", "Phaell", "Phantomles", "Phenomenal", "Phoxie", "Phymini", "Pilot", "Piqueos", "Plugo", "Pobelter", "Pobli", "porsche", "PowerOfEvil", "Pr1nce", "Praedyth", "Presence", "Pretender", "Proker", "Ptatis", "Pudu", "Pulzer", "Pungyeon", "Puschek", "pvm", "Qats", "QKI", "Quake", "Quasar", "R0se", "R1to", "Raitch", "RaiZeR", "Raizy", "Rakyz", "Ramune", "Random", "Rank", "Rather", "Raven", "Ravenno", "Ravvy", "Rawil", "Razer", "rdgap", "Reeker", "Regi", "Relative", "Renard", "ReshH3H3", "restricted", "Retrozing", "Reufury", "Revenger", "Rexha", "rhOm", "Richard I", "Riku", "Rimtuolis", "riotdopa", "Rivayne", "Roamer", "Robi", "Rodri", "Rodrigo", "Roger", "rok", "Ronaldo", "Ronin", "rre", "Ruby", "Rym", "Ryoma", "Ryuin", "S4n", "Saan", "Saber", "Sadaz", "Sahira", "SAI", "Saifer", "Saii", "Saikek", "Sajator", "SAKEN", "Sami", "Samikin", "Samkz", "Samyaza", "Sann", "saonan", "sappxire1", "Sashimi", "Sashy", "satoCHINO", "Savage1", "Sawayama", "Sayn", "Scarlet", "Scarra", "Schoon", "Scuffed", "Seconds", "Secrett", "Semide", "Sencux", "Sendoya", "Serch", "Serjolik", "SeTab", "Sfakendaken", "Shadow12", "Sharon", "Shera", "Shigier", "Shiguro", "Shimzu", "Shinluv", "Shintalx", "Shizika", "Shlyapojor", "shochi", "Shrio", "shuyi", "siey", "sign", "Siler", "Silk", "Simpli", "Sin ARCH", "Sined", "sinian", "Sintax", "Siroinai", "Siuman", "Sk1nzor", "Skaanz", "SkillHard", "skymind", "Skyreach", "SLIDE", "Slix", "Slowla", "SmallBugi", "Smaug", "so urf", "Sobek", "Sofiane", "SoldierBird", "Soligo", "Sonata", "Sorrow2", "Sovereign", "Spinto", "Spirax", "spoint", "SpookyFino", "SQCRISTIAAN", "STANIK", "Strawberry", "Strensh", "Stryg", "sucuranbul", "Sudzzi", "Sun", "SunSunSun", "Superbia", "suzuki", "Sweeho", "SyLees", "Syzyf", "Tadeusz", "Tadow", "Tails", "Tangyuan", "TANO", "Tempest1", "Tempester", "Tenshi", "teodrak21", "Termo", "Test MID1", "The Cemen", "Theoo", "Thraex", "tibor", "tinowns", "Toady", "Toasty", "tockerssss", "Toffe", "Torak", "Toumes", "Toyejo", "Tsiper", "TT", "TT789", "Tuesday", "Tymchuk", "Tziz", "Uniboy", "Unicornlead", "Unicow", "UniqueCORN", "Uparela", "Uri", "Uroboros", "uwaaaa", "V1dde", "VAEII", "Valiant", "Valton", "VampirYunus", "Vares", "Vasco", "Vedius", "velbellys", "Verdes", "VeRu", "Vifas", "Vigil", "Vin", "Voyboy", "Vuckae", "Vyct0r", "Vyni", "Walker1", "Wandering", "Warner", "Wasteland", "Water", "WCD", "wdr", "Wen", "Whistle", "wicked", "Wickedd", "WilBR", "WildWolf", "Willy", "Wolorz", "Wuji", "Xen0gan", "Xiaobo", "XiaoDanny", "xiaotu", "XiaotuXXD", "XiaoXiang", "xKenzuke", "xPeke", "xTyLk", "Xuradel", "Xyliath", "Xzz", "Yassuo", "Yazan", "Yikesuo", "Yoda", "YoOlek", "Yosida", "Yuhe", "Yunbee", "Yuros", "Yusui", "Zach", "Zarcon", "Zeal", "Zelt", "Zeradyn", "Zhangsid", "Zherathor", "Zhixun", "Zhovy", "Zielok", "Zilax", "Zoey", "zoiren", "Zorro", "Zwyroo", "Zz1tai"], bottom: ["0131", "13", "3XA", "5kid", "AAdaMM", "Aang", "Abner", "Acasia", "Ace1", "Adison", "adrianlanei", "Adryh", "Aeru", "Aetinoth", "Afriibi", "Aggress1on", "AGGRESSION", "Ahn", "airren", "Ajuxsy", "Akashi", "AkiNiglet", "Aklass", "Akyro", "Al0ne", "Alessio", "Alexandazar", "AlienBoy", "Aliplane", "Alive", "Alonshot", "Altec", "anakin", "ANDARIEL", "Andreus", "Angel 1", "Annnnn", "Anyone", "Aomine", "Apse", "Aquila", "Archer", "ardaffler", "Aria51", "Array", "Arttt", "asphyxia", "Astrasmaug", "Asza", "Atlen", "Austerity", "Avarice", "AVRA", "Awakerino", "Axelent", "Axtray", "Ayakoso", "Azomali", "AZR", "azu", "Babaco", "Baki", "bakisa", "Balcik", "Bang", "Barata", "Baymaxed", "Bazz", "bbeNj", "Bebe", "Beenie", "Berimbau", "Berni", "Berto", "Besnaga", "betmiau", "Biosun", "bipi", "BipolarXD", "BitterBit", "Bjoernen", "BlackSwan", "Blankk", "Blaze", "Blek", "Bojji", "boLa", "Booshi", "Brance", "Breeze", "brTT", "Bruceeeere", "BUERO", "BunnyBeast", "Burai", "Cao", "Captain Jack", "Carrot", "catan", "Celo", "Certified", "Charlington", "Chayon", "CHECKFIDER", "ChiCh1", "chico", "chilioil", "Chimer", "choego", "Chomi", "Cimpo", "Cleanthus", "Clef", "Cody Sun", "Cogito", "Coldenfeet", "Coldfeeling", "Corobizar", "Cosmic", "Counter", "COZzoSKIllz", "Crem", "Creon2", "Crownie", "CUEST1ON", "Cypher", "cyraXx", "D1vine", "Daehan", "Dalka", "DAMKEXHINO4", "DAMKEXINHO4", "Damocles", "Danteh", "Dantesito", "Dantiz", "DarkSide", "David3", "Daviii", "Daycrow", "Deadly", "Deant", "Deckard", "Dee", "DeepLearn", "Defles", "Deft", "Deftly", "Deibjerg", "Demonadc", "Demoncior", "Demy", "DenVoksne", "DeuL", "Devn", "Dezo", "DIablo", "Dimeh", "Div Kid", "Django", "Donut", "Dotmm", "Doublelift", "Dream", "Dreilix", "dresscode", "DrftR", "Drogo", "DRUXY", "Drzemik", "Duck1", "Duel", "Dya", "Dzejno", "Easylove", "Ecstassy", "Eggsy", "ejsner", "ElCocas", "Electrising", "Emperor", "Endless", "Endz", "Enosh", "Enthralled", "Eomer", "Eonis", "Eryon", "Esgi", "Esko", "Eskuiro", "Ethe", "Eune", "Evangelyne", "EvanRL", "evol", "Exduardo", "Exnom", "EXOFENG", "ezman", "Faetski", "Fatorix", "Fede", "Feng", "FenRir", "Filou", "FIX", "Flakked", "Flare", "Flashpowa", "Flay", "FlickeR", "Flif", "Fluid", "Focho", "Forg1ven", "Foxy", "Frappii", "FUN k3y", "Fynox", "Gabenx", "Gadget", "Gama", "Gari", "Gary", "Gavotto", "GeeGee", "Geraldes", "Geveze", "Gewrix", "GGiler", "Gimi", "Giornito", "GlimpseofUs", "Godles", "Godot", "Godsi", "Goldenpenny", "Good Boi", "Granja", "Grave", "Gravity", "Greg House", "Greyone", "Grimm", "Guffe", "Guilin", "gunkrab", "gwisin", "Had3s", "Hadez", "Hako", "HARPOON", "Hazel", "Hazem", "Heat1", "Hena", "Hermes", "Hika", "Hiro Hai", "history", "Hjarnan", "HolyPhoenix", "Hoopa", "Horus", "HowLa", "Hsien", "Hub", "HuBiTeL", "I Z", "ianshaka", "ILUXA2011", "ilyy", "Imjustpro", "Imp", "Imp1", "Imperial", "Import", "Improve", "Impulse", "InoriB", "Intioo", "Invincible2", "Iruga", "Iso", "IvanD", "Izeman", "J1ferz", "Jabuticaba", "Jacob0", "Jalleba", "Jamie", "Jasten", "JaVa", "Jeskla", "Jeyrus", "Jinbeom", "jinjo", "jjira", "Jonhy", "JSaito", "JuJuTw0", "Juny1", "k1ng", "Kaffe", "Kaii1", "Kakarot", "Kamito", "Kamyk1", "Kaori", "Kapo", "Kasamura", "Kasi", "Kastiel", "Katsurii", "KDV", "Keduii", "Kehvo", "Kenal", "Kenu", "KERUSHA", "Kerveros", "Keymaker", "Khaendis", "Khaydarin", "kiMi", "Kindle", "kingpo54", "Kinzu", "Klorell", "Klydex", "Koan", "Kobe", "Kody", "Koira", "Kojima", "Komandata", "Kotvyc 74", "Koudys", "kRYST4L", "Kumaiy", "KUMEW", "KushArch", "kuvvu", "Kynetic", "L1mit", "Laatch", "Lakinther", "Landy", "LastDanceDF", "Laurus", "LazyFeel", "Leandrinn", "Leave", "Leazor", "Lefterakiss", "Lefty", "Legolas", "Lelouch1", "Lelouch2", "Letritas", "Levitate", "LilCarry", "LIMITLESS", "LINDGARDE", "LINKER", "LJM", "Looch", "Looki", "Lost", "Lothen", "LTZeta", "Luca Brassi", "Lucifer", "Luckie", "Lucy", "Ludas Matyi", "Lunatic", "Luntear", "Lure", "Luu", "lyg", "M4rth", "MadDogg9", "MadsF", "Majkkl", "Mali Mrav", "Mangoo", "Manu", "Marcelzgeg", "Marcv1", "Mario29c", "Marth", "Marvin", "Matebuff", "Mauki", "Mauss", "MayR", "Meech", "Messclick", "MetroArcher", "Mexi", "Mianare", "micaO", "Micinb", "Mihai", "Mikamy", "Milo", "Mimic1", "Mind", "Mindrago", "MinePiwek", "mirza", "Mis", "Missclick", "Misstery", "MNT", "Mobility", "Mooncacke", "Moroxito", "motimotti11", "Mouz", "Moyashi", "Mr Miks", "MrFreezed", "MrMiks", "MrPhantom", "MUDAI", "MuffinMan", "mumek", "Mystic", "N0way", "NaiNa", "Naitz", "NaMei", "Nannini", "nash1c", "NatusVincer", "Nawa", "NBA", "Nebula", "Neithan", "Nemky", "Neramin", "Netuno", "nevermind", "niinim", "Nikiyas", "Niksar", "NLLL", "NoahMost", "noran", "notdefused", "Nothing", "Notiko", "NOTTILTEDAD", "Nou", "noz2k", "nuance", "Nurak", "nutLeaF", "Oceann", "OddEye", "Odi11", "Ohtori", "ONLY", "Onlyx", "Ozgur", "OzoraVeki", "Padeck", "Padelius", "Paladin", "PARJIVAL", "PaSa", "Pat", "Patrik", "pbO", "Pcelica", "Peagod", "Pec0", "Pepero", "PeQReK", "Pericolo", "Perkz", "Perro", "Pesobaby", "phal", "Photic", "Piglet", "Pinki", "PiOk", "PiskHeLLo", "Pitar", "PiuPiu", "Pjames", "Pol", "Prage", "PraY", "Pro Hanter", "Prosty", "Puki Style", "pukistyle", "Puma", "Puppeh", "Pyeonsik", "Pyton", "Qu4rtzo", "R4T", "Rabelo", "Raeghal", "Raen1", "Raes", "Raheen", "raining", "Raisen", "RaptoSauros", "Ratao", "Ray", "Rayito", "Raysito", "razu", "Realer", "ReaperBabe", "Red", "Redstratos", "Rehkz", "reje", "Renyu", "Rex", "Rharesh", "Rias1", "RIIPPP", "Rikara", "rin", "Rokecs", "Romio", "Royeq", "Royhkea", "Ruep", "Ruf", "Rumi", "Rust", "Ryuk", "S M", "S34NDR0M3", "SAFO", "sahori", "SaIami", "Saico", "Salami", "Samux", "San", "Sandolas", "saru", "Sayo", "Scary Jerry", "Scenari0", "Scenario", "Scorth", "Self", "Sh3ry", "ShakeIt", "Shantao", "Shaoye", "Shaunna", "Shayla", "Shiganari", "Shine", "Shogun", "Shun2", "ShyCarry", "Sickdy", "Sidav", "silkysmath", "Sinister", "siniter", "Sirotama", "Sjedow", "Skream", "SkyK", "Skynet", "Skyp", "Skypper", "Skypture", "slayder", "Slayer", "Slowz", "Slyv3r", "Smalls", "Smlz", "Sneaky", "Snoopy", "SoIdier", "Sola", "Soldier", "Solorio", "Sombre", "Sonzini", "SophistSage", "Soransen", "Space", "Sparkiii", "Spawn", "Sriko", "Stardrake", "Stardust", "Starry", "Steller", "Stixxay", "Strode", "Sty1e", "styled", "Styx", "Sun Tiger", "Sunleaf", "svns", "Svoby", "Sw3ry", "Syzyfek", "Tactical", "TakenSpirit", "Tazaku", "Tele", "Tempest", "TenT", "TheGelvic", "Thomas Shen", "Tiger", "TitaN", "Tito", "Tiwaz", "TLamp", "Tomnam", "Tomo", "TopSpin", "TopSpin2", "Tracy", "Trenie", "Trick2g", "ts2011", "tuokaZ", "Tyler1", "Unchainedd", "Unforgiven", "Unified", "Unkn0wn", "Uzi", "V1K", "Valhalla", "Value", "Varry", "Vaynedeta", "Vega", "Velchev", "VENDRICK", "Vespa", "Veyytix", "Vibzz", "Viciun", "Vinboiz", "ViolaFactor", "Violet", "VirusFx", "Vit", "vladichich", "Vlaken", "Voice", "Void2", "Vonix", "Vorbex", "Vox", "Vzz", "W1ng", "wada1", "Wako", "Waliontann", "Wamdejo", "wanan", "Wapode", "Warangelus", "Wayne", "WEIXIAO", "Wenbo", "WeNeKappa", "Whale", "Whoshills", "WildRabbit", "WildTurtle", "William", "Wind", "wolfs child", "Woolite", "Worst", "WorstAdc", "WXRX", "X1aoCHiao", "Xamexx", "Xavian", "Xemon", "xHikama", "XiaoYang", "Xicor", "XieDoDo", "xmar", "Xpontaneous", "Yakkey", "Yamato0", "Yashiro", "Yen", "Yojin", "Yourzedx", "Yozu", "Yuki", "yukin0", "Yur4ik", "Yusa", "Yutapon", "zamulek", "Zantimon", "Zavee", "Zebron", "Zefirot", "Zeitnot", "Zeldris", "Zev", "Zeypher", "ZombieHog", "Zyzz"], support: ["150", "1Bicho", "1SSUE", "224", "225", "2274", "6auci", "6th Man", "Abagnale", "Absolute", "Abyssxd", "Acevedo", "Acheron", "aChuckArell", "Acorderr", "Adept", "Adri", "Adrian", "Adryyyyh", "Aeiden ARCH", "AgesAmin", "Aglaro", "Aiman", "Alaan", "Aladoric", "Alaric", "Aledice", "Aleks", "Algos", "Alleex", "ALPX", "Ankor", "Anthrax", "Antos", "Anya", "APDRONE", "aphromoo", "Api", "Apii", "april", "Argonauta", "Ashlomailma", "ASM", "Astolfo", "Astrai", "Atat", "Attila", "Aurorr", "autefu", "AwerpiS", "Axin", "Aymen", "B Butcher", "BaBaYaGa", "Badmilk", "Baolan", "Barti", "Bashq", "Batuuu", "Baul", "Bawsi", "BayMg", "bAZZILISKS", "Beatlez", "BeBopBulli", "Bellow", "Beplush", "Bera", "BeryL", "besu", "Betosky", "Big", "Big Daddy", "Biob", "Biofrost", "Blazteurs", "Bliio", "Blubber", "Bluffing", "Bmoooo", "Bola1", "Boltox", "Bona", "BoskETI", "Bounty", "BoxeR", "Boy Wonder", "Breezy", "Brolia", "BrotherLuis", "Bubba", "Bucket", "Buddy", "Buggyeman", "bulas", "BunnyFuFuu", "Bunnyhub", "Burence", "Cabrito", "Cadence", "Callian", "Calmsky", "camilo", "Candyyy", "carium", "Carolina", "Carry", "Cassius", "cat", "Cavalo", "CBL", "CblpHuK", "CENTU", "Centulion", "Cezz", "Chambel", "Champi", "Charley", "Charlie", "Chenxuan", "chilD", "Chillness", "Chime", "CHIMP", "Choka", "Chokem", "Chompy", "Cisse", "Ciudi", "CL0UD", "Cloud", "CloudStrike", "Clyde", "CoBiT", "Colbe", "Colden", "Coli", "Colomblbl", "Corri", "Cospect", "costy", "CrabLord", "CREATORE", "Crecre", "Cringeed", "Crow", "Crunchy", "Cubo", "Cuchi", "Cuden", "D Francine", "D0kai", "D3vi", "Damage", "Danifufu", "Daption", "Dara", "Dargod", "Daskalos", "Dawerko", "Dawn PCS", "DCStar", "Decoy", "Degla", "Dejvos", "Dekap", "Deleted", "Dems", "Dengel", "denyk", "destiny", "Dexam", "Dextyle", "Dimill", "Dimonko", "Dingo", "Djamel", "Djoksi", "Djulo", "Domaschlous", "Don Ponk", "Doss", "Douvid", "Dovendyr", "Downfall", "Dragku", "Dragonmin", "Dragonminki", "Drannarith", "Dreseul", "Driak21", "Duman", "Dumbledoge", "Dummyxx", "Duoking1", "Eason", "EastGoblin", "Eckbard", "Edo", "Edvard", "Edward", "Eis", "Elio", "Elwind", "EMPTY2", "Enapon", "EnHoa", "Enkil", "Enoch", "Enso", "EnsU", "Entrust", "EpicReaper", "Erdote", "Erha", "Erk", "Ermin", "ErPirotBlue", "esA", "Exiled", "Extorsus", "F1ko", "f4ke", "farfetch", "Farhn", "FatBenny", "Felia", "Felkros", "Feng55", "Fill", "Findo", "Fine4Ever", "Fiorin", "Fla01", "Floppy", "floreNNNz", "fonix", "ForeverLim", "Fornari", "Fortu", "Fr0zen", "FREDEAD", "FredSpaghet", "fuki", "Furby", "Furkoazki", "fury2", "Future", "gabn", "Gabylidades", "GAENG", "Gajo", "Garank", "Gastruks", "Gate", "Gatovisck", "Gela1", "GEPARDD", "GEPARDINHO5", "Ghost", "Glory", "Glory3", "Godteddy", "Goliath", "Goniu Bug", "Gordinho", "GorillA", "Gowhter", "Gralou", "Greedy", "Grindyzer", "Grisen", "GugaJeans", "Guigs", "Gyeong", "H3", "Hakuho", "Hamezz", "Hang", "hani1", "Hanli", "Hansu", "haoswen", "Hawk", "Heart", "Helaz", "Helios", "Heretic", "Herod", "hetel", "Hexflash", "Hexom", "hextasy", "HH", "Hierro", "Hieu3", "Highway", "Himeera", "Honda", "houndin", "Huevo Frito", "HungryPanda", "Huron", "Hylissang", "Hyosha", "I CLARK I", "IamWenca", "Igloodan", "IgnaVilu", "Ihebic", "iLevi", "iMinions", "immanitas", "Infoneral", "insane", "Insane1", "Iron Pyrite", "Iska", "itSir", "J3rkie", "Jactroll", "Jagger", "Jakobobbi", "jandroooo", "Japone", "JayJ", "Jealow", "JeIIy", "JeppeHou", "Jestkui Max", "Jezu", "Jisung", "JJirkos", "Jk", "Joaquiin", "Jockster", "Joexy", "Jotape", "Juarezz", "Julien", "Just", "justcan", "JustFocus", "Jwei", "K", "Kairi", "Kaiser", "Kalhira", "Kalni", "Kartso", "Kaseko", "Kasing", "Kayden", "Kb", "Kellie", "Kenji", "kentakki", "Keres", "keroo", "Khael", "khaN1996", "Khl", "kibah", "Kiddo", "Kiddowo", "Kim Down", "Kita", "kkero", "Klopsik76", "Koala", "Kocourek", "koisi", "Kolpo", "Koresh", "Kovy", "Kra", "Krazus", "Krepo", "kubagoat", "kumuo", "Kunou", "kurahuto", "Kuro3", "Kurulean", "Kusuo", "L0SER", "Lac", "Lagas", "Lalo", "Lance", "Lchallenge", "LDK", "Legendary", "Lekcyc", "Lekcycc", "Lele", "Leo D Aras", "Leon3", "Lepton", "Lesterik", "lFreeSoull", "Libra1", "Life", "Lilac Wine", "Lilipp", "Lin", "Lisbd", "lll", "Lokmays", "Loopy", "LoreB3ck", "Lostboy", "Lounet", "Lowzy", "Lucker", "LuknoM", "Lumi", "Lumos", "LupinoBate", "Lustboy", "Lxf7Tocke", "Lyng", "Lyrokun", "M G", "M w F", "M0NK", "M0ra", "M1ta", "Maceta", "Macucho", "Madblade", "MadLife", "Magvayer", "MaKiSHyy", "Manel", "Manuelcap", "manuemdo", "Manuize", "Maramu", "Marco", "Marlley", "Maruko", "Marzaya", "Mata", "MattyNarcy", "Maufest", "maYma", "Meager", "MedicCasts", "Medo", "Mega1", "Meleks", "Melekx", "Melocoton", "Melody", "Mercenary", "Mersa", "Mese", "Meteoro", "migix", "MikePerwait", "Minalup", "minemaciek", "Minous", "Miracle", "Mirai", "missipissi", "Mita", "Mithy", "MnM", "Moham", "Molik", "monkaS", "Mood", "Moopz", "MrOregano", "mrproxi", "mT", "Munet", "murilao", "Mxe", "Mystiques", "Nagi", "Nakar", "Narukya", "Nash", "Nedara", "NeedyHenry", "negola", "Neith", "Nekha", "NerzhuL", "Nightmares", "NioColt", "Noa", "Nora", "Norskeren", "Notod4Y", "Noway", "NTK", "Nukes", "Nukez", "Nym", "Obstinatus", "Odessa", "OkerumoN", "Oki1", "Olimpialos", "Olleh", "Onier", "Online", "Only35", "OrthoZero", "Oscure", "Outlaw", "Palacsinta", "Palette", "Pandar", "Panderp", "Panj", "Papi Chulo", "PapilGRE", "Paradox", "Parein", "Parukia", "Passzi", "Pastelito", "PataDePollo", "Patch", "Pattarek", "PauFerran", "PeanutCoco", "Peto", "phast", "Phlloz", "Picasso", "Piero", "Piku", "Pinkmin", "Pitress", "PlanB", "Pleata", "Plume", "Plut0", "Pluto1", "po", "Pockus", "Poliwhirl", "Pollu", "Poo", "PoohManDu", "Pop", "Potato", "POUfnyy", "Powages", "Predicted", "Prime", "ProDelta", "Profirio", "Prosfair", "Protos", "PTM", "PyI", "Pyker", "Pyl", "Pyrka", "Qpies", "Quantum", "RaFaL", "Rafflees", "raisu", "raku", "Rassiel", "Raxxo", "REAVER", "RedamnTion", "Reddy", "Redemption", "REDFERNAL", "Rekkles", "Rezso", "RHINO", "Ricarderix", "Richu", "Rift", "ritmo", "Riyev", "Riyuuka", "Robertoos", "Rolent", "Rosey5", "Ross", "rovex", "Rozpier", "RUSHEX", "Rutzou", "Rychly", "Ryuuhu", "S1aytrue", "S1D", "Sag1rii", "Saint Ghoul", "Saki", "Saravinho", "sas", "Saver", "scamber", "Scarface1", "Schlaf gut", "Scxtt", "Seal", "seaz", "Seneca", "Senshi", "Serah", "Serendip", "Sh1vq", "Shadow", "Shakespeare", "Sharp30", "Sheng", "Shiphtur", "Shoiti", "Shone", "Shredder", "Shu Hari", "Shyr0", "Sigma", "SirCotza", "SirFate", "Siriass", "SIRIUSS", "Siso", "Sivvy", "Six0x", "SJW", "Skain", "Skanito", "SkuLL", "Skyy", "Slavonac", "Slipper", "SloPp", "Sloth", "Smarty", "Smerv", "Smoke", "Smoothie", "Snow2", "Snowflower", "Soap", "Sobak", "Sol", "Sophyre", "SORROW", "SouI", "SOUPerior", "SpeedoBear", "Speedy1", "SpieleAufDe", "Staargazing", "StarDragon", "StarPax", "Starsmitten", "SteaD", "Steeelback", "Stookbeer", "Strai", "StratosFan", "substitute", "Sufleks", "Sufon", "Sundax", "Sunfry", "Suppa", "Sworm", "Syfu", "Sylus", "Syrpy", "Tahahy", "Taiyaki", "TAKON", "Targamas", "Tash", "TasteLess", "Tchokez", "Te Ka", "Te Ka2", "Tebi GG", "TeeSum", "Telas", "Tensor", "Teodor", "tershow", "TESLA", "Tgee", "Thomas", "thominhas", "Thream", "Tiagito", "Tiara", "TIMR", "Tina", "Tinelli", "TNS", "Tockimo", "Tolerant", "toraneko", "towhat", "TQ", "Trance", "Trifan", "Tristesse", "Tufi", "Tulz", "Tusin", "Twiizt", "TwoN", "Tyr", "Tyrant", "uden", "UFO", "uKyo", "Undefined", "Undertaker", "Unknown", "unlove", "Unlucky", "Ux", "Vahvel", "Vala", "Vander", "Vango", "Varin", "Varon", "Vaunted", "Veignorem", "Vico7", "Viico", "Viketox", "Virgo", "Visdom", "Vxpir", "Wadid", "walnut", "Wapura", "Warizar", "Watket", "Whiplash", "whiteinn", "Whyin", "Wildenbruch", "winter", "Wolf", "Woohee", "Wrongo", "Wuis", "xCharm", "XerRay", "Xiaoxia", "xiyang", "xlolzorx", "Xpecial", "Yaztrom", "Ycx", "YNO", "Yoon", "YoPoopU", "Ysera", "Yuichiro", "Yukii", "YuLun", "Yume", "Yursan", "Zaremba", "Zay", "Ze Luis", "Zergsting", "Zest2 XXD", "Zeussak", "Zeyzal", "Zin", "Zodiac", "Zoelys", "Zothve", "Zuka", "Zyko", "Zzzofia"] };

  // lib/season/playerLifecycle.ts
  var LANE_KEYS = ["top", "jungle", "middle", "bottom", "support"];
  var POOL_BY_LANE = (() => {
    const byLane = {
      top: [],
      jungle: [],
      middle: [],
      bottom: [],
      support: []
    };
    if (Array.isArray(rookieNames_default)) {
      for (const l of LANE_KEYS) byLane[l] = rookieNames_default;
    } else {
      const keyed = rookieNames_default;
      for (const l of LANE_KEYS) byLane[l] = keyed[l] ?? [];
    }
    return byLane;
  })();
  function rookieName(lane, rng, taken, region) {
    const pool = POOL_BY_LANE[lane];
    const reserved = new Set([...taken].map(normalizeHandle));
    for (let i = 0; i < 12 && pool.length > 0; i++) {
      const n = pool[Math.floor(rng() * pool.length)];
      if (!reserved.has(normalizeHandle(n)) && isValidHandle(n)) {
        taken.add(n);
        return n;
      }
    }
    return generateHandle(rng, taken, region);
  }
  var DEBUT_AGE_MIN = 17;
  var PRIME_FROM = 20;
  var GROWTH_UNTIL = 23;
  var DECLINE_FROM = 29;
  var SPLUS_POTENTIAL_CHANCE = 0.03;
  var CHANGE_RATE = 0.6;
  var PERF_NEUTRAL = 5.5;
  var PERF_WEIGHT = 0.18;
  var ROOKIE_AGE_MAX = 19;
  var GRADE_GAP_THRESHOLD = 0.9;
  var UNDERPERFORM_STREAK_TO_DEMOTE = 5;
  var ACADEMY_YEARS2 = 3;
  var FREE_AGENT_YEARS2 = 4;
  var TOTAL_INACTIVE_BEFORE_RETIRE2 = ACADEMY_YEARS2 + FREE_AGENT_YEARS2;
  var clamp4 = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function backfillInactiveClockYears(pool) {
    if (pool.every((e) => e.clockYear != null)) return [...pool];
    return pool.map(
      (e) => e.clockYear != null ? e : { ...e, clockYear: e.demotedYear }
    );
  }
  function computeRoleMeans(outcomes) {
    const sum = {};
    const cnt = {};
    for (const o of outcomes) {
      if (o.grade == null || !Number.isFinite(o.grade) || o.grade <= 0) continue;
      sum[o.lane] = (sum[o.lane] ?? 0) + o.grade;
      cnt[o.lane] = (cnt[o.lane] ?? 0) + 1;
    }
    const out = {};
    for (const lane of LANE_KEYS) {
      const c = cnt[lane];
      if (c && c > 0) out[lane] = (sum[lane] ?? 0) / c;
    }
    return out;
  }
  function makeRookie(lane, champions, rng, taken, region) {
    const age = DEBUT_AGE_MIN + Math.floor(rng() * (ROOKIE_AGE_MAX - DEBUT_AGE_MIN + 1));
    const startVal = clamp4(-1 + Math.floor(rng() * 3), -2, 1);
    const tier = valueToTier(startVal);
    let potVal = clamp4(startVal + 1 + Math.floor(rng() * 3), -2, 2);
    if (potVal >= 2 && rng() < SPLUS_POTENTIAL_CHANCE) potVal = 3;
    const potential = valueToTier(potVal);
    const pools = randomizeChampPools(lane, champions, rng, tier);
    return {
      id: makePlayerId(rng),
      name: rookieName(lane, rng, taken, region),
      lane,
      tier,
      age,
      potential,
      badStreak: 0,
      goodChamps: pools.goodChamps,
      badChamps: pools.badChamps,
      ...region ? { homeRegion: region } : {},
      acclimation: 1
    };
  }
  function agePlayer(player, perf, rng) {
    const age = (player.age ?? 22) + 1;
    const tierVal = PLAYER_TIER_VALUE[player.tier];
    const potVal = PLAYER_TIER_VALUE[player.potential ?? player.tier];
    let pressure = 0;
    if (age >= PRIME_FROM && age <= GROWTH_UNTIL && tierVal < potVal) pressure += 0.45;
    if (age >= DECLINE_FROM) pressure -= 0.35 * ((age - (DECLINE_FROM - 1)) / 3);
    pressure -= 0.1 * (tierVal / 2);
    if (perf != null) pressure += PERF_WEIGHT * (perf - PERF_NEUTRAL);
    let tier = player.tier;
    if (rng() < CHANGE_RATE) {
      const pUp = clamp4(0.5 + pressure, 0.05, 0.95);
      const dir = rng() < pUp ? 1 : -1;
      let nextVal = tierVal + dir;
      if (dir > 0) nextVal = Math.min(nextVal, potVal);
      nextVal = clamp4(nextVal, -2, 3);
      tier = valueToTier(nextVal);
    }
    return { ...player, age, tier };
  }
  function isUnderperformingSeason(outcome, roleMean, gradeGap = GRADE_GAP_THRESHOLD) {
    const gradeBelow = outcome.grade != null && Number.isFinite(outcome.grade) && outcome.grade > 0 && roleMean != null && Number.isFinite(roleMean) && roleMean > 0 && roleMean - outcome.grade + 1e-9 >= gradeGap;
    if (!gradeBelow) return false;
    let hits = 1;
    if (outcome.tier === "C" || outcome.tier === "D") hits += 1;
    if (outcome.splitTitles <= 0 && outcome.intlTitles <= 0) hits += 1;
    return hits >= 2;
  }
  function nextBadStreak(prev, outcome, roleMean, gradeGap = GRADE_GAP_THRESHOLD) {
    if (outcome.intlTitles > 0) return 0;
    if (outcome.grade == null || !Number.isFinite(outcome.grade) || outcome.grade <= 0 || roleMean == null || !Number.isFinite(roleMean) || roleMean <= 0) return prev ?? 0;
    if (isUnderperformingSeason(outcome, roleMean, gradeGap)) return (prev ?? 0) + 1;
    return 0;
  }
  function withRosterTimeMark(items, mark, season, afterTeams = season?.teams, afterPool = season?.franchise?.inactivePool) {
    if (!mark) return [...items];
    return items.map((n) => ({
      ...n,
      timeMark: n.timeMark || mark,
      ...season && !n.origin ? { origin: marketOrigin(season, n.timeMark || mark) } : {},
      ...!n.origin && !n.teamSnapshots && n.teamId && season?.teams && afterTeams ? { teamSnapshots: captureMarketTeamSnapshots(season.teams, afterTeams, [n.teamId], season.franchise ? { before: season.franchise.inactivePool ?? [], after: afterPool ?? [] } : void 0) } : {}
    }));
  }
  function pickReturnee(pool, lane, teamId, rng, byId, meta, excludePlayerIds) {
    return pickScoredReturnee(pool, lane, teamId, byId, meta, rng, excludePlayerIds);
  }
  function advanceInactivePool(pool, rng, champions = [], closingYear) {
    const out = [];
    for (const entry of pool) {
      if (entry.status === "retired") {
        out.push(entry);
        continue;
      }
      const inactiveTenure = entry.inactiveTenure ? {
        academyYears: entry.inactiveTenure.academyYears + (entry.status === "academy" ? 1 : 0),
        freeAgentYears: entry.inactiveTenure.freeAgentYears + (entry.status === "free-agent" ? 1 : 0)
      } : void 0;
      const tick = tickInactiveYear(entry, champions, rng);
      const perf = inactiveMarketGrade({
        ...entry,
        player: tick.player,
        shadowGrade: tick.shadowGrade
      });
      const aged = entry.status === "academy" ? { ...tick.player, age: (tick.player.age ?? 22) + 1 } : agePlayer(tick.player, perf, rng);
      if (closingYear != null && inactiveClockYear(entry) === closingYear) {
        out.push({
          ...entry,
          player: aged,
          inactiveTenure,
          shadowGrade: tick.shadowGrade
        });
        continue;
      }
      const baseYears = entry.inactiveYears < 1 ? 1 : entry.inactiveYears;
      const inactiveYears = baseYears + 1;
      let status = entry.status;
      if (status === "academy") {
        const tenure = academyTenureYears({
          ...entry,
          player: aged,
          inactiveYears,
          shadowGrade: tick.shadowGrade
        });
        if (inactiveYears > tenure) status = "free-agent";
      }
      if (inactiveYears > TOTAL_INACTIVE_BEFORE_RETIRE2) status = "retired";
      out.push({
        ...entry,
        player: aged,
        inactiveTenure,
        inactiveYears,
        status,
        shadowGrade: tick.shadowGrade
      });
    }
    return out;
  }
  function runDemotionPass(teams, outcomesById, roleMeans, inactivePoolIn, champions, rng, taken, year, opts = {}) {
    const gradeGap = opts.gradeGap ?? GRADE_GAP_THRESHOLD;
    const ageActives = opts.ageActives ?? false;
    const advancePool = opts.advancePool ?? false;
    const meta = opts.meta ?? NEUTRAL_META;
    const byId = new Map(champions.map((c) => [c.id, c]));
    const competitive = opts.competitiveMarket ?? advancePool;
    const openFa = opts.openFaMarket ?? advancePool;
    const academyMaint = opts.academyMaintenance ?? openFa;
    const mintYear = opts.intakeYear ?? year;
    const news = [];
    let pool;
    const reconciled = reconcileRosterPoolDuplicates(
      teams.map((t) => ({ id: t.id, players: [...t.players] })),
      inactivePoolIn
    );
    const teamsIn = teams.map((t) => {
      const healed = reconciled.teams.find((x) => x.id === t.id);
      return healed ? { ...t, players: healed.players } : t;
    });
    const inactiveHealed = reconciled.inactivePool;
    for (const entry of inactivePoolIn) {
      if (entry.player.name) taken.add(entry.player.name);
    }
    if (advancePool) {
      const before = backfillInactiveClockYears(inactiveHealed);
      let advanced = advanceInactivePool(before, rng, champions, year);
      advanced = applyAcademyGraduateCap(before, advanced);
      advanced = applyFaGraduatePressure(before, advanced);
      advanced = cullWeakFaWhenOversized(advanced);
      pool = advanced;
      const beforeById = new Map(
        before.filter((e) => e.player.id).map((e) => [e.player.id, e])
      );
      for (const after of pool) {
        if (!after.player.id) continue;
        const prev = beforeById.get(after.player.id);
        if (after.status === "free-agent" && prev?.status === "academy") {
          news.push(makeBecameFaNews(after, "became-fa"));
        } else if (after.status === "retired" && prev && prev.status !== "retired") {
          news.push(makeRetiredNews(after, prev));
        }
      }
    } else {
      pool = backfillInactiveClockYears(inactiveHealed);
    }
    const resultTeams = [];
    const vacancies = [];
    const samePassDemoteIds = /* @__PURE__ */ new Set();
    for (const team of teamsIn) {
      const nextPlayers = [];
      for (let slotIndex = 0; slotIndex < team.players.length; slotIndex++) {
        const p = team.players[slotIndex];
        if (p.name) taken.add(p.name);
        const outcome = p.id ? outcomesById.get(p.id) : void 0;
        const grade = outcome?.grade ?? null;
        const base = ageActives ? agePlayer(p, grade, rng) : p;
        const laneMean = roleMeans[base.lane] ?? null;
        const streak = nextBadStreak(
          base.badStreak,
          {
            grade,
            tier: base.tier,
            splitTitles: outcome?.splitTitles ?? 0,
            intlTitles: outcome?.intlTitles ?? 0
          },
          laneMean,
          gradeGap
        );
        const withStreak = { ...base, badStreak: streak };
        if (streak >= UNDERPERFORM_STREAK_TO_DEMOTE && withStreak.id) {
          samePassDemoteIds.add(withStreak.id);
          const parked = addToTeamAcademy(pool, {
            player: { ...withStreak, badStreak: 0 },
            status: "academy",
            // 1-based: badge shows Academy · 1y on demotion day.
            inactiveTenure: { academyYears: 0, freeAgentYears: 0 },
            inactiveYears: 1,
            demotedYear: year,
            clockYear: year,
            lastTeamId: team.id,
            lastTeamName: team.name,
            ...grade != null ? { lastActiveGrade: grade, shadowGrade: grade } : {}
          });
          pool = parked.pool;
          if (parked.bumped) news.push(makeBecameFaNews(parked.bumped, "academy-bump"));
          vacancies.push({
            teamId: team.id,
            teamName: team.name,
            leagueId: team.leagueId,
            lane: withStreak.lane,
            slotIndex: nextPlayers.length,
            ...withStreak.name ? { departedName: withStreak.name } : {},
            departedTier: withStreak.tier,
            ...withStreak.age != null ? { departedAge: withStreak.age } : {},
            departedId: withStreak.id,
            departedGrade: grade,
            departedDestination: "academy"
          });
          nextPlayers.push(null);
        } else {
          nextPlayers.push(withStreak);
        }
      }
      resultTeams.push({ id: team.id, players: nextPlayers });
    }
    const teamIndex = new Map(resultTeams.map((t, i) => [t.id, i]));
    if (competitive && vacancies.length > 0) {
      const { fills, remainingPool } = resolveCompetitiveFills(
        vacancies,
        pool,
        byId,
        meta,
        rng,
        samePassDemoteIds,
        opts.faBidBoost
      );
      pool = remainingPool;
      for (const fill of fills) {
        const ti = teamIndex.get(fill.vacancy.teamId);
        if (ti == null || !fill.entrant) continue;
        if (fill.entrant.name) taken.add(fill.entrant.name);
        resultTeams[ti].players[fill.vacancy.slotIndex] = fill.entrant;
        const fillNews = {
          teamId: fill.vacancy.teamId,
          lane: fill.vacancy.lane,
          ...fill.vacancy.departedName ? { departedName: fill.vacancy.departedName } : {},
          ...fill.vacancy.departedTier ? { departedTier: fill.vacancy.departedTier } : {},
          ...fill.vacancy.departedAge != null ? { departedAge: fill.vacancy.departedAge } : {},
          ...fill.vacancy.departedId ? { departedId: fill.vacancy.departedId } : {},
          ...fill.vacancy.departedDestination ? { departedDestination: fill.vacancy.departedDestination } : {},
          entrantName: fill.entrant.name ?? "",
          entrantTier: fill.entrant.tier,
          entrantPotential: fill.entrant.potential ?? fill.entrant.tier,
          ...fill.entrant.id ? { entrantId: fill.entrant.id } : {},
          entrantSource: fill.source,
          ...fill.passedAcademyName ? { passedAcademyName: fill.passedAcademyName } : {},
          ...fill.beatenNames ? { beatenNames: fill.beatenNames } : {},
          ...fill.marketNote ? { marketNote: fill.marketNote } : {}
        };
        if (!isSamePlayerReplaceNoise(fillNews)) news.push(fillNews);
      }
    } else {
      for (const v of vacancies) {
        const ti = teamIndex.get(v.teamId);
        if (ti == null) continue;
        const pick = pickReturnee(
          pool,
          v.lane,
          v.teamId,
          rng,
          byId,
          meta,
          samePassDemoteIds
        );
        if (!pick) continue;
        const [takenEntry] = pool.splice(pick.idx, 1);
        const entrant = applyComebackRust(
          takenEntry.player,
          takenEntry.inactiveYears,
          v.leagueId
        );
        const source = takenEntry.status === "academy" ? "academy" : "free-agent";
        if (entrant.name) taken.add(entrant.name);
        resultTeams[ti].players[v.slotIndex] = entrant;
        const midNews = {
          teamId: v.teamId,
          lane: v.lane,
          ...v.departedName ? { departedName: v.departedName } : {},
          ...v.departedTier ? { departedTier: v.departedTier } : {},
          ...v.departedAge != null ? { departedAge: v.departedAge } : {},
          ...v.departedId ? { departedId: v.departedId } : {},
          ...v.departedDestination ? { departedDestination: v.departedDestination } : {},
          entrantName: entrant.name ?? "",
          entrantTier: entrant.tier,
          entrantPotential: entrant.potential ?? entrant.tier,
          ...entrant.id ? { entrantId: entrant.id } : {},
          entrantSource: source,
          ...pick.passedAcademyName ? { passedAcademyName: pick.passedAcademyName } : {},
          ...pick.marketNote ? { marketNote: pick.marketNote } : {}
        };
        if (!isSamePlayerReplaceNoise(midNews)) news.push(midNews);
      }
    }
    const vacancyBySlot = new Map(
      vacancies.map((v) => [`${v.teamId}:${v.slotIndex}`, v])
    );
    for (const t of resultTeams) {
      const src = teamsIn.find((x) => x.id === t.id);
      for (let i = 0; i < t.players.length; i++) {
        if (t.players[i]) continue;
        const lane = src?.players[i]?.lane ?? LANE_KEYS[i];
        const vac = vacancyBySlot.get(`${t.id}:${i}`);
        if (!teamAcademyHasRoom(pool, t.id)) continue;
        const rook = makeRookie(lane, champions, rng, taken, src?.leagueId);
        rook.debutYear = mintYear;
        const parked = executeAddAcademyRookie(
          pool,
          t.id,
          src?.name ?? t.id,
          rook,
          mintYear
        );
        if (!parked.ok) continue;
        pool = parked.inactivePool.filter((e) => e.player.id !== rook.id);
        t.players[i] = rook;
        const mintNews = {
          teamId: t.id,
          lane,
          ...vac?.departedName ? { departedName: vac.departedName } : {},
          ...vac?.departedTier ? { departedTier: vac.departedTier } : {},
          ...vac?.departedAge != null ? { departedAge: vac.departedAge } : {},
          ...vac?.departedId ? { departedId: vac.departedId } : {},
          ...vac?.departedDestination ? { departedDestination: vac.departedDestination } : {},
          entrantName: rook.name ?? "",
          entrantTier: rook.tier,
          entrantPotential: rook.potential ?? rook.tier,
          ...rook.id ? { entrantId: rook.id } : {},
          entrantSource: "academy",
          marketNote: "academy-rookie"
        };
        if (!isSamePlayerReplaceNoise(mintNews)) news.push(mintNews);
      }
    }
    let finalTeams = resultTeams.map((t) => ({
      id: t.id,
      // Temporary: keep safety for open-FA / academy-maint which need full rosters.
      // True safety-rookie mint happens only after academy maintenance below.
      players: t.players.map((p, i) => {
        if (p) return p;
        const src = teamsIn.find((x) => x.id === t.id);
        const lane = src?.players[i]?.lane ?? LANE_KEYS[i];
        const vac = vacancyBySlot.get(`${t.id}:${i}`);
        const rook = makeRookie(lane, champions, rng, taken, src?.leagueId);
        rook.debutYear = mintYear;
        news.push({
          teamId: t.id,
          lane,
          ...vac?.departedName ? { departedName: vac.departedName } : {},
          ...vac?.departedTier ? { departedTier: vac.departedTier } : {},
          ...vac?.departedAge != null ? { departedAge: vac.departedAge } : {},
          ...vac?.departedId ? { departedId: vac.departedId } : {},
          ...vac?.departedDestination ? { departedDestination: vac.departedDestination } : {},
          entrantName: rook.name ?? "",
          entrantTier: rook.tier,
          entrantPotential: rook.potential ?? rook.tier,
          ...rook.id ? { entrantId: rook.id } : {},
          entrantSource: "rookie",
          // Hard safety only: academy was full / mint failed — games need 5 bodies.
          marketNote: "rookie-gate"
        });
        return rook;
      })
    }));
    if (openFa) {
      const opened = runOpenFaReplacePass(
        finalTeams.map((t) => {
          const src = teamsIn.find((x) => x.id === t.id);
          return {
            id: t.id,
            name: src?.name ?? t.id,
            leagueId: src?.leagueId,
            players: t.players
          };
        }),
        pool,
        byId,
        meta,
        outcomesById,
        rng,
        // Cut incumbents belong to the closing year, not the upcoming intake.
        year,
        {
          ...opts.skipOpenFaTeamIds ? { skipTeamIds: opts.skipOpenFaTeamIds } : {},
          ...opts.openFaAttemptChance != null ? { attemptChance: opts.openFaAttemptChance } : {}
        }
      );
      finalTeams = opened.teams;
      pool = opened.inactivePool;
      news.push(...opened.news);
    }
    if (academyMaint) {
      const makeTeamInputs = (rosters) => rosters.map((t) => {
        const src = teamsIn.find((x) => x.id === t.id);
        return {
          id: t.id,
          name: src?.name ?? t.id,
          leagueId: src?.leagueId,
          players: t.players
        };
      });
      const skipOpts = opts.skipOpenFaTeamIds ? { skipTeamIds: opts.skipOpenFaTeamIds } : void 0;
      const midSplit = !advancePool;
      const promoted = runOpenAcademyReplacePass(
        makeTeamInputs(finalTeams),
        pool,
        byId,
        meta,
        outcomesById,
        rng,
        // Displaced incumbents are cuts from the closing year.
        year,
        {
          ...skipOpts ?? {},
          ...samePassDemoteIds.size > 0 ? { excludePlayerIds: samePassDemoteIds } : {}
        }
      );
      finalTeams = promoted.teams;
      pool = promoted.inactivePool;
      news.push(...promoted.news);
      const teamInputs = makeTeamInputs(finalTeams);
      const cutThisPass = new Set(
        teamsIn.flatMap((t) => t.players.flatMap((p) => p.id ? [p.id] : []))
      );
      const released = runAiAcademyReleasePass(
        teamInputs,
        pool,
        byId,
        meta,
        rng,
        year,
        { ...skipOpts ?? {}, excludePlayerIds: cutThisPass }
      );
      pool = released.inactivePool;
      news.push(...released.news);
      const stashed = runAiAcademyStashPass(
        teamInputs,
        pool,
        byId,
        meta,
        rng,
        year,
        {
          ...skipOpts ?? {},
          midSplit
        }
      );
      pool = stashed.inactivePool;
      news.push(...stashed.news);
      const rookied = runAiAcademyRookiePass(
        teamInputs,
        pool,
        champions,
        rng,
        taken,
        mintYear,
        {
          ...skipOpts ?? {},
          midSplit
        }
      );
      pool = rookied.inactivePool;
      news.push(...rookied.news);
    }
    return { teams: finalTeams, inactivePool: pool, news };
  }
  function runAiAcademyRookiePass(teams, pool, champions, rng, taken, year, opts) {
    let working = [...pool];
    const news = [];
    const skip = opts?.skipTeamIds;
    const midSplit = opts?.midSplit ?? false;
    const chance = midSplit ? AI_ACADEMY_ROOKIE_CHANCE_MID_SPLIT : AI_ACADEMY_ROOKIE_CHANCE;
    const faCount = working.filter((e) => e.status === "free-agent").length;
    const faThin = !midSplit && faCount < AI_ACADEMY_ROOKIE_FA_THIN;
    for (const team of teams) {
      if (skip?.has(team.id)) continue;
      if (countAcademyRookiesMintedInYear(working, team.id, year) >= MAX_AI_ACADEMY_ROOKIE_PER_TEAM) {
        continue;
      }
      if (!teamAcademyHasRoom(working, team.id)) continue;
      const acyN = countTeamAcademy(working, team.id);
      const needDepth = acyN < AI_ACADEMY_ROOKIE_DEPTH_BELOW;
      if (!faThin && !needDepth) continue;
      if (rng() > chance) continue;
      const lane = shallowestAcademyLane(working, team.id, LANE_ORDER, rng);
      const rook = makeRookie(lane, champions, rng, taken, team.leagueId);
      rook.debutYear = year;
      const res = executeAddAcademyRookie(working, team.id, team.name, rook, year);
      if (!res.ok) continue;
      working = res.inactivePool;
      news.push(...res.news);
    }
    return { inactivePool: working, news };
  }
  function runOffseasonLifecycle(teams, outcomesById, roleMeans, inactivePoolIn, champions, rng, taken, year, gradeGap = GRADE_GAP_THRESHOLD, meta = NEUTRAL_META, opts) {
    return runDemotionPass(
      teams,
      outcomesById,
      roleMeans,
      inactivePoolIn,
      champions,
      rng,
      taken,
      year,
      {
        ageActives: true,
        advancePool: true,
        gradeGap,
        meta,
        competitiveMarket: true,
        openFaMarket: opts?.openFaMarket ?? true,
        ...opts?.skipOpenFaTeamIds ? { skipOpenFaTeamIds: opts.skipOpenFaTeamIds } : {},
        ...opts?.intakeYear != null ? { intakeYear: opts.intakeYear } : {},
        ...opts?.faBidBoost ? { faBidBoost: opts.faBidBoost } : {}
      }
    );
  }

  // lib/season/playerGrades.ts
  function seasonPlayerGrades(season, tournamentIds) {
    const teams = new Map(season.teams.map((team) => [team.id, team]));
    const totals = /* @__PURE__ */ new Map();
    const ids = new Set(tournamentIds ?? season.phases.flatMap((phase) => phase.tournamentIds));
    for (const tid of ids) {
      for (const match of season.tournaments[tid]?.matches ?? []) {
        if (match.isBye || !match.series) continue;
        const blue = teams.get(match.blueTeamId ?? "");
        const red = teams.get(match.redTeamId ?? "");
        for (const game of match.series.games) {
          if (game.status !== "complete" || !game.winner || !game.recap) continue;
          const recap = game.recap;
          const ratings = recap.ratings ?? (recap.perPickKDA ? computeGameRatings(recap, game.winner) : null);
          if (!ratings) continue;
          const swapped = game.blueTeam === red?.name && game.blueTeam !== blue?.name;
          for (const side of ["blue", "red"]) {
            const team = side === "blue" !== swapped ? blue : red;
            const recordedIds = recap.perPickIds?.[side];
            ratings[side].forEach((grade, index) => {
              const player = team?.players[index];
              const names = recap.perPickNames?.[side];
              const legacyId = !names || names[index] && names[index] === player?.name ? player?.id : void 0;
              const id = recordedIds ? recordedIds[index] : legacyId;
              if (!id || !Number.isFinite(grade) || grade <= 0) return;
              const total = totals.get(id) ?? { sum: 0, games: 0 };
              total.sum += grade;
              total.games++;
              totals.set(id, total);
            });
          }
        }
      }
    }
    return new Map([...totals].map(([id, value]) => [id, value.sum / value.games]));
  }

  // lib/season/franchiseAgency.ts
  function agencyTeamInputs(season) {
    return season.teams.map((t) => ({
      id: t.id,
      name: t.name,
      players: t.players,
      leagueId: t.leagueId
    }));
  }
  function agencyGradeOf(season) {
    const grades = seasonPlayerGrades(season);
    return (pid) => grades.get(pid) ?? null;
  }
  function agencyWalkToFa(season, demand) {
    const team = season.teams.find((t) => t.id === demand.fromTeamId);
    if (!team || !season.franchise) return null;
    const slot = team.players.findIndex((p) => p.id === demand.playerId);
    if (slot < 0) return null;
    const player = team.players[slot];
    if (isRosterVacancy(player) || !player.id) return null;
    const year = season.franchise.year;
    const grade = seasonPlayerGrades(season).get(player.id) ?? null;
    const faEntry = {
      player: { ...player, badStreak: 0 },
      status: "free-agent",
      inactiveTenure: { academyYears: 0, freeAgentYears: 0 },
      inactiveYears: ACADEMY_YEARS2 + 1,
      demotedYear: year,
      clockYear: year,
      lastTeamId: team.id,
      lastTeamName: team.name,
      ...grade != null ? { lastActiveGrade: grade, shadowGrade: grade } : {}
    };
    const players = [...team.players];
    players[slot] = makeVacancyPlaceholder(demand.lane);
    const vacated = {
      teamId: team.id,
      lane: demand.lane,
      ...player.name ? { departedName: player.name } : {},
      departedTier: player.tier,
      ...player.age != null ? { departedAge: player.age } : {},
      departedId: player.id
    };
    return {
      season: {
        ...season,
        teams: season.teams.map((t) => t.id === team.id ? { ...t, players } : t),
        franchise: {
          ...season.franchise,
          inactivePool: [...season.franchise.inactivePool ?? [], faEntry],
          sameWindowDemoteIds: [
            ...season.franchise.sameWindowDemoteIds ?? [],
            demand.playerId
          ]
        },
        updatedAt: Date.now()
      },
      vacated
    };
  }
  function agencyLeaveNews(vacated, demand) {
    return {
      teamId: vacated.teamId,
      lane: vacated.lane,
      ...vacated.departedName ? { departedName: vacated.departedName } : {},
      departedTier: vacated.departedTier,
      ...vacated.departedAge != null ? { departedAge: vacated.departedAge } : {},
      departedId: vacated.departedId,
      entrantName: "",
      entrantTier: vacated.departedTier,
      entrantPotential: vacated.departedTier,
      entrantSource: "free-agent",
      marketNote: "agency-leave",
      ...demand.wantTeamName ? { beatenNames: [demand.wantTeamName] } : {}
    };
  }
  function agencyHonorCallUp(season, champions, demand) {
    if (!season.franchise) return null;
    const byId = new Map(champions.map((c) => [c.id, c]));
    const result = executeUserAcademyRecall(
      agencyTeamInputs(season),
      season.franchise.inactivePool ?? [],
      demand.fromTeamId,
      demand.lane,
      demand.playerId,
      byId,
      season.currentMeta,
      season.franchise.year,
      agencyGradeOf(season),
      { requireGap: false }
    );
    if (!result.ok) return null;
    const byTeam = new Map(result.teams.map((t) => [t.id, t.players]));
    return {
      ...season,
      teams: season.teams.map((t) => ({
        ...t,
        players: byTeam.get(t.id) ?? t.players
      })),
      franchise: {
        ...season.franchise,
        inactivePool: result.inactivePool
      },
      rosterNews: [
        ...season.rosterNews ?? [],
        ...withRosterTimeMark(
          result.news.map((n) => ({ ...n, marketNote: "agency-callup" })),
          rosterTimeMarkForSeason(season),
          season,
          season.teams.map((t) => ({ ...t, players: byTeam.get(t.id) ?? t.players })),
          result.inactivePool
        )
      ],
      updatedAt: Date.now()
    };
  }
  function agencyHonorDepart(season, demand) {
    if (!season.franchise) return null;
    const year = season.franchise.year;
    let pool = [...season.franchise.inactivePool ?? []];
    const news = [];
    if (demand.wantTeamId && demand.wantRole === "academy") {
      const idx = pool.findIndex(
        (e) => e.status === "academy" && e.lastTeamId === demand.fromTeamId && e.player.id === demand.playerId
      );
      if (idx >= 0) {
        const entry = pool[idx];
        const dest = season.teams.find((t) => t.id === demand.wantTeamId);
        if (dest && teamAcademyHasRoom(pool, dest.id)) {
          pool.splice(idx, 1);
          pool = addToTeamAcademy(pool, {
            ...entry,
            status: "academy",
            inactiveYears: 1,
            clockYear: year,
            lastTeamId: dest.id,
            lastTeamName: dest.name
          }).pool;
          news.push({
            teamId: dest.id,
            lane: demand.lane,
            entrantName: entry.player.name ?? "",
            entrantTier: entry.player.tier,
            entrantPotential: entry.player.potential ?? entry.player.tier,
            ...entry.player.id ? { entrantId: entry.player.id } : {},
            entrantSource: "academy",
            marketNote: "agency-depart",
            fromTeamId: demand.fromTeamId,
            ...demand.fromTeamName ? { beatenNames: [demand.fromTeamName] } : {}
          });
          return {
            ...season,
            franchise: { ...season.franchise, inactivePool: pool },
            rosterNews: [
              ...season.rosterNews ?? [],
              ...withRosterTimeMark(news, rosterTimeMarkForSeason(season), season, season.teams, pool)
            ],
            updatedAt: Date.now()
          };
        }
      }
    }
    const released = releaseAcademyToFa(
      pool,
      demand.fromTeamId,
      demand.playerId,
      year
    );
    if (!released.released) return null;
    news.push({
      ...makeBecameFaNews(released.released, "academy-release"),
      marketNote: "agency-depart"
    });
    return {
      ...season,
      franchise: { ...season.franchise, inactivePool: released.pool },
      rosterNews: [
        ...season.rosterNews ?? [],
        ...withRosterTimeMark(news, rosterTimeMarkForSeason(season), season, season.teams, released.pool)
      ],
      updatedAt: Date.now()
    };
  }
  function honorAgencyDemand(season, champions, demandId, rng = Math.random) {
    if (!season.franchise?.aging) return null;
    const demand = season.franchise.agencyDemands?.find(
      (d) => d.id === demandId && d.status === "pending"
    );
    if (!demand) return null;
    let next = null;
    if (demand.kind === "leave") {
      const walked = agencyWalkToFa(season, demand);
      if (!walked) return null;
      const controlled = season.config.controlledTeamId;
      const userShopping = !!controlled && demand.fromTeamId === controlled;
      if (userShopping) {
        next = {
          ...walked.season,
          rosterNews: [
            ...walked.season.rosterNews ?? [],
            ...withRosterTimeMark(
              [agencyLeaveNews(walked.vacated, demand)],
              rosterTimeMarkForSeason(season),
              season,
              walked.season.teams,
              walked.season.franchise?.inactivePool
            )
          ]
        };
      } else {
        const departedBySlot = /* @__PURE__ */ new Map([
          [
            `${walked.vacated.teamId}:${walked.vacated.lane}`,
            {
              ...walked.vacated.departedName ? { departedName: walked.vacated.departedName } : {},
              departedTier: walked.vacated.departedTier,
              ...walked.vacated.departedAge != null ? { departedAge: walked.vacated.departedAge } : {},
              departedId: walked.vacated.departedId
            }
          ]
        ]);
        const withLeave = {
          ...walked.season,
          rosterNews: [
            ...walked.season.rosterNews ?? [],
            ...withRosterTimeMark(
              [agencyLeaveNews(walked.vacated, demand)],
              rosterTimeMarkForSeason(season),
              season,
              walked.season.teams,
              walked.season.franchise?.inactivePool
            )
          ]
        };
        next = fillRosterVacancies(withLeave, champions, rng, {
          teamIds: /* @__PURE__ */ new Set([walked.vacated.teamId]),
          departedBySlot
        });
      }
    } else if (demand.kind === "call-up") {
      next = agencyHonorCallUp(season, champions, demand);
    } else if (demand.kind === "depart-academy") {
      next = agencyHonorDepart(season, demand);
    }
    if (!next?.franchise) return null;
    return {
      ...next,
      franchise: {
        ...next.franchise,
        agencyDemands: honorDemand(next.franchise.agencyDemands ?? [], demandId)
      }
    };
  }
  function seedAgencyWindow(season, champions, rng = Math.random, window = "transfer") {
    if (!season.franchise?.aging || champions.length === 0) return season;
    const byId = new Map(champions.map((c) => [c.id, c]));
    const controlled = season.config.controlledTeamId ?? null;
    const demands = generateAgencyDemands(
      agencyTeamInputs(season),
      season.franchise.inactivePool ?? [],
      byId,
      season.currentMeta,
      rng,
      {
        window,
        controlledTeamId: controlled,
        gradeOf: agencyGradeOf(season)
      }
    );
    let next = {
      ...season,
      franchise: {
        ...season.franchise,
        agencyDemands: demands
      },
      updatedAt: Date.now()
    };
    for (const d of demands) {
      if (d.status !== "pending") continue;
      if (controlled && d.fromTeamId === controlled) continue;
      const honored = honorAgencyDemand(next, champions, d.id, rng);
      if (honored) next = honored;
    }
    next = fillRosterVacancies(next, champions, rng, {
      ...controlled ? { skipTeamIds: /* @__PURE__ */ new Set([controlled]) } : {}
    });
    return next;
  }

  // lib/season/stats.ts
  function computePlayerTitleCounts(season) {
    const achv = /* @__PURE__ */ new Map();
    const ensure = (id) => {
      let a = achv.get(id);
      if (!a) {
        a = { split: 0, intlTitles: 0, intlApps: 0 };
        achv.set(id, a);
      }
      return a;
    };
    const snaps = season.phaseRosters ?? [];
    const playersOnTeam = (teamId, match) => {
      const snap = snaps.find(match);
      const roster = snap ? snap.teams.find((t) => t.teamId === teamId)?.players : snaps.length > 0 ? void 0 : season.teams.find((t) => t.id === teamId)?.players;
      return (roster ?? []).map((p) => p.id).filter((x) => !!x);
    };
    for (const [split, byLeague] of Object.entries(season.splitResults)) {
      for (const order of Object.values(byLeague ?? {})) {
        const champ = order?.[0];
        if (champ)
          for (const pid of playersOnTeam(champ, (s) => s.split === split)) ensure(pid).split += 1;
      }
    }
    for (const [event, order] of Object.entries(season.intlResults)) {
      const champ = order?.[0];
      if (champ)
        for (const pid of playersOnTeam(champ, (s) => s.event === event)) ensure(pid).intlTitles += 1;
    }
    for (const phase of season.phases) {
      if (phase.kind !== "international") continue;
      const attended = /* @__PURE__ */ new Set();
      for (const tid of phase.tournamentIds) {
        for (const tt of season.tournaments[tid]?.teams ?? []) attended.add(tt.id);
      }
      for (const id of attended)
        for (const pid of playersOnTeam(id, (s) => s.event === phase.event)) ensure(pid).intlApps += 1;
    }
    return achv;
  }

  // lib/season/franchise.ts
  var SHORT_SPLIT_MARK = {
    winter: "Winter",
    spring: "Spring",
    summer: "Summer"
  };
  function rosterTimeMarkForSeason(season, opts) {
    if (opts?.split) return SHORT_SPLIT_MARK[opts.split];
    if (season.status === "complete") return "Offseason";
    const phase = season.phases[season.phaseIndex];
    if (phase?.kind === "transfer" && phase.event) {
      if (phase.event === "first-stand") return "First Stand window";
      if (phase.event === "msi") return "MSI window";
      return `${INTERNATIONAL_LABELS[phase.event]} window`;
    }
    if (phase?.kind === "split" && phase.split) return SHORT_SPLIT_MARK[phase.split];
    return phase?.label ?? "\u2014";
  }
  function buildSeasonOutcomes(season) {
    const titles = computePlayerTitleCounts(season);
    const grades = seasonPlayerGrades(season);
    const outcomes = /* @__PURE__ */ new Map();
    for (const t of season.teams) {
      t.players.forEach((p) => {
        if (!p.id) return;
        const a = titles.get(p.id) ?? { split: 0, intlTitles: 0, intlApps: 0 };
        outcomes.set(p.id, {
          playerId: p.id,
          grade: grades.get(p.id) ?? null,
          tier: p.tier,
          lane: p.lane,
          splitTitles: a.split,
          intlTitles: a.intlTitles
        });
      });
    }
    return { outcomes, roleMeans: computeRoleMeans(outcomes.values()) };
  }
  function buildSplitCheckpointOutcomes(season, split) {
    const phase = season.phases.find((p) => p.kind === "split" && p.split === split);
    const tidSet = phase?.tournamentIds ?? [];
    const grades = seasonPlayerGrades(season, tidSet);
    const intlCredit = split === "spring" ? "first-stand" : split === "summer" ? "msi" : null;
    const splitSnap = season.phaseRosters?.find((s) => s.split === split);
    const outcomes = /* @__PURE__ */ new Map();
    for (const t of season.teams) {
      const champId = season.splitResults[split]?.[t.leagueId]?.[0];
      const wonSplit = champId === t.id;
      const splitWinnerIds = wonSplit ? splitSnap?.teams.find((x) => x.teamId === t.id)?.players : void 0;
      t.players.forEach((p) => {
        if (!p.id) return;
        let intlTitles = 0;
        if (intlCredit) {
          const champId2 = season.intlResults[intlCredit]?.[0];
          if (champId2) {
            const snap = season.phaseRosters?.find((s) => s.event === intlCredit);
            const onChamp = snap?.teams.find((x) => x.teamId === champId2)?.players.some((rp) => rp.id === p.id);
            const fallback = !snap && !!season.teams.find((x) => x.id === champId2)?.players.some((rp) => rp.id === p.id);
            if (onChamp || fallback) intlTitles = 1;
          }
        }
        const wonIt = wonSplit && (splitWinnerIds ? splitWinnerIds.some((rp) => rp.id === p.id) : !splitSnap);
        outcomes.set(p.id, {
          playerId: p.id,
          grade: grades.get(p.id) ?? null,
          tier: p.tier,
          lane: p.lane,
          splitTitles: wonIt ? 1 : 0,
          intlTitles
        });
      });
    }
    return { outcomes, roleMeans: computeRoleMeans(outcomes.values()) };
  }
  function reservedRealityNames(season) {
    const taken = new Set(season.franchise?.usedNames ?? []);
    for (const team of season.teams) {
      for (const player of team.players) if (player.name) taken.add(player.name);
      if (team.coach?.name) taken.add(team.coach.name);
    }
    for (const entry of season.franchise?.inactivePool ?? []) {
      if (entry.player.name) taken.add(entry.player.name);
    }
    return taken;
  }
  function applyMidSplitDemotions(season, split, champions, rng = Math.random, checkpoint) {
    if (!season.franchise?.aging) return season;
    const taken = reservedRealityNames(season);
    for (const t of season.teams) {
      for (const p of t.players) if (p.name) taken.add(p.name);
      if (t.coach?.name) taken.add(t.coach.name);
    }
    const { outcomes, roleMeans } = checkpoint?.source === season && checkpoint.split === split ? checkpoint.evaluation : buildSplitCheckpointOutcomes(season, split);
    const skipFollowed = season.franchise.pendingMidSplitDemotion && season.config.controlledTeamId ? /* @__PURE__ */ new Set([season.config.controlledTeamId]) : void 0;
    const result = runDemotionPass(
      season.teams.map((t) => ({
        id: t.id,
        name: t.name,
        players: t.players,
        leagueId: t.leagueId
      })),
      outcomes,
      roleMeans,
      season.franchise.inactivePool ?? [],
      champions,
      rng,
      taken,
      season.franchise.year,
      {
        ageActives: false,
        advancePool: false,
        meta: season.currentMeta,
        competitiveMarket: false,
        // Sparse FA→main mid-season; academy stash (maintenance) is the bulk path.
        openFaMarket: true,
        openFaAttemptChance: AI_OPEN_FA_CHANCE_MID_SPLIT,
        academyMaintenance: true,
        ...skipFollowed ? { skipOpenFaTeamIds: skipFollowed } : {}
      }
    );
    const byId = new Map(result.teams.map((t) => [t.id, t.players]));
    const teams = season.teams.map((t) => ({
      ...t,
      players: byId.get(t.id) ?? t.players
    }));
    const usedNames = new Set(taken);
    for (const t of teams) {
      for (const p of t.players) if (p.name) usedNames.add(p.name);
    }
    for (const entry of result.inactivePool) {
      if (entry.player.name) usedNames.add(entry.player.name);
    }
    const mark = season.franchise.pendingMidSplitDemotion ? rosterTimeMarkForSeason(season) : rosterTimeMarkForSeason(season, { split });
    const rosterNews = [
      ...season.rosterNews ?? [],
      ...withRosterTimeMark(result.news, mark, season, teams, result.inactivePool)
    ];
    return {
      ...season,
      teams,
      franchise: {
        ...season.franchise,
        usedNames: [...usedNames],
        inactivePool: result.inactivePool
      },
      ...rosterNews.length > 0 ? { rosterNews } : {},
      updatedAt: Date.now()
    };
  }
  function resolveOffseasonPlayerMarket(prev, champions, rng = Math.random) {
    const playerGrades = seasonPlayerGrades(prev);
    const previousTeams = new Map(prev.teams.map((team) => [team.id, team]));
    const gradesOf = (teamId) => {
      return previousTeams.get(teamId)?.players.map((player) => player.id ? playerGrades.get(player.id) ?? null : null) ?? [];
    };
    const aging = prev.franchise?.aging ?? false;
    const closingYear = prev.franchise?.year ?? 1;
    const nextYear = closingYear + 1;
    let working = initializeOffseasonRosterNewsBoundary(prev);
    const usedNames = reservedRealityNames(prev);
    let evolvedTeams = working.teams;
    let rosterNews = [...currentOffseasonRosterNews(working)];
    let nextInactivePool = working.franchise?.inactivePool ?? [];
    if (aging) {
      if (working.franchise?.agencyDemands?.length) {
        working = {
          ...working,
          franchise: {
            ...working.franchise,
            agencyDemands: expirePendingDemands(working.franchise.agencyDemands)
          }
        };
      }
      working = fillRosterVacancies(working, champions, rng);
      rosterNews = [...currentOffseasonRosterNews(working)];
      const taken = usedNames;
      for (const name of reservedRealityNames(working)) taken.add(name);
      for (const t of working.teams) {
        for (const p of t.players) if (p.name) taken.add(p.name);
        if (t.coach?.name) taken.add(t.coach.name);
      }
      const { outcomes, roleMeans } = buildSeasonOutcomes(working);
      const champById = new Map(champions.map((c) => [c.id, c]));
      const result = runOffseasonLifecycle(
        working.teams.map((t) => ({
          id: t.id,
          name: t.name,
          players: t.players,
          leagueId: t.leagueId
        })),
        outcomes,
        roleMeans,
        working.franchise?.inactivePool ?? [],
        champions,
        rng,
        taken,
        closingYear,
        GRADE_GAP_THRESHOLD,
        working.currentMeta,
        {
          intakeYear: nextYear,
          ...working.config.controlledTeamId ? { skipOpenFaTeamIds: /* @__PURE__ */ new Set([working.config.controlledTeamId]) } : {},
          faBidBoost: (fa, vacancy) => {
            const team = working.teams.find((t) => t.id === vacancy.teamId);
            if (!team) return 0;
            const value = inactiveTransferValue(fa, champById, working.currentMeta);
            return agencyFaBidBoost(
              fa.player,
              value,
              {
                id: team.id,
                name: team.name,
                players: team.players,
                leagueId: team.leagueId
              },
              working.config.controlledTeamId
            );
          }
        }
      );
      const byId2 = new Map(result.teams.map((t) => [t.id, t.players]));
      evolvedTeams = working.teams.map((t) => ({
        ...t,
        players: byId2.get(t.id) ?? t.players
      }));
      nextInactivePool = result.inactivePool;
      rosterNews.push(...withRosterTimeMark(result.news, "Offseason", working, evolvedTeams, result.inactivePool));
    }
    evolvedTeams = evolvedTeams.map((t) => {
      const players = t.players.map((p) => {
        if (!p.homeRegion) return { ...p, homeRegion: t.leagueId, acclimation: 1 };
        const acc = p.acclimation ?? 1;
        return acc < 1 ? { ...p, acclimation: Math.min(1, acc + 0.34) } : p;
      });
      return { ...t, players: driftSynergiesOverTime(assignSynergies(players, t.name)) };
    });
    const byId = new Map(champions.map((c) => [c.id, c]));
    const userMoves = transfersForHistoryArchive(prev).filter((move) => move.event === "worlds");
    const movedKey = /* @__PURE__ */ new Set();
    for (const m of userMoves) {
      movedKey.add(`${m.fromTeamId}:${m.lane}`);
      movedKey.add(`${m.toTeamId}:${m.lane}`);
    }
    const LANES = ["top", "jungle", "middle", "bottom", "support"];
    let offseasonMoves = [...userMoves];
    if (prev.config.playerTransfers) {
      const { teams: shuffledTeams, moves: autoMoves } = offseasonTransferPass(
        evolvedTeams,
        // Grades are keyed to last year's slot occupant; a lifecycle newcomer
        // must not inherit the demoted starter's note.
        (teamId, li) => {
          const now = evolvedTeams.find((t) => t.id === teamId)?.players[li]?.id;
          const then = prev.teams.find((t) => t.id === teamId)?.players[li]?.id;
          return now && now === then ? gradesOf(teamId)[li] ?? null : null;
        },
        byId,
        prev.currentMeta,
        prev.config.controlledTeamId,
        (teamId, li) => movedKey.has(`${teamId}:${LANES[li]}`),
        userMoves,
        nextInactivePool
      );
      evolvedTeams = shuffledTeams;
      offseasonMoves = [...userMoves, ...autoMoves.map((move) => ({ ...move, origin: marketOrigin(prev, "worlds") }))];
    }
    return { working, usedNames, evolvedTeams, rosterNews, nextInactivePool, offseasonMoves };
  }
  function fillRosterVacancies(season, champions, rng = Math.random, opts) {
    if (!season.franchise?.aging || champions.length === 0) return season;
    const exclude = new Set(season.franchise.sameWindowDemoteIds ?? []);
    const byId = new Map(champions.map((c) => [c.id, c]));
    const meta = season.currentMeta;
    const year = season.franchise.year;
    const healed = reconcileRosterPoolDuplicates(
      season.teams.map((t) => ({ id: t.id, players: [...t.players] })),
      (season.franchise.inactivePool ?? []).filter((e) => !isRosterVacancy(e.player))
    );
    let pool = healed.inactivePool;
    const taken = reservedRealityNames(season);
    for (const t of healed.teams) {
      for (const p of t.players) if (p.name) taken.add(p.name);
    }
    for (const t of season.teams) {
      if (t.coach?.name) taken.add(t.coach.name);
    }
    for (const e of pool) {
      if (e.player.name) taken.add(e.player.name);
    }
    const teams = season.teams.map((t) => {
      const row = healed.teams.find((x) => x.id === t.id);
      return { ...t, players: row?.players ?? [...t.players] };
    });
    const news = [];
    const sameWindowRookieIds = [...season.franchise.sameWindowRookieIds ?? []];
    let touched = false;
    for (const team of teams) {
      if (opts?.teamIds && !opts.teamIds.has(team.id)) continue;
      if (opts?.skipTeamIds?.has(team.id)) continue;
      for (let i = 0; i < team.players.length; i++) {
        const p = team.players[i];
        if (!isRosterVacancy(p)) continue;
        touched = true;
        const lane = p.lane;
        const pick = pickScoredReturnee(pool, lane, team.id, byId, meta, rng, exclude);
        let entrant;
        let source;
        let passedAcademyName;
        let marketNote;
        if (pick) {
          const [takenEntry] = pool.splice(pick.idx, 1);
          entrant = applyComebackRust(
            takenEntry.player,
            takenEntry.inactiveYears,
            team.leagueId
          );
          source = takenEntry.status === "academy" ? "academy" : "free-agent";
          passedAcademyName = pick.passedAcademyName;
          marketNote = pick.marketNote;
          if (entrant.name) taken.add(entrant.name);
        } else {
          entrant = makeRookie(lane, champions, rng, taken, team.leagueId);
          entrant.debutYear = year;
          if (teamAcademyHasRoom(pool, team.id)) {
            const parked = executeAddAcademyRookie(
              pool,
              team.id,
              team.name,
              entrant,
              year
            );
            if (parked.ok) {
              pool = parked.inactivePool.filter((e) => e.player.id !== entrant.id);
              source = "academy";
              marketNote = "academy-rookie";
            } else {
              source = "rookie";
              marketNote = "rookie-gate";
            }
          } else {
            source = "rookie";
            marketNote = "rookie-gate";
          }
          if (entrant.id) sameWindowRookieIds.push(entrant.id);
        }
        team.players[i] = entrant;
        const departed = opts?.departedBySlot?.get(`${team.id}:${lane}`);
        const fillRow = {
          teamId: team.id,
          lane,
          ...departed?.departedName ? { departedName: departed.departedName } : {},
          ...departed?.departedTier ? { departedTier: departed.departedTier } : {},
          ...departed?.departedAge != null ? { departedAge: departed.departedAge } : {},
          ...departed?.departedId ? { departedId: departed.departedId } : {},
          entrantName: entrant.name ?? "",
          entrantTier: entrant.tier,
          entrantPotential: entrant.potential ?? entrant.tier,
          ...entrant.id ? { entrantId: entrant.id } : {},
          entrantSource: source,
          ...passedAcademyName ? { passedAcademyName } : {},
          ...marketNote ? { marketNote } : {}
        };
        if (isSamePlayerReplaceNoise(fillRow)) continue;
        news.push(fillRow);
      }
    }
    const poolScrubbed = pool.length !== (season.franchise.inactivePool ?? []).length;
    if (!touched && !poolScrubbed) return season;
    const usedNames = new Set(taken);
    for (const t of teams) for (const p of t.players) if (p.name) usedNames.add(p.name);
    const filledKeys = new Set(news.map((n) => `${n.teamId}:${n.lane}`));
    const leaveDeparted = /* @__PURE__ */ new Map();
    const priorNews = [];
    const leaveRows = /* @__PURE__ */ new Map();
    const churnKeys = /* @__PURE__ */ new Set();
    for (const [newsIndex, n] of (season.rosterNews ?? []).entries()) {
      const key = `${n.teamId}:${n.lane}`;
      if ((season.status !== "complete" || newsIndex >= (season.offseasonRosterNewsBaseline ?? 0)) && n.marketNote === "agency-leave" && n.timeMark === rosterTimeMarkForSeason(season) && !n.entrantName && filledKeys.has(key)) {
        leaveDeparted.set(key, {
          ...n.departedName ? { departedName: n.departedName } : {},
          ...n.departedTier ? { departedTier: n.departedTier } : {},
          ...n.departedAge != null ? { departedAge: n.departedAge } : {},
          ...n.departedId ? { departedId: n.departedId } : {}
        });
        leaveRows.set(key, n);
      }
      priorNews.push(n);
    }
    const mergedNews = news.map((n) => {
      const key = `${n.teamId}:${n.lane}`;
      const d = leaveDeparted.get(key);
      if (!d) return n;
      if (d.departedId && n.entrantId && d.departedId === n.entrantId) {
        churnKeys.add(key);
        return null;
      }
      const merged = {
        ...n,
        ...d.departedName && !n.departedName ? { departedName: d.departedName } : {},
        ...d.departedTier && !n.departedTier ? { departedTier: d.departedTier } : {},
        ...d.departedAge != null && n.departedAge == null ? { departedAge: d.departedAge } : {},
        ...d.departedId && !n.departedId ? { departedId: d.departedId } : {}
      };
      if (isSamePlayerReplaceNoise(merged)) return null;
      return merged;
    }).filter((n) => n != null);
    return {
      ...season,
      teams,
      franchise: {
        ...season.franchise,
        inactivePool: pool,
        usedNames: [...usedNames],
        sameWindowRookieIds
      },
      rosterNews: [
        ...priorNews.filter((n) => ![...churnKeys].some((key) => leaveRows.get(key) === n)),
        ...withRosterTimeMark(mergedNews, rosterTimeMarkForSeason(season), season, teams, pool)
      ],
      updatedAt: Date.now()
    };
  }

  // lib/season/rosterOutlookView.ts
  var OUTLOOK_SAMPLES = 160;
  var OUTLOOK_LABELS = {
    stay: "Stay",
    transfer: "Other team",
    academy: "To academy",
    main: "To main roster",
    "free-agent": "Become FA",
    retired: "Retire",
    unknown: "Unknown"
  };
  function outlookPercent(count, samples) {
    if (count === 0 || samples === 0) return "0%";
    if (count === samples) return "100%";
    const rounded = Math.round(100 * count / samples);
    return rounded === 0 ? "<1%" : rounded === 100 ? ">99%" : `${rounded}%`;
  }
  function nextRosterWindow(season) {
    const aging = !!season.franchise?.aging;
    const transfers = !!season.config.playerTransfers;
    if (!aging && !transfers) return { kind: "none", opening: false, label: "Automatic roster moves are disabled" };
    if (season.status === "complete") {
      return season.franchise ? { kind: "offseason", opening: false, label: "Current offseason \xB7 remaining decisions" } : { kind: "none", opening: false, label: "Season complete \xB7 no franchise offseason" };
    }
    for (let i = season.phaseIndex; i < season.phases.length; i++) {
      const phase = season.phases[i];
      if (phase.status === "complete") continue;
      if (aging && phase.kind === "split" && phase.split) {
        const deferred = transfers && season.config.controlledTeamId && phase.split !== "summer";
        if (!deferred) return { kind: "split", opening: true, split: phase.split, label: `After ${SPLIT_LABELS[phase.split]}` };
      }
      if (transfers && phase.kind === "transfer" && (phase.event === "first-stand" || phase.event === "msi")) {
        const opening = i !== season.phaseIndex || phase.status === "pending";
        const split = aging && season.config.controlledTeamId ? season.franchise?.pendingMidSplitDemotion ?? (opening ? QUALIFYING_SPLIT[phase.event] : void 0) : void 0;
        return {
          kind: "transfer",
          opening,
          event: phase.event,
          split,
          label: `Post ${INTERNATIONAL_LABELS[phase.event]}${opening ? "" : " \xB7 remaining decisions"}`
        };
      }
    }
    return season.franchise ? { kind: "offseason", opening: true, label: "End-of-year offseason" } : { kind: "none", opening: false, label: "No remaining automatic roster window" };
  }

  // lib/season/rosterOutlook.ts
  function scenarioRng(seed) {
    let state = seed >>> 0;
    return () => {
      state += 1831565813;
      let value = Math.imul(state ^ state >>> 15, 1 | state);
      value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }
  function rosterSeats(season) {
    const seats = /* @__PURE__ */ new Map();
    for (const team of season.teams) for (const player of team.players) {
      if (player.id && !isRosterVacancy(player)) seats.set(player.id, { status: "main", teamId: team.id });
    }
    for (const entry of season.franchise?.inactivePool ?? []) {
      if (!entry.player.id || seats.has(entry.player.id)) continue;
      seats.set(entry.player.id, {
        status: entry.status,
        ...entry.status === "academy" ? { teamId: entry.lastTeamId } : {}
      });
    }
    return seats;
  }
  function classifyOutlook(before, after) {
    if (!after) return "unknown";
    if (before.status === after.status && before.teamId === after.teamId) return "stay";
    if (after.status === "retired" || after.status === "free-agent") return after.status;
    if (before.teamId && after.teamId && before.teamId !== after.teamId) return "transfer";
    return after.status === "academy" ? "academy" : "main";
  }
  function manualPlayers(season) {
    const ids = /* @__PURE__ */ new Set();
    const controlled = season.config.controlledTeamId;
    if (!controlled) return ids;
    if (season.status !== "complete" && season.phases[season.phaseIndex]?.kind !== "transfer") return ids;
    const seats = rosterSeats(season);
    for (const demand of season.franchise?.agencyDemands ?? []) {
      if (demand.status === "pending" && demand.fromTeamId === controlled && seats.get(demand.playerId)?.teamId === controlled) ids.add(demand.playerId);
    }
    const event = season.status === "complete" ? "worlds" : season.phases[season.phaseIndex]?.event;
    for (const proposal of season.proposedTransfers ?? []) {
      if (proposal.controlledTeamId !== controlled || proposal.event !== event || userTransferCapReached(season, proposal.event, controlled) || teamMovedAtLane(season, proposal.event, controlled, proposal.lane)) continue;
      const mine = season.teams.find((team) => team.id === controlled)?.players[proposal.laneIndex];
      const theirs = season.teams.find((team) => team.id === proposal.otherTeamId)?.players[proposal.laneIndex];
      if (!mine || !theirs || isRosterVacancy(mine) || isRosterVacancy(theirs) || proposal.mine.id && mine.id !== proposal.mine.id || proposal.theirs.id && theirs.id !== proposal.theirs.id) continue;
      if (proposal.mine.id) ids.add(proposal.mine.id);
      if (proposal.theirs.id) ids.add(proposal.theirs.id);
    }
    return ids;
  }
  function sampleRosterWindow(season, champions, window, rng, checkpoint) {
    let next = season;
    let manual = manualPlayers(next);
    if (window.kind === "split" && window.split) next = applyMidSplitDemotions(next, window.split, champions, rng, checkpoint);
    if (window.kind === "transfer") {
      if (window.opening) {
        const phaseIndex = next.phases.findIndex((p) => p.kind === "transfer" && p.event === window.event);
        next = {
          ...next,
          phaseIndex: phaseIndex >= 0 ? phaseIndex : next.phaseIndex,
          proposedTransfers: [],
          franchise: next.franchise ? {
            ...next.franchise,
            agencyDemands: [],
            sameWindowDemoteIds: [],
            sameWindowRookieIds: [],
            faSignsThisWindow: 0,
            manualDemotesThisWindow: 0,
            pendingMidSplitDemotion: window.split
          } : void 0
        };
        const intl = next.phases.find((p) => p.kind === "international" && p.event === window.event);
        if (intl) next = applyTransfers(next, champions, intl);
        if (next.config.controlledTeamId) next = seedAgencyWindow(next, champions, rng, "transfer");
        manual = manualPlayers(next);
      }
      if (next.franchise?.aging) {
        next = fillRosterVacancies(next, champions, rng);
        if (window.split) next = applyMidSplitDemotions(next, window.split, champions, rng);
      }
    }
    if (window.kind === "offseason") {
      if (window.opening) {
        const moves = rebucketTransfersByStamp(next.transfersByEvent);
        next = {
          ...next,
          status: "complete",
          transfersByEvent: moves,
          worldsOffseasonBaseline: moves.worlds?.length ?? 0,
          offseasonRosterNewsBaseline: next.rosterNews?.length ?? 0,
          franchise: next.franchise ? {
            ...next.franchise,
            agencyDemands: [],
            sameWindowDemoteIds: [],
            sameWindowRookieIds: [],
            faSignsThisWindow: 0,
            manualDemotesThisWindow: 0
          } : void 0
        };
        next = seedAgencyWindow(next, champions, rng, "offseason");
        manual = manualPlayers(next);
      }
      const result = resolveOffseasonPlayerMarket(next, champions, rng);
      next = {
        ...next,
        teams: result.evolvedTeams,
        franchise: next.franchise ? { ...next.franchise, inactivePool: result.nextInactivePool } : void 0
      };
    }
    return { season: next, manual };
  }
  function* rosterOutlookSteps(season, champions, samples = OUTLOOK_SAMPLES) {
    if (!Number.isInteger(samples) || samples < 1 || samples > 2e3) throw new Error("Invalid forecast sample count");
    const window = nextRosterWindow(season);
    if (window.kind === "none") return { window, samples: 0, rows: [] };
    if (!champions.length) throw new Error("Champion data is not available yet");
    yield { completed: 0, total: samples };
    const seats = rosterSeats(season);
    const teams = new Map(season.teams.map((t) => [t.id, t]));
    const byId = new Map(champions.map((c) => [c.id, c]));
    const evaluation = window.split ? buildSplitCheckpointOutcomes(season, window.split) : buildSeasonOutcomes(season);
    const checkpoint = window.kind === "split" && window.split ? { source: season, split: window.split, evaluation } : void 0;
    const hasDemotionCheckpoint = window.kind === "split" || window.kind === "offseason" || !!window.split;
    const rows = /* @__PURE__ */ new Map();
    const add = (player, grade, value) => {
      if (!player.id || rows.has(player.id)) return;
      const seat = seats.get(player.id);
      if (!seat || seat.status === "retired") return;
      const outcome = evaluation.outcomes.get(player.id);
      const roleMean = seat.status === "main" ? evaluation.roleMeans[player.lane] ?? null : null;
      const region = seat.teamId ? teams.get(seat.teamId)?.leagueId : player.homeRegion;
      rows.set(player.id, {
        id: player.id,
        player,
        seat,
        region,
        grade,
        roleMean,
        value,
        nextStreak: hasDemotionCheckpoint && outcome && season.franchise?.aging ? nextBadStreak(player.badStreak, outcome, roleMean) : null,
        counts: { stay: 0, transfer: 0, academy: 0, main: 0, "free-agent": 0, retired: 0, unknown: 0 },
        manualChoiceCount: 0,
        destinations: [],
        summary: "",
        evidence: []
      });
    };
    for (const team of season.teams) for (const player of team.players) {
      if (isRosterVacancy(player)) continue;
      const grade = player.id ? evaluation.outcomes.get(player.id)?.grade ?? null : null;
      add(player, grade, transferValue(player, grade, byId, season.currentMeta));
    }
    for (const entry of season.franchise?.inactivePool ?? []) {
      add(entry.player, inactiveMarketGrade(entry), inactiveTransferValue(entry, byId, season.currentMeta));
    }
    for (let i = 0; i < samples; i++) {
      const result = sampleRosterWindow(season, champions, window, scenarioRng(1380930388 + i * 7919), checkpoint);
      const finalSeats = rosterSeats(result.season);
      for (const row of rows.values()) {
        const after = finalSeats.get(row.id);
        row.counts[classifyOutlook(row.seat, after)]++;
        if (result.manual.has(row.id)) row.manualChoiceCount++;
        if (after) {
          const existing = row.destinations.find((d) => d.status === after.status && d.teamId === after.teamId);
          if (existing) existing.count++;
          else row.destinations.push({ ...after, count: 1 });
        }
      }
      if ((i + 1) % 8 === 0 || i + 1 === samples) yield { completed: i + 1, total: samples };
    }
    for (const row of rows.values()) {
      row.destinations.sort((a, b) => b.count - a.count);
      const ranked = Object.entries(row.counts).sort((a, b) => b[1] - a[1]);
      const [outcome, count] = ranked[0];
      const tied = ranked.filter(([, value]) => value === count).length > 1;
      row.summary = `${OUTLOOK_LABELS[outcome]}: ${count} of ${samples} scenarios (${outlookPercent(count, samples)}). ${tied ? "Tied for the most frequent final outcome." : "The most frequent final outcome with today's data."}`;
      row.evidence = outlookEvidence(row, window, !!season.franchise?.aging, evaluation.outcomes.get(row.id));
    }
    return { window, samples, rows: [...rows.values()] };
  }
  function outlookEvidence(row, window, aging, outcome) {
    const evidence = [];
    const add = (label, text) => evidence.push({ label, text });
    const period = window.split ? SPLIT_LABELS[window.split] : "Season";
    if (row.seat.status !== "main") {
      add("Market position", row.seat.status === "academy" ? "Stay means remaining in this academy. To main roster means a call-up by this club; Other team includes joining another club's main roster or academy." : "Stay means remaining unsigned. To main roster and To academy are signings; Become FA is not a new outcome for an already unsigned player.");
      if (row.grade != null) add("Estimated form", `${row.grade.toFixed(2)} market grade, based on inactive development and the last recorded grade. This is not an average of new matches.`);
    } else {
      if (row.grade == null || row.roleMean == null) add("Performance", `${period}: no rated performance available for this comparison. Missing games do not count as poor performances.`);
      else {
        const gap = row.roleMean - row.grade;
        add("Performance", `${period} to date: ${row.grade.toFixed(2)} average versus ${row.roleMean.toFixed(2)} for the same role. ${Math.abs(gap).toFixed(2)} points ${gap > 0 ? "below" : "above"} the role mean; the underperformance threshold is ${GRADE_GAP_THRESHOLD.toFixed(2)} below.`);
      }
      if (!aging) add("Demotion check", "Automatic player lifecycle changes are disabled in this season.");
      else if (row.nextStreak == null) add("Demotion check", "This window has no performance-based demotion checkpoint. Transfers and player requests can still affect the final roster.");
      else {
        const detail = outcome?.intlTitles ? "A recorded international title resets the streak." : row.grade == null || row.roleMean == null ? "Without rated evidence, the previous streak is preserved." : row.nextStreak >= UNDERPERFORM_STREAK_TO_DEMOTE ? "The demotion threshold is reached with the current evidence." : row.nextStreak > (row.player.badStreak ?? 0) ? `${UNDERPERFORM_STREAK_TO_DEMOTE - row.nextStreak} more underperforming checkpoint(s) would be needed to reach the demotion threshold.` : outcome?.splitTitles && row.player.tier !== "C" && row.player.tier !== "D" ? "The recorded split title protects a player above C/D tier from this underperformance streak." : "The current evidence does not extend the underperformance streak.";
        add("Demotion check", `Underperformance streak: ${row.player.badStreak ?? 0} \u2192 ${row.nextStreak}/${UNDERPERFORM_STREAK_TO_DEMOTE} checkpoints. ${detail} Year-end tier changes can also affect the final outcome.`);
      }
    }
    add("Market context", `Value with this period's evidence: ${row.value.toFixed(2)}. The scenarios also evaluate available replacements, academy space, preferences and move limits. These inputs are context, not a measured contribution to each percentage.`);
    return evidence;
  }

  // lib/sim/rosterOutlook.worker.ts
  self.onmessage = (event) => {
    try {
      const work = rosterOutlookSteps(event.data.season, event.data.champions);
      let step = work.next();
      while (!step.done) {
        self.postMessage({ progress: step.value });
        step = work.next();
      }
      self.postMessage({ result: step.value });
    } catch (error) {
      self.postMessage({ error: error instanceof Error ? error.message : "Forecast failed" });
    }
  };
})();
