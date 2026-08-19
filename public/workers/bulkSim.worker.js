"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

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

  // lib/draftEngine.ts
  function createGame(gameNumber, blueTeam, redTeam) {
    return {
      id: `game-${gameNumber}-${Date.now()}`,
      gameNumber,
      blueTeam,
      redTeam,
      blueBans: [null, null, null, null, null],
      redBans: [null, null, null, null, null],
      bluePicks: [null, null, null, null, null],
      redPicks: [null, null, null, null, null],
      blueRoles: [null, null, null, null, null],
      redRoles: [null, null, null, null, null],
      actionIndex: 0,
      status: "drafting",
      winner: null
    };
  }
  var POSITIONAL_LANES = [
    "top",
    "jungle",
    "middle",
    "bottom",
    "support"
  ];
  function assignLanesToPicks(picks, champions) {
    const byId = new Map(champions.map((c) => [c.id, c]));
    const available = new Set(POSITIONAL_LANES);
    const assigned = [null, null, null, null, null];
    for (let i = 0; i < picks.length; i++) {
      const id = picks[i];
      if (id == null) continue;
      const champ = byId.get(id);
      if (!champ) continue;
      for (const lane of champ.lanes) {
        if (available.has(lane)) {
          assigned[i] = lane;
          available.delete(lane);
          break;
        }
      }
    }
    const remaining = POSITIONAL_LANES.filter((l) => available.has(l));
    for (let i = 0; i < assigned.length; i++) {
      if (assigned[i] != null || picks[i] == null) continue;
      const next = remaining.shift();
      if (next) assigned[i] = next;
    }
    return assigned;
  }
  function reorderPicksByPosition(picks, champions) {
    const assigned = assignLanesToPicks(picks, champions);
    const byLane = {};
    for (let i = 0; i < picks.length; i++) {
      const lane = assigned[i];
      if (lane && picks[i] != null) byLane[lane] = picks[i];
    }
    return POSITIONAL_LANES.map((l) => byLane[l] ?? null);
  }
  function currentAction(game) {
    if (game.actionIndex >= TOTAL_ACTIONS) return null;
    return DRAFT_ORDER[game.actionIndex];
  }
  function usedChampionsInGame(game) {
    const set = /* @__PURE__ */ new Set();
    for (const id of [
      ...game.blueBans,
      ...game.redBans,
      ...game.bluePicks,
      ...game.redPicks
    ]) {
      if (id != null) set.add(id);
    }
    return set;
  }
  function applyLock(game, championId) {
    const action = currentAction(game);
    if (!action) return game;
    const next = {
      ...game,
      blueBans: [...game.blueBans],
      redBans: [...game.redBans],
      bluePicks: [...game.bluePicks],
      redPicks: [...game.redPicks],
      actionIndex: game.actionIndex + 1
    };
    if (action.kind === "ban") {
      if (action.side === "blue") next.blueBans[action.slot] = championId;
      else next.redBans[action.slot] = championId;
    } else {
      if (action.side === "blue") next.bluePicks[action.slot] = championId;
      else next.redPicks[action.slot] = championId;
    }
    if (next.actionIndex >= TOTAL_ACTIONS) {
      next.status = "complete";
    }
    return next;
  }
  function applyTimeout(game, allChampionIds2, fearlessLocked) {
    const action = currentAction(game);
    if (!action) return game;
    if (action.kind === "ban") {
      const next = {
        ...game,
        actionIndex: game.actionIndex + 1
      };
      if (next.actionIndex >= TOTAL_ACTIONS) {
        next.status = "complete";
      }
      return next;
    }
    const used = usedChampionsInGame(game);
    const pool = allChampionIds2.filter(
      (id) => !used.has(id) && !fearlessLocked.has(id)
    );
    if (pool.length === 0) return game;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return applyLock(game, pick);
  }

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
  function getChampionMeta(alias) {
    return CHAMPION_META[alias] ?? null;
  }
  var _activeOverride = null;
  var _metaEnabled = true;
  function getMetaEnabled() {
    return _metaEnabled;
  }
  function getMetaTier(alias, lane) {
    if (!_metaEnabled) return null;
    if (_activeOverride) {
      const overrideTiers = _activeOverride[alias];
      if (overrideTiers !== void 0) {
        return overrideTiers[lane] ?? null;
      }
    }
    const meta = CHAMPION_META[alias];
    if (!meta) return null;
    return meta.metaTiers[lane] ?? null;
  }
  function getMetaTiers(alias) {
    if (_activeOverride) {
      const override = _activeOverride[alias];
      if (override !== void 0) return { ...override };
    }
    return CHAMPION_META[alias]?.metaTiers ?? {};
  }
  var ALL_LANES = [
    "top",
    "jungle",
    "middle",
    "bottom",
    "support"
  ];
  function tierForValue(value) {
    const clamped = Math.max(TIER_VALUE.D, Math.min(TIER_VALUE["S+"], value));
    return TIER_ORDER[TIER_VALUE["S+"] - clamped];
  }
  function getEffectiveTier(alias, lane, playableLanes) {
    const explicit = getMetaTier(alias, lane);
    if (explicit) return explicit;
    if (!_metaEnabled) return null;
    const known = [];
    for (const l of ALL_LANES) {
      if (l === lane) continue;
      const t = getMetaTier(alias, l);
      if (t) known.push(TIER_VALUE[t]);
    }
    if (known.length === 0) return null;
    if (playableLanes && !playableLanes.includes(lane)) return "D";
    known.sort((a, b) => a - b);
    const mid = known.length % 2 === 1 ? known[(known.length - 1) / 2] : (known[known.length / 2 - 1] + known[known.length / 2]) / 2;
    return tierForValue(Math.floor(mid) - 1);
  }
  var VALID_TIERS = new Set(TIER_ORDER);
  var CHAMPION_SYNERGIES = championSynergies_default;
  var _activeSynergyOverride = null;
  var _synergyOverrideVersion = 0;
  var BASELINE_SYNERGY_LOOKUP = (() => {
    const map = /* @__PURE__ */ new Map();
    for (const s of CHAMPION_SYNERGIES) {
      const [a, b] = s.champs;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      map.set(key, s);
    }
    return map;
  })();
  var _cachedSynergyLookup = BASELINE_SYNERGY_LOOKUP;
  var _cachedSynergyVersion = 0;
  function activeSynergyLookup() {
    if (!_activeSynergyOverride) return BASELINE_SYNERGY_LOOKUP;
    if (_cachedSynergyVersion === _synergyOverrideVersion)
      return _cachedSynergyLookup;
    const map = /* @__PURE__ */ new Map();
    for (const s of _activeSynergyOverride) {
      const [a, b] = s.champs;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      map.set(key, s);
    }
    _cachedSynergyLookup = map;
    _cachedSynergyVersion = _synergyOverrideVersion;
    return map;
  }
  function getSynergy(aliasA, aliasB) {
    const key = aliasA < aliasB ? `${aliasA}|${aliasB}` : `${aliasB}|${aliasA}`;
    return activeSynergyLookup().get(key) ?? null;
  }
  var _activeCounterOverride = null;
  var _counterOverrideVersion = 0;
  function getActiveCounterOverride() {
    return _activeCounterOverride;
  }
  function getCounterOverrideVersion() {
    return _counterOverrideVersion;
  }

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
  var SECONDARY_COMFORT = 0.5;
  function clamp(n2, lo, hi) {
    return Math.max(lo, Math.min(hi, n2));
  }
  function deriveStar(roster) {
    if (!roster || roster.length === 0) return 3;
    const mean = roster.reduce((sum, p) => sum + PLAYER_TIER_VALUE[p.tier], 0) / roster.length;
    return clamp(Math.round(3 + mean), 1, 5);
  }
  function playableInLane(champ, lane) {
    if (champ.lanes.includes(lane)) return true;
    return getMetaTiers(champ.alias)[lane] != null;
  }
  function playerForLane(roster, lane) {
    if (!roster || lane == null) return null;
    return roster.find((p) => p.lane === lane) ?? null;
  }
  function poolBias(player, championId) {
    if (!player || championId == null) return 0;
    const gi = player.goodChamps.indexOf(championId);
    if (gi >= 0) return gi < MAIN_POOL ? 1 : SECONDARY_COMFORT;
    if (player.badChamps.includes(championId)) return -1;
    return 0;
  }
  var PLAYER_SKILL_WEIGHT = {
    "S+": 1,
    S: 1,
    A: 0.75,
    B: 0.5,
    C: 0.3,
    D: 0.15
  };
  function rosterComfortWeight(roster, championId) {
    if (!roster || championId == null) return 0;
    let best = 0;
    for (const p of roster) {
      const gi = p.goodChamps.indexOf(championId);
      if (gi >= 0) {
        const tierFactor = gi < MAIN_POOL ? 1 : SECONDARY_COMFORT;
        const w = PLAYER_SKILL_WEIGHT[p.tier] * tierFactor;
        if (w > best) best = w;
      }
    }
    return best;
  }
  function rosterDiscomfortWeight(roster, championId) {
    if (!roster || championId == null) return 0;
    let best = 0;
    for (const p of roster) {
      if (p.badChamps.includes(championId)) {
        const w = PLAYER_SKILL_WEIGHT[p.tier];
        if (w > best) best = w;
      }
    }
    return best;
  }

  // lib/draftAI/roleAssign.ts
  var POOL_W = 1.5;
  var OFFROLE_PENALTY = 100;
  function laneScore(champ, laneIdx, roster) {
    const lane = POSITIONAL_LANES[laneIdx];
    const tier = getMetaTier(champ.alias, lane);
    let score = tier ? TIER_VALUE[tier] : 0;
    score += poolBias(playerForLane(roster, lane), champ.id) * POOL_W;
    if (!playableInLane(champ, lane)) score -= OFFROLE_PENALTY;
    return score;
  }
  function forEachPermutation(arr, visit) {
    const n2 = arr.length;
    const used = new Array(n2).fill(false);
    const cur = [];
    const rec = () => {
      if (cur.length === n2) {
        visit(cur);
        return;
      }
      for (let i = 0; i < n2; i++) {
        if (used[i]) continue;
        used[i] = true;
        cur.push(arr[i]);
        rec();
        cur.pop();
        used[i] = false;
      }
    };
    rec();
  }
  function optimizeRoleAssignment(picks, champions, roster) {
    const ids = picks.filter((id) => id != null);
    if (ids.length !== POSITIONAL_LANES.length) {
      return reorderPicksByPosition(picks, champions);
    }
    const byId = new Map(champions.map((c) => [c.id, c]));
    const champs = ids.map((id) => byId.get(id)).filter((c) => c != null);
    if (champs.length !== POSITIONAL_LANES.length) {
      return reorderPicksByPosition(picks, champions);
    }
    let best = null;
    let bestScore = -Infinity;
    forEachPermutation(champs, (perm) => {
      let total = 0;
      for (let i = 0; i < perm.length; i++) total += laneScore(perm[i], i, roster);
      if (total > bestScore) {
        bestScore = total;
        best = perm.slice();
      }
    });
    if (!best) return reorderPicksByPosition(picks, champions);
    return best.map((c) => c.id);
  }

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
  var CHEM_SAME_REGION = 0.25;
  var CHEM_DUO = 0.25;
  function clamp2(n2, lo, hi) {
    return Math.max(lo, Math.min(hi, n2));
  }
  function settle(a, b) {
    return Math.min(a.acclimation ?? 1, b.acclimation ?? 1);
  }
  function isBotDuo(a, b) {
    return a === "bottom" && b === "support" || a === "support" && b === "bottom";
  }
  function storedPairSynergy(a, b) {
    const fromA = a.id != null && b.id != null ? a.synergy?.[b.id] : void 0;
    if (typeof fromA === "number") return fromA;
    const fromB = a.id != null && b.id != null ? b.synergy?.[a.id] : void 0;
    return typeof fromB === "number" ? fromB : 0;
  }
  function pairChemistry(a, b) {
    let c = storedPairSynergy(a, b);
    if (a.homeRegion && b.homeRegion && a.homeRegion === b.homeRegion) {
      c += CHEM_SAME_REGION * settle(a, b);
    }
    if (isBotDuo(a.lane, b.lane)) c += CHEM_DUO * settle(a, b);
    return c;
  }
  function playerChemistry(roster, lane) {
    const me = playerForLane(roster, lane);
    if (!roster || !me) return 0;
    let sum = 0;
    for (const other of roster) {
      if (other === me) continue;
      sum += pairChemistry(me, other);
    }
    return clamp2(sum / 2, -1, 1);
  }
  var CHEM_LANE_K = 12;
  function laneChemistryBias(bluePlayers, redPlayers, lane, k = CHEM_LANE_K) {
    return (playerChemistry(bluePlayers, lane) - playerChemistry(redPlayers, lane)) * k;
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

  // lib/series.ts
  function requiredWins(format) {
    if (format === "bo1") return 1;
    if (format === "bo3") return 2;
    return 3;
  }
  function maxGames(format) {
    if (format === "bo1") return 1;
    if (format === "bo3") return 3;
    return 5;
  }
  function createSeries(params) {
    const bluePlayers = params.bluePlayers ? assignSynergies(params.bluePlayers, params.blueTeam) : void 0;
    const redPlayers = params.redPlayers ? assignSynergies(params.redPlayers, params.redTeam) : void 0;
    return {
      id: `series-${Date.now()}`,
      format: params.format,
      fearless: params.fearless,
      timerEnabled: params.timerEnabled,
      blueTeam: params.blueTeam,
      redTeam: params.redTeam,
      games: [createGame(1, params.blueTeam, params.redTeam)],
      status: "drafting",
      winner: null,
      mode: params.mode,
      aiSide: params.mode === "pvai" ? params.aiSide : null,
      aiDifficulty: params.aiDifficulty,
      blueAiDifficulty: params.blueAiDifficulty,
      redAiDifficulty: params.redAiDifficulty,
      // Star rating: explicit value wins; otherwise derive it from the roster
      // (the roster is the source of truth for team strength). Stays undefined
      // when neither is provided — non-tournament series with no rosters get
      // no win bias, exactly as before.
      blueStarRating: params.blueStarRating ?? (params.bluePlayers ? deriveStar(params.bluePlayers) : void 0),
      redStarRating: params.redStarRating ?? (params.redPlayers ? deriveStar(params.redPlayers) : void 0),
      blueWinStreak: params.blueWinStreak,
      redWinStreak: params.redWinStreak,
      tournamentRound: params.tournamentRound,
      blueForm: params.blueForm,
      redForm: params.redForm,
      blueClutch: params.blueClutch,
      redClutch: params.redClutch,
      bluePlayers,
      redPlayers,
      // Only persist the rule when explicitly set — keeps the default state
      // shape byte-identical to pre-feature series.
      ...params.sideRule ? { sideRule: params.sideRule } : {},
      // Only persist personality ids when explicitly set.
      ...params.bluePersonalityId ? { bluePersonalityId: params.bluePersonalityId } : {},
      ...params.redPersonalityId ? { redPersonalityId: params.redPersonalityId } : {},
      // Only persist the variance preset when opted in — absent ⇒ classic.
      ...params.variancePreset ? { variancePreset: params.variancePreset } : {}
    };
  }
  function effectiveSideRule(series) {
    return series.sideRule ?? "loser-blue";
  }
  function nextGameSides(series) {
    if (series.status !== "between-games") return null;
    const rule = effectiveSideRule(series);
    if (rule === "fixed") {
      return { blueTeam: series.blueTeam, redTeam: series.redTeam };
    }
    if (rule === "alternate") {
      return { blueTeam: series.redTeam, redTeam: series.blueTeam };
    }
    if (rule === "loser-picks") return null;
    const last = series.games[series.games.length - 1];
    if (!last?.winner) return null;
    const swap = last.winner === "blue";
    return swap ? { blueTeam: series.redTeam, redTeam: series.blueTeam } : { blueTeam: series.blueTeam, redTeam: series.redTeam };
  }
  var STAR_RATING_BIAS_K = 9;
  var WIN_STREAK_BIAS_K = 1.5;
  var WIN_STREAK_BIAS_CAP = 6;
  var UNDERDOG_BLUNT = 0.35;
  var UNDERDOG_FLAT = 1.5;
  var UNDERDOG_MIN_GAP = 3;
  var FORM_BIAS_K = 3;
  var CLUTCH_BIAS_K = 3;
  var MOMENTUM_BIAS_K = 1.2;
  var MOMENTUM_BIAS_CAP = 3;
  var BIAS_SCALE = {
    chalky: 1.25,
    balanced: 1,
    chaotic: 0.75
  };
  var DECIDER_DAMPEN = {
    chalky: 1,
    balanced: 0.8,
    chaotic: 0.6
  };
  var CHOKE_FLAT = {
    chalky: 0,
    balanced: 1.5,
    chaotic: 2.5
  };
  function starRatingBias(series) {
    const blue = series.blueStarRating;
    const red = series.redStarRating;
    if (typeof blue !== "number" || typeof red !== "number") return 0;
    const preset = series.variancePreset;
    let starBias = (blue - red) * STAR_RATING_BIAS_K;
    if (preset) starBias *= BIAS_SCALE[preset];
    const round = series.tournamentRound;
    const isFinal = round === "final";
    if (isFinal) {
      const starGap = Math.abs(blue - red);
      if (starGap >= UNDERDOG_MIN_GAP) {
        starBias *= 1 - UNDERDOG_BLUNT;
        if (blue > red) starBias -= UNDERDOG_FLAT;
        else starBias += UNDERDOG_FLAT;
      }
    }
    const streakBias = (streak) => Math.sign(streak) * Math.min(WIN_STREAK_BIAS_CAP, Math.abs(streak) * WIN_STREAK_BIAS_K);
    const blueStreakBias = streakBias(series.blueWinStreak ?? 0);
    const redStreakBias = streakBias(series.redWinStreak ?? 0);
    let total = starBias + (blueStreakBias - redStreakBias);
    total += (series.blueForm ?? 0) * FORM_BIAS_K - (series.redForm ?? 0) * FORM_BIAS_K;
    const isElimination = round === "final" || round === "semifinal" || round === "quarterfinal";
    if (isElimination) {
      total += (series.blueClutch ?? 0) * CLUTCH_BIAS_K - (series.redClutch ?? 0) * CLUTCH_BIAS_K;
    }
    if (series.blueClutch != null || series.redClutch != null) {
      const sc = seriesScore(series);
      const lead = Math.max(
        -MOMENTUM_BIAS_CAP,
        Math.min(MOMENTUM_BIAS_CAP, (sc.blue - sc.red) * MOMENTUM_BIAS_K)
      );
      total += lead;
    }
    if (preset && isElimination && blue !== red) {
      const need = requiredWins(series.format);
      const sc = seriesScore(series);
      const favoriteIsBlue = blue > red;
      const favoriteWins = favoriteIsBlue ? sc.blue : sc.red;
      const underdogWins = favoriteIsBlue ? sc.red : sc.blue;
      const favoriteFacingElimination = underdogWins === need - 1 && favoriteWins < need;
      if (favoriteFacingElimination) {
        total += (favoriteIsBlue ? -1 : 1) * CHOKE_FLAT[preset];
      }
    }
    if (preset) {
      const need = requiredWins(series.format);
      const sc = seriesScore(series);
      const isDecider = sc.blue === need - 1 && sc.red === need - 1;
      if (isDecider) total *= DECIDER_DAMPEN[preset];
    }
    return total;
  }
  function difficultyForSide(series, side) {
    if (side === "blue" && series.blueAiDifficulty) return series.blueAiDifficulty;
    if (side === "red" && series.redAiDifficulty) return series.redAiDifficulty;
    return series.aiDifficulty;
  }
  function currentGame(series) {
    return series.games[series.games.length - 1];
  }
  function fearlessLockedSet(series) {
    return fearlessLocksBeforeGame(series, series.games.length - 1);
  }
  function fearlessLocksBeforeGame(series, gameIndex) {
    const set = /* @__PURE__ */ new Set();
    if (!series.fearless) return set;
    const end = Math.min(gameIndex, series.games.length);
    for (let i = 0; i < end; i++) {
      const g = series.games[i];
      for (const id of [...g.bluePicks, ...g.redPicks]) {
        if (id != null) set.add(id);
      }
    }
    return set;
  }
  function winsByTeamName(series) {
    const counts = /* @__PURE__ */ new Map();
    for (const g of series.games) {
      if (g.winner == null) continue;
      const name = g.winner === "blue" ? g.blueTeam : g.redTeam;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }
  function seriesScore(series) {
    const wins = winsByTeamName(series);
    return {
      blue: wins.get(series.blueTeam) ?? 0,
      red: wins.get(series.redTeam) ?? 0
    };
  }
  function isSeriesDecided(series) {
    const wins = winsByTeamName(series);
    const need = requiredWins(series.format);
    for (const [name, w] of wins) {
      if (w < need) continue;
      if (name === series.blueTeam) return "blue";
      if (name === series.redTeam) return "red";
    }
    return null;
  }
  function recordWinner(series, winner, recap) {
    const games = [...series.games];
    const last = games[games.length - 1];
    games[games.length - 1] = {
      ...last,
      winner,
      // Only attach recap if provided (manual winner declarations leave it
      // unset). Don't overwrite an existing recap with undefined.
      ...recap ? { recap } : {}
    };
    const updated = { ...series, games };
    const decided = isSeriesDecided(updated);
    if (decided) {
      updated.status = "complete";
      updated.winner = decided;
      if (updated.sideChooser != null) updated.sideChooser = null;
    } else {
      updated.status = "between-games";
      if (effectiveSideRule(updated) === "loser-picks") {
        const last2 = games[games.length - 1];
        updated.sideChooser = winner === "blue" ? last2.redTeam : last2.blueTeam;
      }
    }
    return updated;
  }
  function applySideChoice(series, side) {
    if (series.status !== "between-games") return series;
    const chooser = series.sideChooser;
    if (!chooser) return series;
    const other = chooser === series.blueTeam ? series.redTeam : series.blueTeam;
    const blueTeam = side === "blue" ? chooser : other;
    const redTeam = side === "blue" ? other : chooser;
    return startNextGame(series, blueTeam, redTeam);
  }
  var SIDE_AI_BLUE_BASE = 0.85;
  var SIDE_AI_RED_PULL = 0.5;
  var SIDE_AI_FULL_POOL = 15;
  function chooseSideAI(input, rng = Math.random) {
    let signal = 0;
    if (input.players && input.players.length > 0) {
      const pool = /* @__PURE__ */ new Set();
      for (const p of input.players) for (const id of p.goodChamps) pool.add(id);
      signal = Math.max(signal, Math.min(1, pool.size / SIDE_AI_FULL_POOL));
    }
    if (input.pickHistory && input.pickHistory.length > 0) {
      const len = input.pickHistory.length;
      const distinct = new Set(input.pickHistory).size;
      const diversity = distinct / len * Math.min(1, len / 10);
      signal = Math.max(signal, diversity);
    }
    const blueProb = SIDE_AI_BLUE_BASE - SIDE_AI_RED_PULL * signal;
    return rng() < blueProb ? "blue" : "red";
  }
  function startNextGame(series, blueTeam, redTeam) {
    if (series.status !== "between-games") return series;
    const nextGameNumber = series.games.length + 1;
    if (nextGameNumber > maxGames(series.format)) return series;
    const swap = blueTeam === series.redTeam && redTeam === series.blueTeam;
    return {
      ...series,
      blueTeam,
      redTeam,
      status: "drafting",
      games: [...series.games, createGame(nextGameNumber, blueTeam, redTeam)],
      // The choice (if any) has been consumed — clear it. Conditional spread
      // keeps the state shape of non-loser-picks series byte-identical to
      // pre-feature behavior.
      ...series.sideChooser != null ? { sideChooser: null } : {},
      ...swap ? {
        aiSide: series.aiSide === "blue" ? "red" : series.aiSide === "red" ? "blue" : series.aiSide,
        blueAiDifficulty: series.redAiDifficulty,
        redAiDifficulty: series.blueAiDifficulty,
        blueStarRating: series.redStarRating,
        redStarRating: series.blueStarRating,
        blueWinStreak: series.redWinStreak,
        redWinStreak: series.blueWinStreak,
        // Season-realism modifiers are team properties too — swap them so
        // form/clutch stay attached to the right roster after the swap.
        blueForm: series.redForm,
        redForm: series.blueForm,
        blueClutch: series.redClutch,
        redClutch: series.blueClutch,
        // Player rosters follow their team across the side swap, so
        // blue*/red* always describe the CURRENT sides (matching the
        // star-rating convention above). Keeps the simulator's per-lane
        // player effects and the AI's roster aligned to the right side.
        bluePlayers: series.redPlayers,
        redPlayers: series.bluePlayers,
        // Draft personalities follow their team across side swaps — each
        // team always uses its own personality regardless of side.
        bluePersonalityId: series.redPersonalityId,
        redPersonalityId: series.bluePersonalityId
      } : {}
    };
  }

  // lib/sim/finalizeRoles.ts
  function isAISide(series, side) {
    if (series.mode === "aivai") return true;
    if (series.mode === "pvai") return series.aiSide === side;
    return false;
  }
  function positionalPicksForSide(picks, champions, series, side) {
    if (series && isAISide(series, side) && difficultyForSide(series, side) !== "easy") {
      const roster = side === "blue" ? series.bluePlayers : series.redPlayers;
      return optimizeRoleAssignment(picks, champions, roster);
    }
    return reorderPicksByPosition(picks, champions);
  }
  function finalizeRoles(game, champions, series) {
    if (game.status !== "complete") return game;
    return {
      ...game,
      bluePicks: positionalPicksForSide(game.bluePicks, champions, series, "blue"),
      redPicks: positionalPicksForSide(game.redPicks, champions, series, "red"),
      blueRoles: [...POSITIONAL_LANES],
      redRoles: [...POSITIONAL_LANES]
    };
  }

  // lib/playerForm.ts
  var FORM_MIN = -1;
  var FORM_MAX = 1;
  var FORM_ALPHA = 0.35;
  var FORM_DECAY = 0.85;
  var FORM_RATING_CENTER = 5.5;
  var FORM_RATING_SCALE = 3.5;
  function clamp3(n2, lo, hi) {
    return Math.max(lo, Math.min(hi, n2));
  }
  function clampForm(form) {
    if (!Number.isFinite(form)) return 0;
    return clamp3(form, FORM_MIN, FORM_MAX);
  }
  function normalizeRating(rating) {
    if (!Number.isFinite(rating)) return 0;
    return clamp3((rating - FORM_RATING_CENTER) / FORM_RATING_SCALE, -1, 1);
  }
  function updateForm(prev, gameRating) {
    const p = clampForm(prev);
    const t = normalizeRating(gameRating);
    return clampForm(p * FORM_DECAY * (1 - FORM_ALPHA) + t * FORM_ALPHA);
  }
  var FORM_TIER_FRACTION = 0.5;
  function formTierBias(form) {
    return clampForm(form) * FORM_TIER_FRACTION;
  }
  function playerFormKey(teamKey, lane) {
    return `${teamKey}:${lane}`;
  }
  function sideFormsFor(forms, teamKey) {
    const out = {};
    if (!forms) return out;
    for (const lane of LANE_ORDER) {
      const v = forms[playerFormKey(teamKey, lane)];
      if (typeof v === "number") out[lane] = clampForm(v);
    }
    return out;
  }
  function applyRatingsToForms(forms, teamKey, laneRatings) {
    const out = { ...forms ?? {} };
    for (let i = 0; i < LANE_ORDER.length; i++) {
      const rating = laneRatings[i];
      if (typeof rating !== "number" || !Number.isFinite(rating)) continue;
      const key = playerFormKey(teamKey, LANE_ORDER[i]);
      out[key] = updateForm(out[key] ?? 0, rating);
    }
    return out;
  }

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
  var AP_BUILDERS_OVERRIDE = /* @__PURE__ */ new Set([
    "Akali",
    "Ekko",
    "Fizz",
    "Mordekaiser",
    "Singed",
    "Teemo",
    // Tagged Assassin only but builds AP:
    "Evelynn",
    // also tagged Mage so fine, but listed for clarity
    // Tagged Fighter only but builds AP:
    "Rumble"
    // also tagged Mage so fine
  ]);
  var HYBRID_DAMAGE = /* @__PURE__ */ new Set([
    "Kayle",
    "Kennen"
  ]);
  var NEITHER_DAMAGE = /* @__PURE__ */ new Set([
    "Sion",
    "Maokai",
    "Zac",
    "Ornn",
    "Rell"
  ]);
  var HARD_COUNTERS = hardCounters_default;
  var IDENTITIES = [
    {
      label: "Wombo Combo",
      trigger: (c) => c.wombo >= 1 && c.engage >= 1,
      needed: ["wombo", "engage"]
    },
    {
      label: "Protect The Carry",
      trigger: (c) => c["hyper-carry"] >= 1 && c.peel >= 1,
      needed: ["peel", "enchanter", "hyper-carry"]
    },
    {
      label: "Hyper Engage",
      trigger: (c) => c.engage >= 2,
      needed: ["engage", "tank", "dive"]
    },
    {
      label: "Pick Comp",
      trigger: (c) => c.pick >= 1 && (c.assassin >= 1 || c.burst >= 1),
      needed: ["pick", "assassin", "burst"]
    },
    {
      label: "Poke / Siege",
      trigger: (c) => c.poke >= 2,
      needed: ["poke"]
    },
    {
      label: "Dive Comp",
      trigger: (c) => c.dive >= 2,
      needed: ["dive", "engage"]
    },
    {
      label: "Tank Stack",
      trigger: (c) => c.tank >= 2 && c.engage >= 1,
      needed: ["tank", "engage"]
    },
    {
      label: "1-3-1 Splitpush",
      trigger: (c) => c.splitpush >= 1,
      needed: ["splitpush", "poke", "wombo"]
    },
    {
      label: "AP Burst",
      trigger: (c) => c.burst >= 2,
      needed: ["burst", "engage", "pick"]
    },
    {
      label: "Bruiser Brawl",
      trigger: (c) => c.skirmish >= 2 && c.sustain >= 1,
      needed: ["skirmish", "sustain", "tank"]
    },
    {
      label: "Standard Teamfight",
      trigger: (c) => c.engage >= 1 && c["hyper-carry"] >= 1,
      needed: ["engage", "peel", "hyper-carry"]
    }
  ];
  var FALLBACK_META = {
    phase: "mid",
    archetypes: ["skirmish"],
    cc: "soft",
    mobility: "medium",
    metaTiers: {}
  };
  var PICK_TOP_N = 3;
  var PICK_TEMPERATURE = 2;
  var POCKET_PICK_PROB = 0.05;
  var POCKET_PICK_TOP_N = 7;
  var BAN_TOP_N = 3;
  var BAN_TEMPERATURE = 1.5;
  var LOOKAHEAD_TOP_K = 5;

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
  var _cachedCounterLookup = BASELINE_COUNTER_LOOKUP;
  var _cachedCounterVersion = 0;
  function getCounterLookup() {
    const override = getActiveCounterOverride();
    if (!override) return BASELINE_COUNTER_LOOKUP;
    const v = getCounterOverrideVersion();
    if (v !== _cachedCounterVersion) {
      _cachedCounterLookup = buildCounterLookup(override);
      _cachedCounterVersion = v;
    }
    return _cachedCounterLookup;
  }
  var byIdCache = /* @__PURE__ */ new WeakMap();
  function getById(champions) {
    let m = byIdCache.get(champions);
    if (!m) {
      m = /* @__PURE__ */ new Map();
      for (const c of champions) m.set(c.id, c);
      byIdCache.set(champions, m);
    }
    return m;
  }
  function metaFor(champ) {
    return getChampionMeta(champ.alias) ?? FALLBACK_META;
  }
  function picksFor(game, side) {
    return side === "blue" ? game.bluePicks : game.redPicks;
  }
  function bansFor(game, side) {
    return side === "blue" ? game.blueBans : game.redBans;
  }
  function countNonNull(arr) {
    let n2 = 0;
    for (const x of arr) if (x != null) n2++;
    return n2;
  }
  function isAP(c) {
    if (NEITHER_DAMAGE.has(c.alias)) return false;
    if (HYBRID_DAMAGE.has(c.alias)) return true;
    if (AP_BUILDERS_OVERRIDE.has(c.alias)) return true;
    return c.roles.some((r) => r.toLowerCase() === "mage");
  }
  function isAD(c) {
    if (NEITHER_DAMAGE.has(c.alias)) return false;
    if (HYBRID_DAMAGE.has(c.alias)) return true;
    if (AP_BUILDERS_OVERRIDE.has(c.alias)) return false;
    const roles = c.roles.map((r) => r.toLowerCase());
    if (roles.includes("marksman") || roles.includes("assassin")) return true;
    if (roles.includes("fighter") && !roles.includes("mage")) return true;
    return false;
  }
  function openLanes(picks, champions) {
    const assigned = assignLanesToPicks(picks, champions);
    const open = new Set(POSITIONAL_LANES);
    for (const lane of assigned) if (lane) open.delete(lane);
    return open;
  }
  function inferLaneAssignment(picks, champions) {
    return assignLanesToPicks(picks, champions);
  }
  function archetypeCounts(picks, byId) {
    const counts = {
      engage: 0,
      peel: 0,
      poke: 0,
      dive: 0,
      pick: 0,
      wombo: 0,
      "hyper-carry": 0,
      splitpush: 0,
      assassin: 0,
      tank: 0,
      enchanter: 0,
      burst: 0,
      skirmish: 0,
      sustain: 0
    };
    for (const id of picks) {
      if (id == null) continue;
      const champ = byId.get(id);
      if (!champ) continue;
      for (const a of metaFor(champ).archetypes) counts[a]++;
    }
    return counts;
  }
  function isDamageDealer(c) {
    const meta = metaFor(c);
    if (meta.archetypes.includes("hyper-carry")) return true;
    if (meta.archetypes.includes("burst")) return true;
    if (meta.archetypes.includes("poke")) return true;
    const roles = c.roles.map((r) => r.toLowerCase());
    if (roles.includes("marksman")) return true;
    if (roles.includes("mage") && !meta.archetypes.includes("enchanter") && !meta.archetypes.includes("peel"))
      return true;
    return false;
  }
  function damageDealerCount(picks, byId) {
    let n2 = 0;
    for (const id of picks) {
      if (id == null) continue;
      const c = byId.get(id);
      if (!c) continue;
      if (isDamageDealer(c)) n2++;
    }
    return n2;
  }
  function phaseProfile(picks, byId) {
    const profile = { early: 0, mid: 0, midLate: 0, late: 0 };
    for (const id of picks) {
      if (id == null) continue;
      const c = byId.get(id);
      if (!c) continue;
      const meta = metaFor(c);
      if (meta.phase === "early") profile.early++;
      else if (meta.phase === "mid") profile.mid++;
      else if (meta.phase === "mid-late") profile.midLate++;
      else if (meta.phase === "late") profile.late++;
    }
    return profile;
  }
  function damageProfile(picks, byId) {
    let ap = 0;
    let ad = 0;
    for (const id of picks) {
      if (id == null) continue;
      const champ = byId.get(id);
      if (!champ) continue;
      if (isAP(champ)) ap++;
      if (isAD(champ)) ad++;
    }
    return { ap, ad };
  }
  function bestLaneTierValue(champ, open) {
    const metaOn = getMetaEnabled();
    for (const lane of champ.lanes) {
      if (!open.has(lane)) continue;
      if (!metaOn) return { value: 0, lane };
      const tier = getMetaTier(champ.alias, lane) ?? "C";
      return { value: TIER_VALUE[tier], lane };
    }
    return { value: 0, lane: null };
  }
  function flexLaneCount(champ) {
    let n2 = 0;
    for (const lane of champ.lanes) {
      const tier = getMetaTier(champ.alias, lane);
      if (tier && TIER_VALUE[tier] >= TIER_VALUE.B) n2++;
    }
    return n2;
  }
  function synergyWith(candidate, others, byId) {
    let total = 0;
    for (const id of others) {
      if (id == null) continue;
      const mate = byId.get(id);
      if (!mate || mate.alias === candidate.alias) continue;
      const s = getSynergy(candidate.alias, mate.alias);
      if (s) total += s.bonus;
    }
    return Math.min(6, total);
  }
  function archetypeSynergyBonus(candidate, teammates, byId) {
    const cand = metaFor(candidate);
    let bonus = 0;
    for (const id of teammates) {
      if (id == null) continue;
      const mate = byId.get(id);
      if (!mate) continue;
      if (getSynergy(candidate.alias, mate.alias)) continue;
      const m = metaFor(mate);
      const candEng = cand.archetypes.includes("engage") || cand.archetypes.includes("wombo");
      const candFinisher = cand.archetypes.includes("burst") || cand.archetypes.includes("wombo");
      const mateEng = m.archetypes.includes("engage") || m.archetypes.includes("wombo");
      const mateFinisher = m.archetypes.includes("burst") || m.archetypes.includes("wombo");
      if (candEng && mateFinisher) bonus += 0.6;
      if (mateEng && candFinisher) bonus += 0.6;
      if (cand.archetypes.includes("hyper-carry") && (m.archetypes.includes("peel") || m.archetypes.includes("enchanter")))
        bonus += 0.6;
      if (m.archetypes.includes("hyper-carry") && (cand.archetypes.includes("peel") || cand.archetypes.includes("enchanter")))
        bonus += 0.6;
      if (cand.archetypes.includes("dive") && m.archetypes.includes("dive"))
        bonus += 0.4;
      if (cand.archetypes.includes("pick") && (m.archetypes.includes("assassin") || m.archetypes.includes("burst")))
        bonus += 0.4;
    }
    return Math.min(3, bonus);
  }
  function hardCounterValue(counter, victim) {
    return getCounterLookup().get(counter.alias)?.get(victim.alias) ?? 0;
  }
  function laneMatchup(myChamp, oppChamp) {
    let score = 0;
    score += hardCounterValue(myChamp, oppChamp);
    score -= hardCounterValue(oppChamp, myChamp);
    const my = metaFor(myChamp);
    const opp = metaFor(oppChamp);
    if (my.mobility === "high" && opp.mobility === "low") score += 5;
    if (opp.mobility === "high" && my.mobility === "low") score -= 5;
    const myLate = my.phase === "late" || my.phase === "mid-late";
    const oppLate = opp.phase === "late" || opp.phase === "mid-late";
    if (my.phase === "early" && oppLate) score += 3;
    if (opp.phase === "early" && myLate) score -= 3;
    if (my.archetypes.includes("sustain") && opp.archetypes.includes("burst"))
      score += 1;
    if (opp.archetypes.includes("sustain") && my.archetypes.includes("burst"))
      score -= 1;
    return score;
  }
  function damageBalanceDelta(candidate, myDmg) {
    const candAP = isAP(candidate);
    const candAD = isAD(candidate);
    if (!candAP && !candAD) return 0;
    let delta = 0;
    if (candAP && myDmg.ap === 0) delta += 5;
    if (candAD && myDmg.ad === 0) delta += 5;
    if (candAP && myDmg.ap >= 2) delta -= (myDmg.ap - 1) * 3;
    if (candAD && myDmg.ad >= 2) delta -= (myDmg.ad - 1) * 3;
    return delta;
  }
  function identityTarget(myCounts, picksLocked) {
    if (picksLocked < 2) return null;
    let best = null;
    for (const id of IDENTITIES) {
      if (!id.trigger(myCounts)) continue;
      let score = 0;
      for (const a of id.needed) score += myCounts[a];
      if (best == null || score > best.score) {
        best = { label: id.label, needed: id.needed, score };
      }
    }
    if (!best) return null;
    return { label: best.label, needed: new Set(best.needed) };
  }
  function sampleTopN(scored, n2, temperature, rng = Math.random) {
    if (scored.length === 0) return null;
    const sorted = [...scored].sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, Math.min(n2, sorted.length));
    const max = top[0].score;
    const weights = top.map((t) => Math.exp((t.score - max) / temperature));
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) return top[0].item;
    let r = rng() * sum;
    for (let i = 0; i < top.length; i++) {
      r -= weights[i];
      if (r <= 0) return top[i].item;
    }
    return top[top.length - 1].item;
  }
  function nextActionIsEnemyPick(game, mySide) {
    const idx = game.actionIndex + 1;
    if (idx >= TOTAL_ACTIONS) return false;
    const next = DRAFT_ORDER[idx];
    return next.kind === "pick" && next.side !== mySide;
  }
  function remainingActionsForSide(game, side) {
    let picks = 0;
    let bans = 0;
    for (let i = game.actionIndex + 1; i < TOTAL_ACTIONS; i++) {
      const a = DRAFT_ORDER[i];
      if (a.side !== side) continue;
      if (a.kind === "pick") picks++;
      else bans++;
    }
    return { picks, bans };
  }

  // lib/draftAI/scoring.ts
  var COUNTER_ARCHETYPES_FOR_IDENTITY = {
    "Wombo Combo": /* @__PURE__ */ new Set(["peel", "enchanter", "splitpush"]),
    "Protect The Carry": /* @__PURE__ */ new Set(["dive", "assassin", "burst", "pick"]),
    "Hyper Engage": /* @__PURE__ */ new Set(["peel", "sustain", "poke"]),
    "Pick Comp": /* @__PURE__ */ new Set(["peel", "tank", "sustain"]),
    "Poke / Siege": /* @__PURE__ */ new Set(["engage", "dive", "assassin"]),
    "Dive Comp": /* @__PURE__ */ new Set(["peel", "enchanter", "tank"]),
    "Tank Stack": /* @__PURE__ */ new Set(["hyper-carry", "splitpush", "poke"]),
    "1-3-1 Splitpush": /* @__PURE__ */ new Set(["wombo", "engage", "pick"]),
    "AP Burst": /* @__PURE__ */ new Set(["sustain", "tank", "peel"]),
    "Bruiser Brawl": /* @__PURE__ */ new Set(["peel", "burst", "poke"]),
    "Standard Teamfight": /* @__PURE__ */ new Set(["splitpush", "pick", "poke"])
  };
  var ENABLER_ARCHETYPES_FOR_IDENTITY = {
    "Wombo Combo": /* @__PURE__ */ new Set(["wombo", "engage"]),
    "Pick Comp": /* @__PURE__ */ new Set(["pick", "burst"]),
    "Hyper Engage": /* @__PURE__ */ new Set(["engage"]),
    "Dive Comp": /* @__PURE__ */ new Set(["dive"]),
    "Protect The Carry": /* @__PURE__ */ new Set(["hyper-carry", "enchanter"]),
    "Poke / Siege": /* @__PURE__ */ new Set(["poke"]),
    "Tank Stack": /* @__PURE__ */ new Set(["tank"]),
    "1-3-1 Splitpush": /* @__PURE__ */ new Set(["splitpush"]),
    "AP Burst": /* @__PURE__ */ new Set(["burst", "assassin"]),
    "Bruiser Brawl": /* @__PURE__ */ new Set(["skirmish", "sustain"]),
    "Standard Teamfight": /* @__PURE__ */ new Set(["engage", "hyper-carry"])
  };
  var CARRY_DRAFT_K = 6;
  var CHEM_DRAFT_K = 5;
  function scorePick(candidate, ctx, explain = false) {
    const breakdown = explain ? [] : void 0;
    const persona = ctx.personality;
    let total = 0;
    function add(label, value, kind) {
      let v = value;
      if (persona && kind !== void 0) {
        const w = persona.weights[kind];
        if (w != null && w !== 1) v = value * w;
      }
      total += v;
      if (breakdown && v !== 0) breakdown.push({ label, value: v });
    }
    const { value: tierValue, lane: bestLane } = bestLaneTierValue(
      candidate,
      ctx.open
    );
    if (bestLane == null) {
      add("No open lane", -50);
      return { total, intendedLane: null, breakdown };
    }
    add(`Lane fit (${bestLane}, tier\xD73)`, tierValue * 3, "metaTier");
    if (ctx.series && ctx.series.difficulty !== "easy" && ctx.series.myPlayers) {
      const comfort = poolBias(
        playerForLane(ctx.series.myPlayers, bestLane),
        candidate.id
      );
      if (comfort > 0) {
        add("Player comfort pick", comfort * 4, "playerComfort");
        const form = ctx.series.myForms?.[bestLane] ?? 0;
        if (form > 0)
          add("Carry priority (in form)", comfort * form * CARRY_DRAFT_K, "playerComfort");
        const chem = playerChemistry(ctx.series.myPlayers, bestLane);
        if (chem > 0)
          add("Synergy core priority", comfort * chem * CHEM_DRAFT_K, "playerComfort");
      } else if (comfort < 0)
        add("Player off-pool pick", comfort * 4, "playerComfort");
      const affinity = persona?.offMetaComfortBonus;
      if (affinity != null && affinity !== 0 && comfort > 0 && tierValue < TIER_VALUE.A) {
        add("Pocket-pick affinity", affinity);
      }
    }
    const meta = metaFor(candidate);
    if (ctx.myCounts.tank === 0 && meta.archetypes.includes("tank"))
      add("Fills tank gap", 8);
    if (ctx.myCounts.engage === 0 && meta.archetypes.includes("engage"))
      add("Fills engage gap", 6);
    if (ctx.myCounts["hyper-carry"] === 0 && meta.archetypes.includes("hyper-carry"))
      add("Fills hyper-carry gap", 5);
    if (ctx.myCounts.peel < 2 && meta.archetypes.includes("peel"))
      add("Adds peel", 3);
    const dmgDelta = damageBalanceDelta(candidate, ctx.myDmg);
    if (dmgDelta !== 0) {
      add(
        dmgDelta > 0 ? "Damage gap fill" : "Damage stack penalty",
        dmgDelta,
        "damageBalance"
      );
    }
    if (meta.phase === "early" || meta.archetypes.includes("poke")) {
      let prioBonus = 1.5;
      const id = ctx.identity?.label;
      if (id === "Pick Comp" || id === "Wombo Combo" || id === "Hyper Engage" || id === "Dive Comp" || id === "Standard Teamfight") {
        prioBonus += 1.5;
      }
      add("Lane prio (enables plays)", prioBonus);
    }
    const roles = candidate.roles.map((r) => r.toLowerCase());
    if (roles.includes("marksman") || roles.includes("mage") && !meta.archetypes.includes("enchanter")) {
      add("Ranged lane pressure", 0.8);
    }
    if (isDamageDealer(candidate)) {
      if (ctx.myDamageDealers < 2) {
        let dpsBonus = 4;
        if (ctx.oppCounts.tank >= 3) dpsBonus += 8;
        else if (ctx.oppCounts.tank >= 2) dpsBonus += 5;
        else if (ctx.oppCounts.tank >= 1) dpsBonus += 2;
        add("Need DPS to break tanks", dpsBonus);
      } else if (ctx.myDamageDealers >= 3 && ctx.oppCounts.tank === 0) {
        add("Damage saturated", -2);
      }
    }
    const candAP = isAP(candidate);
    const candAD = isAD(candidate);
    if (ctx.oppCounts.tank >= 2) {
      const newAP = ctx.myDmg.ap + (candAP ? 1 : 0);
      const newAD = ctx.myDmg.ad + (candAD ? 1 : 0);
      if (newAP >= 4 && newAD < 2 && candAP)
        add("Walled mono-AP vs tanks", -3, "damageBalance");
      if (newAD >= 4 && newAP < 2 && candAD)
        add("Walled mono-AD vs tanks", -3, "damageBalance");
      if (ctx.myDmg.ap >= 1 && ctx.myDmg.ad >= 1 && ctx.myDamageDealers >= 2 && (candAP && ctx.myDmg.ap < 3 || candAD && ctx.myDmg.ad < 3)) {
        add("Forces split-resist", 1.5, "damageBalance");
      }
    }
    if (ctx.identity) {
      let identityBonus = 0;
      for (const a of meta.archetypes) {
        if (ctx.identity.needed.has(a)) identityBonus += 2.5;
      }
      if (identityBonus > 0) {
        add(
          `Completes ${ctx.identity.label}`,
          Math.min(5, identityBonus),
          "identity"
        );
      }
    }
    const enemyHasNoPeel = ctx.oppCounts.peel < 2 && ctx.oppCounts.enchanter === 0;
    if (ctx.myCounts.engage >= 1 && ctx.myCounts.wombo >= 1 && enemyHasNoPeel && (meta.archetypes.includes("wombo") || meta.archetypes.includes("burst"))) {
      add("Wombo amp vs no disengage", 2, "identity");
    }
    if (ctx.oppCounts["hyper-carry"] >= 1 && ctx.oppCounts.peel < 2 && ctx.myCounts.dive >= 1 && meta.archetypes.includes("dive")) {
      add("Stacks dive vs unprotected", 2, "identity");
    }
    if (ctx.myCounts["hyper-carry"] >= 1 && ctx.myCounts.peel >= 1 && (meta.archetypes.includes("peel") || meta.archetypes.includes("enchanter"))) {
      add("Stacks protect identity", 1.5, "identity");
    }
    if (ctx.myCounts.pick >= 1 && enemyHasNoPeel && meta.archetypes.includes("pick")) {
      add("Pick comp amp", 1.5, "identity");
    }
    const teamHasBotInvest = ctx.myCounts["hyper-carry"] >= 1 && (ctx.myCounts.peel >= 1 || ctx.myCounts.enchanter >= 1);
    const teamHasTopInvest = ctx.myCounts.splitpush >= 1 && (ctx.myCounts.dive >= 1 || ctx.myCounts.skirmish >= 1);
    if (teamHasBotInvest && bestLane === "top") {
      const fitsWeaksideTop = (meta.archetypes.includes("sustain") || meta.archetypes.includes("tank") || meta.archetypes.includes("splitpush")) && (meta.phase === "late" || meta.phase === "mid-late");
      if (fitsWeaksideTop) {
        add("Fits weakside top (resources to bot)", 2);
      }
    }
    if (teamHasTopInvest && bestLane === "bottom") {
      if (meta.archetypes.includes("poke") || meta.archetypes.includes("sustain")) {
        add("Fits weakside bot (resources to top)", 1.5);
      }
    }
    {
      const isCandEarly = meta.phase === "early";
      const isCandLate = meta.phase === "late" || meta.phase === "mid-late";
      const isCandMid = meta.phase === "mid";
      const myEarly = ctx.myPhase.early;
      const myLate = ctx.myPhase.late + ctx.myPhase.midLate;
      const oppEarly = ctx.oppPhase.early;
      const oppLate = ctx.oppPhase.late + ctx.oppPhase.midLate;
      if (isCandEarly && myEarly === 0 && ctx.myPicksLocked >= 2) {
        add("Fills early-game presence", 3);
      }
      if (isCandLate && myLate === 0 && ctx.myPicksLocked >= 2) {
        add("Fills late-game scaling", 3.5);
      }
      if (isCandEarly && myEarly >= 3) {
        add("Phase saturated (too early)", -2);
      }
      if (isCandLate && myLate >= 3) {
        add("Phase saturated (too late)", -1.5);
      }
      if (isCandEarly && oppLate >= 2 && oppEarly < 2) {
        add("Snowballs vs scaling opp", 2);
      }
      if (isCandLate && oppEarly >= 2 && oppLate < 2) {
        add("Outscales early opp", 2.5);
      }
      if (isCandMid && myEarly + myLate >= 3 && Math.abs(myEarly - myLate) >= 2) {
        add("Bridges phase gap", 1);
      }
    }
    {
      let coherence = 0;
      for (const a of meta.archetypes) {
        const stacked = ctx.myCounts[a];
        if (stacked >= 2) coherence += 0.6;
        else if (stacked === 1) coherence += 0.25;
      }
      if (coherence > 0 && !ctx.identity) {
        add("Reinforces comp shape", Math.min(2, coherence), "archetypeSynergy");
      }
    }
    const explicitSyn = synergyWith(candidate, ctx.myPicks, ctx.byId);
    if (explicitSyn > 0) add("Explicit synergy", explicitSyn * 1.2, "synergy");
    const implicitSyn = archetypeSynergyBonus(candidate, ctx.myPicks, ctx.byId);
    if (implicitSyn > 0)
      add("Archetype synergy", implicitSyn, "archetypeSynergy");
    let oppInLane = null;
    for (let i = 0; i < ctx.oppPicks.length; i++) {
      if (ctx.oppLaneAssignment[i] === bestLane) {
        const id = ctx.oppPicks[i];
        if (id != null) {
          oppInLane = ctx.byId.get(id) ?? null;
          break;
        }
      }
    }
    if (oppInLane) {
      const infoPicks = ctx.side === "blue" ? Math.min(ctx.myPicksLocked, 3) : ctx.myPicksLocked;
      const matchupMul = 1 + 0.5 * infoPicks;
      const matchup = laneMatchup(candidate, oppInLane);
      const absMatchup = Math.abs(matchup);
      let amplified = matchup;
      if (absMatchup >= 4) {
        const overshoot = absMatchup - 4;
        const extra = Math.min(6, 2 + overshoot * 1.2);
        amplified += matchup > 0 ? extra : -extra;
      }
      let value = amplified * matchupMul;
      if (ctx.series && ctx.series.difficulty !== "easy" && ctx.series.oppPlayers) {
        const enemyP = playerForLane(ctx.series.oppPlayers, bestLane);
        if (enemyP) value *= 1 + 0.3 * (PLAYER_SKILL_WEIGHT[enemyP.tier] - 0.5);
      }
      if (value !== 0) {
        const severity = absMatchup >= 4 ? "Hard " : "";
        add(
          value > 0 ? `${severity}Counter-picks ${oppInLane.name}` : `${severity}Bad matchup vs ${oppInLane.name}`,
          value,
          "laneMatchup"
        );
      }
    }
    let denyValue = 0;
    for (const id of ctx.myPicks) {
      if (id == null) continue;
      const teammate = ctx.byId.get(id);
      if (!teammate) continue;
      const matchup = laneMatchup(candidate, teammate);
      if (matchup >= 4) denyValue += matchup * 0.85;
      else if (matchup > 2) denyValue += matchup * 0.5;
    }
    if (ctx.myCounts["hyper-carry"] >= 1 && ctx.myCounts.peel < 2) {
      if (meta.archetypes.includes("dive") || meta.archetypes.includes("assassin"))
        denyValue += 2;
    }
    if (ctx.myCounts.poke >= 2 && meta.archetypes.includes("engage"))
      denyValue += 1.5;
    if (ctx.myCounts.tank === 0 && meta.archetypes.includes("hyper-carry"))
      denyValue += 1;
    if (denyValue > 0.5) {
      add("Denies enemy counter", Math.min(6, denyValue), "laneMatchup");
    }
    if (ctx.series && ctx.series.difficulty !== "easy" && ctx.series.oppPlayers) {
      const mainW = rosterComfortWeight(ctx.series.oppPlayers, candidate.id);
      if (mainW > 0) add("Denies enemy main", 4 * mainW, "targetBan");
    }
    if (ctx.oppCounts.poke >= 2 && meta.archetypes.includes("engage"))
      add("Engage vs enemy poke", 3, "laneMatchup");
    if (ctx.oppCounts.dive >= 2 && (meta.archetypes.includes("peel") || meta.archetypes.includes("enchanter")))
      add("Peel vs enemy dive", 3, "laneMatchup");
    if (ctx.oppCounts.tank >= 2 && meta.archetypes.includes("hyper-carry"))
      add("DPS vs tank wall", 2, "laneMatchup");
    if (ctx.oppCounts["hyper-carry"] >= 1 && ctx.oppCounts.peel < 2 && meta.archetypes.includes("dive"))
      add("Dive vs unprotected carry", 3, "laneMatchup");
    const flex = flexLaneCount(candidate);
    if (flex >= 2) {
      const earlinessBonus = (4 - ctx.myPicksLocked) * 0.6 * (flex - 1);
      if (earlinessBonus > 0) add("Flex pick (early)", earlinessBonus);
    }
    if (ctx.series?.difficulty !== "easy") {
      if (ctx.side === "blue") {
        if (ctx.myPicksLocked === 0) {
          if (flex >= 3) {
            add("Flex first pick (counter-resistant)", 2.5);
          } else if (flex >= 2) {
            add("Semi-flex first pick", 1.2);
          } else if (flex === 1) {
            if (tierValue < TIER_VALUE.S) {
              add("Single-lane B1 (counter-bait)", -2);
            }
          }
          if (tierValue >= TIER_VALUE["S+"]) {
            add("Power first pick", 1.5, "metaTier");
          }
        }
        if (ctx.myPicksLocked === 1 || ctx.myPicksLocked === 2) {
          if (flex >= 2 && tierValue >= TIER_VALUE.A) {
            add("Flex blue mid-phase", 0.8);
          }
        }
      } else {
        let redCounterBonus = 0;
        for (const id of ctx.oppPicks) {
          if (id == null) continue;
          const opp = ctx.byId.get(id);
          if (!opp) continue;
          const matchup = laneMatchup(candidate, opp);
          if (matchup > 1.5) redCounterBonus += matchup * 0.4;
        }
        if (redCounterBonus > 0.5) {
          const phaseScale = 1 + ctx.myPicksLocked * 0.3;
          add(
            "Red counter advantage",
            Math.min(5, redCounterBonus * phaseScale),
            "laneMatchup"
          );
        }
        if (ctx.myPicksLocked === 4 && oppInLane) {
          const finalMatchup = laneMatchup(candidate, oppInLane);
          if (finalMatchup > 0) {
            add("Last-pick lane closer", finalMatchup * 0.6, "laneMatchup");
          } else if (finalMatchup <= -4) {
            add(
              "Last-pick into HARD counter (avoid)",
              finalMatchup * 2.5,
              "laneMatchup"
            );
          } else if (finalMatchup < -1) {
            add("Last-pick into counter", finalMatchup * 1, "laneMatchup");
          }
        }
      }
    }
    let banSignal = 0;
    for (const a of meta.archetypes) {
      if (ctx.enemyBannedArchetypes[a] >= 2) banSignal += 0.8;
    }
    if (banSignal > 0) add("Enemy banned archetype", banSignal);
    if (ctx.series && ctx.series.fearless && ctx.series.totalGames - ctx.series.gameIndex - 1 > 0 && !ctx.series.eliminationGame && !ctx.series.closeoutGame && tierValue >= TIER_VALUE.S) {
      const remaining = ctx.series.totalGames - ctx.series.gameIndex - 1;
      const flexMultiplier = 1 + Math.min(2, flex - 1) * 0.25;
      add("Save for later games", -1 * remaining * flexMultiplier);
    }
    if (ctx.series && ctx.series.difficulty !== "easy" && ctx.series.oppPriorIdentities.length > 0) {
      const lastIdentity = ctx.series.oppPriorIdentities[0];
      if (lastIdentity) {
        const counterArchs = COUNTER_ARCHETYPES_FOR_IDENTITY[lastIdentity];
        if (counterArchs) {
          let counterValue = 0;
          for (const a of meta.archetypes) {
            if (counterArchs.has(a)) counterValue += 1.5;
          }
          if (counterValue > 0) {
            add(
              `Counters last game's ${lastIdentity}`,
              Math.min(3, counterValue),
              "crossGameCounter"
            );
          }
        }
      }
      const profile = ctx.series.oppPriorArchetypeProfile;
      if (profile.engage >= 3 && meta.archetypes.includes("peel")) {
        add("Anti-engage prep (opp pattern)", 1, "crossGameCounter");
      }
      if (profile.dive >= 2 && meta.archetypes.includes("peel")) {
        add("Anti-dive prep (opp pattern)", 1, "crossGameCounter");
      }
      if (profile["hyper-carry"] >= 2 && meta.archetypes.includes("dive")) {
        add("Anti-carry dive (opp pattern)", 1, "crossGameCounter");
      }
    }
    if (ctx.series?.tournamentChampionWR && ctx.series.difficulty !== "easy") {
      const entry = ctx.series.tournamentChampionWR.get(candidate.id);
      if (entry && entry.games > 0) {
        const PRIOR_GAMES = 3;
        const PRIOR_WR = 0.5;
        const shrunkWR = (entry.wins + PRIOR_WR * PRIOR_GAMES) / (entry.games + PRIOR_GAMES);
        const delta = shrunkWR - 0.5;
        const bonus = Math.max(-2, Math.min(2, delta * 8));
        if (Math.abs(bonus) >= 0.15) {
          const label = bonus > 0 ? `Tournament hot streak (${entry.wins}-${entry.games - entry.wins})` : `Tournament cold streak (${entry.wins}-${entry.games - entry.wins})`;
          add(label, bonus, "metaTier");
        }
      }
    }
    if (ctx.series?.myChampionWR && ctx.series.difficulty !== "easy") {
      const entry = ctx.series.myChampionWR.get(candidate.id);
      if (entry && entry.games > 0) {
        const PRIOR_GAMES = 2;
        const observed = entry.recentWinRate ?? entry.wins / entry.games;
        const shrunkWR = (observed * entry.games + 0.5 * PRIOR_GAMES) / (entry.games + PRIOR_GAMES);
        const bonus = Math.max(-2.5, Math.min(2.5, (shrunkWR - 0.5) * 9));
        if (Math.abs(bonus) >= 0.15) {
          const losses = entry.games - entry.wins;
          const label = bonus > 0 ? `Team wins on this (${entry.wins}-${losses})` : `Team loses on this (${entry.wins}-${losses})`;
          add(label, bonus, "metaTier");
        }
      }
    }
    if (ctx.series && ctx.series.difficulty !== "easy") {
      const behind = ctx.series.winsBehind < 0;
      const elim = ctx.series.eliminationGame;
      const closeout = ctx.series.closeoutGame;
      if (behind || elim || closeout) {
        let metaWeight = 0;
        if (behind) metaWeight += 0.6;
        if (elim) metaWeight += 1.4;
        else if (closeout) metaWeight += 0.5;
        if (tierValue >= TIER_VALUE.S) {
          const bonus = (tierValue - TIER_VALUE.A) * metaWeight;
          const label = elim ? "Elimination game: meta priority" : behind ? "Behind in series: meta priority" : "Closeout: lock in meta";
          add(label, bonus, "metaTier");
        } else if (tierValue <= TIER_VALUE.C) {
          const penalty = -1.5 * metaWeight;
          add("Avoid off-meta gamble", penalty, "metaTier");
        }
        if (elim && ctx.series.myPriorPicks.size > 0) {
          let priorTierMatch = 0;
          for (const priorId of ctx.series.myPriorPicks) {
            const priorChamp = ctx.byId.get(priorId);
            if (!priorChamp) continue;
            const priorMeta = metaFor(priorChamp);
            let shared = 0;
            for (const a of meta.archetypes) {
              if (priorMeta.archetypes.includes(a)) shared++;
            }
            if (shared >= 2) priorTierMatch++;
          }
          if (priorTierMatch >= 2) {
            add("Don't replay losing comp", -2);
          }
        }
      }
    }
    if (ctx.series && ctx.series.myPriorPicks.size > 0) {
      let archetypeOverlap = 0;
      for (const priorId of ctx.series.myPriorPicks) {
        const priorChamp = ctx.byId.get(priorId);
        if (!priorChamp) continue;
        const priorMeta = metaFor(priorChamp);
        let shared = 0;
        for (const a of meta.archetypes) {
          if (priorMeta.archetypes.includes(a)) shared++;
        }
        if (shared >= 2) archetypeOverlap++;
      }
      if (archetypeOverlap >= 2) {
        const penalty = ctx.series.fearless ? -3 : -1.2;
        add("Comp shape repetition", penalty);
      }
    }
    return { total, intendedLane: bestLane, breakdown };
  }
  function scoreBan(candidate, ctx, explain = false) {
    const breakdown = explain ? [] : void 0;
    const persona = ctx.personality;
    let total = 0;
    function add(label, value, kind) {
      let v = value;
      if (persona && kind !== void 0) {
        const w = persona.weights[kind];
        if (w != null && w !== 1) v = value * w;
      }
      total += v;
      if (breakdown && v !== 0) breakdown.push({ label, value: v });
    }
    const metaOn = getMetaEnabled();
    let bestTierValue = 0;
    if (metaOn) {
      for (const lane of candidate.lanes) {
        const tier = getMetaTier(candidate.alias, lane) ?? "D";
        const v = TIER_VALUE[tier];
        if (v > bestTierValue) bestTierValue = v;
      }
    }
    const tierMul = ctx.isPhase2 ? 1.4 : 2.5;
    if (bestTierValue > 0) {
      add(`Meta tier \xD7 ${tierMul}`, bestTierValue * tierMul, "metaTier");
    }
    add(
      "Flex denial",
      flexLaneCount(candidate) * (ctx.isPhase2 ? 0.6 : 1.4),
      "metaTier"
    );
    const meta = metaFor(candidate);
    const threatMul = ctx.isPhase2 ? 2.5 : 1;
    if (ctx.myCounts["hyper-carry"] >= 1 && ctx.myCounts.peel < 2) {
      if (meta.archetypes.includes("dive") || meta.archetypes.includes("assassin"))
        add("Threat: dive on our carry", 3 * threatMul, "threatBan");
    }
    if (ctx.myCounts.poke >= 2 && meta.archetypes.includes("engage"))
      add("Threat: engage on our poke", 2 * threatMul, "threatBan");
    if (ctx.myCounts.tank === 0 && meta.archetypes.includes("hyper-carry"))
      add("Threat: enemy carry vs no tank", 2 * threatMul, "threatBan");
    const synWithOpp = synergyWith(candidate, ctx.oppPicks, ctx.byId);
    if (synWithOpp > 0) {
      add(
        "Denies enemy synergy",
        synWithOpp * (ctx.isPhase2 ? 2 : 1),
        "synergy"
      );
    }
    if (ctx.series && ctx.series.difficulty !== "easy" && ctx.series.oppPlayers) {
      const comfort = rosterComfortWeight(ctx.series.oppPlayers, candidate.id);
      if (comfort > 0) {
        add(
          "Bans enemy comfort pick",
          (ctx.isPhase2 ? 6 : 5) * comfort,
          "targetBan"
        );
      } else {
        const discomfort = rosterDiscomfortWeight(
          ctx.series.oppPlayers,
          candidate.id
        );
        if (discomfort > 0)
          add("Enemy weak on it", -2 * discomfort, "targetBan");
      }
    }
    if (ctx.enemyAnticipated.has(candidate.id)) {
      add("Anticipates enemy pick", ctx.isPhase2 ? 8 : 4, "targetBan");
    }
    if (ctx.series && ctx.series.difficulty !== "easy" && ctx.series.oppPriorIdentities.length > 0) {
      const lastIdentity = ctx.series.oppPriorIdentities[0];
      if (lastIdentity) {
        const enablers = ENABLER_ARCHETYPES_FOR_IDENTITY[lastIdentity];
        if (enablers) {
          let prepValue = 0;
          for (const a of meta.archetypes) {
            if (enablers.has(a)) prepValue += 1.4;
          }
          if (prepValue > 0) {
            add(
              `Bans ${lastIdentity} enabler`,
              Math.min(4, prepValue) * (ctx.isPhase2 ? 1.4 : 1),
              "crossGameCounter"
            );
          }
        }
      }
      if (!ctx.series.fearless && ctx.series.oppPriorPicks.has(candidate.id)) {
        add("Opp pocket pick", ctx.isPhase2 ? 2.5 : 1.5, "crossGameCounter");
      }
    }
    return { total, breakdown };
  }

  // lib/draftAI/anticipation.ts
  function predictTopK(game, champions, fearlessLocked, k) {
    const action = currentAction(game);
    if (!action || action.kind !== "pick") return [];
    const used = usedChampionsInGame(game);
    const byId = getById(champions);
    const candidates = champions.filter(
      (c) => !used.has(c.id) && !fearlessLocked.has(c.id)
    );
    if (candidates.length === 0) return [];
    const myPicks = picksFor(game, action.side);
    const oppPicks = picksFor(game, action.side === "blue" ? "red" : "blue");
    const myCounts = archetypeCounts(myPicks, byId);
    const myPicksLocked = countNonNull(myPicks);
    const ctx = {
      side: action.side,
      byId,
      champions,
      myPicks,
      oppPicks,
      open: openLanes(myPicks, champions),
      myCounts,
      oppCounts: archetypeCounts(oppPicks, byId),
      myDmg: damageProfile(myPicks, byId),
      myPicksLocked,
      oppLaneAssignment: inferLaneAssignment(oppPicks, champions),
      identity: identityTarget(myCounts, myPicksLocked),
      enemyBannedArchetypes: archetypeCounts(
        bansFor(game, action.side === "blue" ? "red" : "blue"),
        byId
      ),
      series: void 0,
      fearlessLocked,
      game,
      myDamageDealers: damageDealerCount(myPicks, byId),
      myPhase: phaseProfile(myPicks, byId),
      oppPhase: phaseProfile(oppPicks, byId)
    };
    const scored = candidates.map((c) => ({
      id: c.id,
      score: scorePick(c, ctx).total
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map((s) => s.id);
  }
  function lookaheadPenalty(candidate, ctx) {
    if (!nextActionIsEnemyPick(ctx.game, ctx.side)) return 0;
    const hypoGame = applyLock(ctx.game, candidate.id);
    const predicted = predictTopK(hypoGame, ctx.champions, ctx.fearlessLocked, 1);
    if (predicted.length === 0) return 0;
    const enemyChamp = ctx.byId.get(predicted[0]);
    if (!enemyChamp) return 0;
    const matchup = laneMatchup(candidate, enemyChamp);
    if (matchup >= -2) return 0;
    const rawPenalty = matchup * 0.5;
    const remaining = remainingActionsForSide(ctx.game, ctx.side);
    const flexFactor = 1 / (1 + remaining.picks * 0.4);
    return rawPenalty * flexFactor;
  }
  function lookahead2PlyPenalty(candidate, ctx) {
    if (!nextActionIsEnemyPick(ctx.game, ctx.side)) return 0;
    if (ctx.game.actionIndex > 11) return 0;
    const myId = candidate.id;
    const afterMine = applyLock(ctx.game, myId);
    const enemyTop = predictTopK(
      afterMine,
      ctx.champions,
      ctx.fearlessLocked,
      1
    );
    if (enemyTop.length === 0) return 0;
    const afterEnemy = applyLock(afterMine, enemyTop[0]);
    const ourTop = predictTopK(
      afterEnemy,
      ctx.champions,
      ctx.fearlessLocked,
      2
    );
    if (ourTop.length === 0) return 0;
    const ourResponse = ctx.byId.get(ourTop[0]);
    const enemyChamp = ctx.byId.get(enemyTop[0]);
    if (!ourResponse || !enemyChamp) return 0;
    const counterMatchup = laneMatchup(ourResponse, enemyChamp);
    if (counterMatchup >= 2) {
      return 1.5;
    }
    if (counterMatchup <= -2) {
      return -2;
    }
    return 0;
  }
  function predictEnemyAnticipated(game, mySide, champions, fearlessLocked) {
    const set = /* @__PURE__ */ new Set();
    const oppPicks = picksFor(game, mySide === "blue" ? "red" : "blue");
    if (!oppPicks.some((p) => p == null)) return set;
    const enemySide = mySide === "blue" ? "red" : "blue";
    const action = currentAction(game);
    if (!action) return set;
    let synthIndex = -1;
    for (let i = action.index + 1; i < TOTAL_ACTIONS; i++) {
      if (DRAFT_ORDER[i].kind === "pick" && DRAFT_ORDER[i].side === enemySide) {
        synthIndex = i;
        break;
      }
    }
    if (synthIndex < 0) return set;
    const synthGame = { ...game, actionIndex: synthIndex };
    const top = predictTopK(synthGame, champions, fearlessLocked, 3);
    for (const id of top) set.add(id);
    return set;
  }

  // training/dimensions.json
  var dimensions_default = {
    CHAMPION_POOL_SIZE: 200,
    SCALAR_DIMS: 27,
    CHAMP_DIMS: 16,
    STATE_DIM: 3227,
    LEGAL_OFFSET: 4
  };

  // lib/draftAI/neural/stateEncoder.ts
  var CHAMPION_POOL_SIZE = dimensions_default.CHAMPION_POOL_SIZE;
  var SCALAR_DIMS = dimensions_default.SCALAR_DIMS;
  var CHAMP_DIMS = dimensions_default.CHAMP_DIMS;
  var STATE_DIM = dimensions_default.STATE_DIM;
  function buildChampionIndex(champions) {
    if (champions.length > CHAMPION_POOL_SIZE) {
      console.warn(
        `[stateEncoder] Pool de campeones (${champions.length}) excede CHAMPION_POOL_SIZE (${CHAMPION_POOL_SIZE}). Los campeones sobrantes se ignorar\xE1n.`
      );
    }
    const sorted = [...champions].sort((a, b) => a.id - b.id).slice(0, CHAMPION_POOL_SIZE);
    const idToSlot = /* @__PURE__ */ new Map();
    const slotToId = [];
    const slotToAlias = [];
    for (let i = 0; i < sorted.length; i++) {
      idToSlot.set(sorted[i].id, i);
      slotToId.push(sorted[i].id);
      slotToAlias.push(sorted[i].alias);
    }
    return { idToSlot, slotToId, slotToAlias, poolSize: sorted.length };
  }
  var POSITIONAL_LANES2 = [
    "top",
    "jungle",
    "middle",
    "bottom",
    "support"
  ];
  var TIER_NORM = TIER_VALUE["S+"];
  var PLAYER_TIER_VALUE2 = {
    "S+": 6,
    S: 5,
    A: 4,
    B: 3,
    C: 2,
    D: 1
  };
  function getPhaseIndex(actionIndex) {
    if (actionIndex < 6) return 0;
    if (actionIndex < 12) return 1;
    if (actionIndex < 16) return 2;
    return 3;
  }
  function synergyScoreFor(candidate, myPickIds, byId) {
    let total = 0;
    for (const id of myPickIds) {
      if (id == null) continue;
      const ally = byId.get(id);
      if (!ally || ally.id === candidate.id) continue;
      const s = getSynergy(candidate.alias, ally.alias);
      if (s) total += s.bonus;
    }
    return Math.min(6, total);
  }
  function counterScoreFor(candidate, enemyPickIds, byId) {
    let total = 0;
    for (const id of enemyPickIds) {
      if (id == null) continue;
      const enemy = byId.get(id);
      if (!enemy) continue;
      total += laneMatchup(candidate, enemy);
    }
    return total;
  }
  function encodeDraftState(game, champions, champIndex, aiSide, fearlessLocked, seriesCtx) {
    const vec = new Float32Array(STATE_DIM);
    const byId = new Map(champions.map((c) => [c.id, c]));
    let s = 0;
    vec[s++] = game.actionIndex / 19;
    const phaseIdx = getPhaseIndex(game.actionIndex);
    vec[s + phaseIdx] = 1;
    s += 4;
    vec[s++] = aiSide === "blue" ? 1 : 0;
    vec[s++] = aiSide === "red" ? 1 : 0;
    const diff = seriesCtx?.difficulty ?? "normal";
    vec[s++] = diff === "easy" ? 1 : 0;
    vec[s++] = diff === "normal" ? 1 : 0;
    vec[s++] = diff === "hard" ? 1 : 0;
    vec[s++] = seriesCtx?.fearless ? 1 : 0;
    const totalGames = seriesCtx?.totalGames ?? 1;
    const gameIndex = seriesCtx?.gameIndex ?? 0;
    vec[s++] = totalGames > 1 ? gameIndex / (totalGames - 1) : 0;
    const myWins = seriesCtx?.myWins ?? 0;
    const oppWins = seriesCtx?.oppWins ?? 0;
    const winsBehind = seriesCtx?.winsBehind ?? 0;
    vec[s++] = myWins / 3;
    vec[s++] = oppWins / 3;
    vec[s++] = winsBehind / 3;
    vec[s++] = seriesCtx?.eliminationGame ? 1 : 0;
    vec[s++] = seriesCtx?.closeoutGame ? 1 : 0;
    const myPlayers = seriesCtx?.myPlayers;
    for (let lane = 0; lane < 5; lane++) {
      const player = myPlayers?.[lane];
      vec[s++] = player ? PLAYER_TIER_VALUE2[player.tier] / TIER_NORM : 0.5;
    }
    const oppPlayers = seriesCtx?.oppPlayers;
    for (let lane = 0; lane < 5; lane++) {
      const player = oppPlayers?.[lane];
      vec[s++] = player ? PLAYER_TIER_VALUE2[player.tier] / TIER_NORM : 0.5;
    }
    const blueBanSet = new Set(game.blueBans.filter((x) => x != null));
    const redBanSet = new Set(game.redBans.filter((x) => x != null));
    const bluePickSet = new Set(game.bluePicks.filter((x) => x != null));
    const redPickSet = new Set(game.redPicks.filter((x) => x != null));
    const usedSet = /* @__PURE__ */ new Set([
      ...blueBanSet,
      ...redBanSet,
      ...bluePickSet,
      ...redPickSet
    ]);
    const myPickIds = aiSide === "blue" ? game.bluePicks : game.redPicks;
    const enemyPickIds = aiSide === "blue" ? game.redPicks : game.bluePicks;
    const myGoodPool = /* @__PURE__ */ new Set();
    const myBadPool = /* @__PURE__ */ new Set();
    const oppGoodPool = /* @__PURE__ */ new Set();
    if (myPlayers) {
      for (const p of myPlayers) {
        for (const id of p.goodChamps) myGoodPool.add(id);
        for (const id of p.badChamps) myBadPool.add(id);
      }
    }
    if (oppPlayers) {
      for (const p of oppPlayers) {
        for (const id of p.goodChamps) oppGoodPool.add(id);
      }
    }
    for (let slot = 0; slot < champIndex.poolSize; slot++) {
      const champId = champIndex.slotToId[slot];
      const champ = byId.get(champId);
      const base = SCALAR_DIMS + slot * CHAMP_DIMS;
      if (!champ) {
        continue;
      }
      vec[base + 0] = blueBanSet.has(champId) ? 1 : 0;
      vec[base + 1] = redBanSet.has(champId) ? 1 : 0;
      vec[base + 2] = bluePickSet.has(champId) ? 1 : 0;
      vec[base + 3] = redPickSet.has(champId) ? 1 : 0;
      vec[base + 4] = !usedSet.has(champId) && !fearlessLocked.has(champId) ? 1 : 0;
      for (let li = 0; li < 5; li++) {
        const lane = POSITIONAL_LANES2[li];
        const tier = getMetaTier(champ.alias, lane);
        vec[base + 5 + li] = tier ? TIER_VALUE[tier] / TIER_NORM : 0;
      }
      vec[base + 10] = myGoodPool.has(champId) ? 1 : 0;
      vec[base + 11] = oppGoodPool.has(champId) ? 1 : 0;
      vec[base + 12] = myBadPool.has(champId) ? 1 : 0;
      vec[base + 13] = synergyScoreFor(champ, myPickIds, byId) / 6;
      vec[base + 14] = counterScoreFor(champ, enemyPickIds, byId) / 30;
      const twr = seriesCtx?.tournamentChampionWR?.get(champId);
      vec[base + 15] = twr != null ? twr.winRate : 0.5;
    }
    return vec;
  }
  function buildLegalMask(game, champIndex, fearlessLocked) {
    const mask = new Uint8Array(CHAMPION_POOL_SIZE);
    const usedSet = /* @__PURE__ */ new Set([
      ...game.blueBans.filter((x) => x != null),
      ...game.redBans.filter((x) => x != null),
      ...game.bluePicks.filter((x) => x != null),
      ...game.redPicks.filter((x) => x != null)
    ]);
    for (let slot = 0; slot < champIndex.poolSize; slot++) {
      const id = champIndex.slotToId[slot];
      mask[slot] = !usedSet.has(id) && !fearlessLocked.has(id) ? 1 : 0;
    }
    return mask;
  }

  // lib/draftAI/neural/policy.ts
  function linearForward(layer, input) {
    const outDim = layer.b.length;
    const out = new Float64Array(outDim);
    for (let o = 0; o < outDim; o++) {
      let sum = layer.b[o];
      const row = layer.W[o];
      for (let i = 0; i < input.length; i++) {
        sum += row[i] * input[i];
      }
      out[o] = sum;
    }
    return out;
  }
  function relu(x) {
    for (let i = 0; i < x.length; i++) {
      if (x[i] < 0) x[i] = 0;
    }
    return x;
  }
  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }
  function maskedSoftmax(logits, mask) {
    let maxVal = -Infinity;
    for (let i = 0; i < logits.length; i++) {
      if (mask[i] && logits[i] > maxVal) maxVal = logits[i];
    }
    const probs = new Float64Array(logits.length);
    let sumExp = 0;
    for (let i = 0; i < logits.length; i++) {
      if (mask[i]) {
        const e = Math.exp(logits[i] - maxVal);
        probs[i] = e;
        sumExp += e;
      }
    }
    if (sumExp > 0) {
      for (let i = 0; i < probs.length; i++) {
        probs[i] /= sumExp;
      }
    }
    return probs;
  }
  function makeNeuralPolicy(weights) {
    if (weights.state_dim !== STATE_DIM) {
      console.warn(
        `[neuralPolicy] state_dim del modelo (${weights.state_dim}) no coincide con STATE_DIM del encoder (${STATE_DIM}). La inferencia puede ser incorrecta.`
      );
    }
    if (weights.num_actions !== CHAMPION_POOL_SIZE) {
      console.warn(
        `[neuralPolicy] num_actions del modelo (${weights.num_actions}) no coincide con CHAMPION_POOL_SIZE (${CHAMPION_POOL_SIZE}). La inferencia puede ser incorrecta.`
      );
    }
    return {
      chooseAction(stateVec, legalMask) {
        let hidden = new Float64Array(stateVec);
        for (const layer of weights.layers) {
          hidden = relu(linearForward(layer, hidden));
        }
        const logits = linearForward(weights.policy_head, hidden);
        for (let i = 0; i < logits.length; i++) {
          if (!legalMask[i]) logits[i] = -Infinity;
        }
        const probs = maskedSoftmax(logits, legalMask);
        let bestSlot = -1;
        let bestProb = -1;
        for (let i = 0; i < probs.length; i++) {
          if (legalMask[i] && probs[i] > bestProb) {
            bestProb = probs[i];
            bestSlot = i;
          }
        }
        if (bestSlot < 0) {
          for (let i = 0; i < legalMask.length; i++) {
            if (legalMask[i]) {
              bestSlot = i;
              break;
            }
          }
        }
        const result = { actionSlot: bestSlot, probs };
        if (weights.value_head) {
          const valueLogit = linearForward(weights.value_head, hidden);
          result.winProb = sigmoid(valueLogit[0]);
        }
        return result;
      },
      meta: {
        stateDim: weights.state_dim,
        numActions: weights.num_actions,
        hiddenDims: weights.hidden_dims,
        hasValueHead: !!weights.value_head
      }
    };
  }
  function parseNeuralPolicyWeights(raw) {
    try {
      const weights = JSON.parse(raw);
      if (weights.version !== 1) {
        console.warn(`[neuralPolicy] Versi\xF3n de pesos no soportada: ${weights.version}`);
        return null;
      }
      return makeNeuralPolicy(weights);
    } catch (e) {
      console.error("[neuralPolicy] Error parseando pesos JSON:", e);
      return null;
    }
  }
  async function readModelJson(source) {
    if (source.startsWith("http://") || source.startsWith("https://") || source.startsWith("/")) {
      const res = await fetch(source);
      if (!res.ok) return null;
      return res.text();
    }
    try {
      const fs = await import("node:fs/promises");
      return await fs.readFile(source, "utf8");
    } catch {
      return null;
    }
  }
  var _cachedPolicy = null;
  var _cachedPolicyPath = "";
  async function loadNeuralPolicyAsync(weightsPath) {
    if (_cachedPolicy && _cachedPolicyPath === weightsPath) {
      return _cachedPolicy;
    }
    let raw;
    try {
      raw = await readModelJson(weightsPath);
    } catch (e) {
      console.error(`[neuralPolicy] Error al descargar pesos desde ${weightsPath}:`, e);
      return null;
    }
    if (!raw) return null;
    const policy = parseNeuralPolicyWeights(raw);
    if (!policy) return null;
    _cachedPolicy = policy;
    _cachedPolicyPath = weightsPath;
    console.log(`[neuralPolicy] Modelo cargado desde ${weightsPath}`);
    return policy;
  }

  // lib/draftAI/neural/index.ts
  function tryResolvePath(...segments) {
    try {
      const nodePath = __require("path");
      return nodePath.resolve(...segments);
    } catch {
      return "";
    }
  }
  function isNeuralPolicyDisabled() {
    return process.env.NEURAL_DRAFT_DISABLED === "1" || process.env.NEURAL_DRAFT_DISABLED === "true";
  }
  function resolveModelPath() {
    if (process.env.NEURAL_DRAFT_MODEL_PATH) {
      return process.env.NEURAL_DRAFT_MODEL_PATH;
    }
    if (typeof window !== "undefined") {
      return "/models/draft-policy.json";
    }
    const isNode = typeof process !== "undefined" && typeof process.versions !== "undefined" && typeof process.versions.node === "string";
    if (!isNode) {
      return "/models/draft-policy.json";
    }
    return tryResolvePath(__dirname, "../../../public/models/draft-policy.json");
  }
  var _policy = null;
  var _champIndex = null;
  var _champIndexChampions = null;
  var _initialized = false;
  var _initPromise = null;
  function applyLoadedPolicy(champions, resolvedPath, policy) {
    _champIndex = buildChampionIndex(champions);
    _champIndexChampions = champions;
    _policy = policy;
    _initialized = true;
    if (_policy) {
      console.log(
        `[neuralDraft] Pol\xEDtica neural activa \u2014 ${_champIndex.poolSize} campeones, dim=${_policy.meta.stateDim}`
      );
    } else {
      console.log(
        `[neuralDraft] Modelo no encontrado en ${resolvedPath}. Usando IA heur\xEDstica como fallback.`
      );
    }
    return _policy !== null;
  }
  async function initNeuralDraftPolicyAsync(champions, modelPath) {
    if (isNeuralPolicyDisabled()) {
      _initialized = true;
      _policy = null;
      return false;
    }
    if (_initialized && _champIndexChampions === champions) {
      return _policy !== null;
    }
    if (_initPromise && _champIndexChampions === champions) {
      return _initPromise;
    }
    const resolvedPath = modelPath ?? resolveModelPath();
    _initPromise = (async () => {
      const policy = await loadNeuralPolicyAsync(resolvedPath);
      return applyLoadedPolicy(champions, resolvedPath, policy);
    })();
    try {
      return await _initPromise;
    } finally {
      _initPromise = null;
    }
  }
  function chooseNeuralDraftActionWithRationale(game, champions, fearlessLocked, seriesCtx, rng = Math.random, personality) {
    if (!_policy || !_champIndex) return null;
    const action = currentAction(game);
    if (!action) return null;
    if (_champIndexChampions !== champions) {
      _champIndex = buildChampionIndex(champions);
      _champIndexChampions = champions;
    }
    const aiSide = action.side;
    const stateVec = encodeDraftState(
      game,
      champions,
      _champIndex,
      aiSide,
      fearlessLocked,
      seriesCtx
    );
    const legalMask = buildLegalMask(game, _champIndex, fearlessLocked);
    let hasLegal = false;
    for (let i = 0; i < legalMask.length; i++) {
      if (legalMask[i]) {
        hasLegal = true;
        break;
      }
    }
    if (!hasLegal) return null;
    const result = _policy.chooseAction(stateVec, legalMask);
    const championId = _champIndex.slotToId[result.actionSlot];
    if (championId == null) return null;
    const chosenProb = result.probs[result.actionSlot] ?? 0;
    const components = [
      { label: "Neural confidence", value: chosenProb }
    ];
    if (result.winProb != null) {
      components.push({ label: "Win estimate", value: result.winProb });
    }
    const alternatives = [];
    for (let slot = 0; slot < result.probs.length; slot++) {
      if (!legalMask[slot] || slot === result.actionSlot) continue;
      const id = _champIndex.slotToId[slot];
      if (id == null) continue;
      alternatives.push({ championId: id, score: result.probs[slot] });
    }
    alternatives.sort((a, b) => b.score - a.score);
    return {
      kind: action.kind,
      championId,
      intendedLane: null,
      components,
      total: chosenProb,
      identityLabel: null,
      alternatives: alternatives.slice(0, 3)
    };
  }

  // lib/draftAI/personalities.ts
  var DEFAULT_PERSONALITY_ID = "balanced";
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
  function getPersonality(id) {
    if (id == null) return PERSONALITIES[DEFAULT_PERSONALITY_ID];
    return PERSONALITIES[id] ?? PERSONALITIES[DEFAULT_PERSONALITY_ID];
  }

  // lib/draftAI/index.ts
  function seriesAIContextFrom(series, mySide, champions, tournamentChampionWR, forms, teamChampionWR) {
    const myPriorPicks = /* @__PURE__ */ new Set();
    const oppPriorPicks = /* @__PURE__ */ new Set();
    const lastIdx = series.games.length - 1;
    const myTeamName = mySide === "blue" ? series.blueTeam : series.redTeam;
    const oppTeamName = mySide === "blue" ? series.redTeam : series.blueTeam;
    const oppPriorPicksByGame = [];
    for (let i = 0; i < lastIdx; i++) {
      const g = series.games[i];
      const myWasBlue = g.blueTeam === myTeamName;
      const myPicks = myWasBlue ? g.bluePicks : g.redPicks;
      const oppPicks = myWasBlue ? g.redPicks : g.bluePicks;
      for (const id of myPicks) if (id != null) myPriorPicks.add(id);
      for (const id of oppPicks) if (id != null) oppPriorPicks.add(id);
      oppPriorPicksByGame.push(oppPicks.filter((id) => id != null));
    }
    const oppPriorIdentities = [];
    const oppPriorArchetypeProfile = {
      engage: 0,
      peel: 0,
      poke: 0,
      dive: 0,
      pick: 0,
      wombo: 0,
      "hyper-carry": 0,
      splitpush: 0,
      assassin: 0,
      tank: 0,
      enchanter: 0,
      burst: 0,
      skirmish: 0,
      sustain: 0
    };
    if (champions) {
      const byId = getById(champions);
      for (let i = oppPriorPicksByGame.length - 1; i >= 0; i--) {
        const ids = oppPriorPicksByGame[i];
        const counts = archetypeCounts(ids, byId);
        for (const a of Object.keys(counts)) {
          oppPriorArchetypeProfile[a] += counts[a];
        }
        const picksLocked = ids.length;
        const identity = identityTarget(counts, picksLocked);
        oppPriorIdentities.push(identity?.label ?? null);
      }
    }
    const wins = winsByTeamName(series);
    const myWins = wins.get(myTeamName) ?? 0;
    const oppWins = wins.get(oppTeamName) ?? 0;
    const need = requiredWins(series.format);
    const isSeries = maxGames(series.format) > 1;
    const eliminationGame = isSeries && oppWins === need - 1 && myWins < need;
    const closeoutGame = isSeries && myWins === need - 1 && oppWins < need;
    return {
      fearless: series.fearless,
      gameIndex: series.games.length - 1,
      totalGames: maxGames(series.format),
      // Use the side-specific difficulty if set (AI vs AI handicaps), else
      // fall back to the series-wide aiDifficulty.
      difficulty: difficultyForSide(series, mySide),
      myPriorPicks,
      oppPriorPicks,
      oppPriorIdentities,
      oppPriorArchetypeProfile,
      myWins,
      oppWins,
      winsBehind: myWins - oppWins,
      eliminationGame,
      closeoutGame,
      tournamentChampionWR,
      // Roster for the side this AI is drafting. blue*/red* always track the
      // current sides (startNextGame swaps them), so a simple side lookup is
      // correct even after a mid-series side swap.
      myPlayers: mySide === "blue" ? series.bluePlayers : series.redPlayers,
      // The opponent's roster ? the OTHER side.
      oppPlayers: mySide === "blue" ? series.redPlayers : series.bluePlayers,
      // Project this side's lane forms, if a form source was supplied.
      myForms: forms ? sideFormsFor(forms.map, (forms.keyFor ?? ((n2) => n2))(myTeamName)) : void 0,
      // This side's own champion win rate, selected by team name.
      myChampionWR: teamChampionWR?.get(myTeamName)
    };
  }
  function knobsFor(difficulty) {
    switch (difficulty) {
      case "easy":
        return {
          pickTopN: 5,
          pickTemperature: 3.5,
          banTopN: 5,
          banTemperature: 3,
          enableLookahead: false,
          enable2PlyLookahead: false,
          enableAnticipation: false,
          enableIdentity: false,
          enablePocketPicks: true
        };
      case "hard":
        return {
          pickTopN: 2,
          pickTemperature: 0.9,
          banTopN: 2,
          banTemperature: 0.8,
          enableLookahead: true,
          // 2-ply only on hard ? costly (~500ms extra on B1/R1/R2). The
          // strategic edge against a human player is worth it.
          enable2PlyLookahead: true,
          enableAnticipation: true,
          enableIdentity: true,
          enablePocketPicks: false
        };
      case "normal":
      default:
        return {
          pickTopN: PICK_TOP_N,
          pickTemperature: PICK_TEMPERATURE,
          banTopN: BAN_TOP_N,
          banTemperature: BAN_TEMPERATURE,
          enableLookahead: true,
          enable2PlyLookahead: false,
          enableAnticipation: true,
          enableIdentity: true,
          enablePocketPicks: true
        };
    }
  }
  function applyPersonalityKnobs(knobs, personality) {
    const s = personality?.sampling;
    if (!s) return knobs;
    const out = { ...knobs };
    if (s.pickTemperatureMul != null && s.pickTemperatureMul !== 1) {
      out.pickTemperature = Math.max(
        0.1,
        knobs.pickTemperature * s.pickTemperatureMul
      );
    }
    if (s.banTemperatureMul != null && s.banTemperatureMul !== 1) {
      out.banTemperature = Math.max(
        0.1,
        knobs.banTemperature * s.banTemperatureMul
      );
    }
    if (s.pickTopNDelta) {
      out.pickTopN = Math.max(1, knobs.pickTopN + s.pickTopNDelta);
    }
    if (s.banTopNDelta) {
      out.banTopN = Math.max(1, knobs.banTopN + s.banTopNDelta);
    }
    return out;
  }
  function chooseAIAction(game, champions, fearlessLocked, seriesCtx, rng = Math.random, personality) {
    return chooseAIActionWithRationale(
      game,
      champions,
      fearlessLocked,
      seriesCtx,
      rng,
      personality
    )?.championId ?? null;
  }
  function chooseAIActionWithRationale(game, champions, fearlessLocked, seriesCtx, rng = Math.random, personality) {
    const neuralResult = chooseNeuralDraftActionWithRationale(
      game,
      champions,
      fearlessLocked,
      seriesCtx,
      rng,
      personality
    );
    if (neuralResult !== null) return neuralResult;
    const action = currentAction(game);
    if (!action) return null;
    const used = usedChampionsInGame(game);
    const byId = getById(champions);
    const candidates = champions.filter(
      (c) => !used.has(c.id) && !fearlessLocked.has(c.id)
    );
    if (candidates.length === 0) return null;
    const knobs = applyPersonalityKnobs(
      knobsFor(seriesCtx?.difficulty ?? "normal"),
      personality
    );
    if (action.kind === "pick") {
      return decidePick(
        action.side,
        game,
        champions,
        byId,
        candidates,
        fearlessLocked,
        seriesCtx,
        knobs,
        rng,
        personality
      );
    }
    return decideBan(
      action,
      game,
      champions,
      byId,
      candidates,
      fearlessLocked,
      knobs,
      seriesCtx,
      rng,
      personality
    );
  }
  function decidePick(side, game, champions, byId, candidates, fearlessLocked, seriesCtx, knobs, rng = Math.random, personality) {
    const myPicks = picksFor(game, side);
    const oppPicks = picksFor(game, side === "blue" ? "red" : "blue");
    const enemyBans = bansFor(game, side === "blue" ? "red" : "blue");
    const myCounts = archetypeCounts(myPicks, byId);
    const myPicksLocked = countNonNull(myPicks);
    const identity = knobs.enableIdentity ? identityTarget(myCounts, myPicksLocked) : null;
    const ctx = {
      side,
      byId,
      champions,
      myPicks,
      oppPicks,
      open: openLanes(myPicks, champions),
      myCounts,
      oppCounts: archetypeCounts(oppPicks, byId),
      myDmg: damageProfile(myPicks, byId),
      myPicksLocked,
      oppLaneAssignment: inferLaneAssignment(oppPicks, champions),
      identity,
      enemyBannedArchetypes: archetypeCounts(enemyBans, byId),
      series: seriesCtx,
      fearlessLocked,
      game,
      myDamageDealers: damageDealerCount(myPicks, byId),
      myPhase: phaseProfile(myPicks, byId),
      oppPhase: phaseProfile(oppPicks, byId),
      personality
    };
    const scored = candidates.map((c) => {
      const r = scorePick(c, ctx, false);
      return { item: c, score: r.total + rng() * 1 };
    });
    if (knobs.enableLookahead && nextActionIsEnemyPick(game, side)) {
      const lookW = personality?.weights.lookahead ?? 1;
      const scaleLook = lookW !== 1;
      scored.sort((a, b) => b.score - a.score);
      for (let i = 0; i < Math.min(LOOKAHEAD_TOP_K, scored.length); i++) {
        const pen = lookaheadPenalty(scored[i].item, ctx);
        scored[i].score += scaleLook ? pen * lookW : pen;
        if (knobs.enable2PlyLookahead) {
          const pen2 = lookahead2PlyPenalty(scored[i].item, ctx);
          scored[i].score += scaleLook ? pen2 * lookW : pen2;
        }
      }
    }
    const pocketProb = personality?.pocketPickProbMul != null && personality.pocketPickProbMul !== 1 ? POCKET_PICK_PROB * personality.pocketPickProbMul : POCKET_PICK_PROB;
    const wildcard = knobs.enablePocketPicks && rng() < pocketProb;
    const topN = wildcard ? POCKET_PICK_TOP_N : knobs.pickTopN;
    const chosen = sampleTopN(scored, topN, knobs.pickTemperature, rng) ?? candidates[0];
    const chosenEntry = scored.find((s) => s.item.id === chosen.id);
    const explained = scorePick(chosen, ctx, true);
    const components = (explained.breakdown ?? []).slice();
    const total = chosenEntry?.score ?? explained.total;
    const residual = total - explained.total;
    if (Math.abs(residual) > 1e-9) {
      components.push({ label: "Selection jitter / lookahead", value: residual });
    }
    components.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const alternatives = scored.slice().sort((a, b) => b.score - a.score).filter((s) => s.item.id !== chosen.id).slice(0, 3).map((s) => ({ championId: s.item.id, score: s.score }));
    const rationale = {
      kind: "pick",
      championId: chosen.id,
      intendedLane: explained.intendedLane,
      components,
      total,
      identityLabel: identity?.label ?? null,
      alternatives
    };
    if (personality && personality.id !== "balanced") {
      rationale.personalityId = personality.id;
    }
    return rationale;
  }
  function decideBan(action, game, champions, byId, candidates, fearlessLocked, knobs, seriesCtx, rng = Math.random, personality) {
    const myPicks = picksFor(game, action.side);
    const oppPicks = picksFor(game, action.side === "blue" ? "red" : "blue");
    const myCounts = archetypeCounts(myPicks, byId);
    const enemyAnticipated = knobs.enableAnticipation ? predictEnemyAnticipated(game, action.side, champions, fearlessLocked) : /* @__PURE__ */ new Set();
    const ctx = {
      byId,
      myCounts,
      oppPicks,
      isPhase2: action.index >= 12,
      enemyAnticipated,
      series: seriesCtx,
      personality
    };
    const scored = candidates.map((c) => {
      const r = scoreBan(c, ctx, false);
      return { item: c, score: r.total + rng() * 0.6 };
    });
    const chosen = sampleTopN(scored, knobs.banTopN, knobs.banTemperature, rng) ?? candidates[0];
    const chosenEntry = scored.find((s) => s.item.id === chosen.id);
    const explained = scoreBan(chosen, ctx, true);
    const components = (explained.breakdown ?? []).slice();
    const total = chosenEntry?.score ?? explained.total;
    const residual = total - explained.total;
    if (Math.abs(residual) > 1e-9) {
      components.push({ label: "Selection jitter", value: residual });
    }
    components.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const alternatives = scored.slice().sort((a, b) => b.score - a.score).filter((s) => s.item.id !== chosen.id).slice(0, 3).map((s) => ({ championId: s.item.id, score: s.score }));
    const rationale = {
      kind: "ban",
      championId: chosen.id,
      intendedLane: null,
      components,
      total,
      identityLabel: null,
      alternatives
    };
    if (personality && personality.id !== "balanced") {
      rationale.personalityId = personality.id;
    }
    return rationale;
  }

  // lib/sim/descriptions.ts
  var POSITIONAL_LANES3 = [
    "top",
    "jungle",
    "middle",
    "bottom",
    "support"
  ];
  var DRAGON_TYPES = [
    "Infernal",
    "Ocean",
    "Mountain",
    "Cloud",
    "Hextech",
    "Chemtech"
  ];
  var NO_KILLS = { blue: 0, red: 0 };
  var ROLE_TANK = "tank";
  var ROLE_FIGHTER = "fighter";
  var ROLE_MAGE = "mage";
  var ROLE_MARKSMAN = "marksman";
  var ROLE_ASSASSIN = "assassin";
  function formatTime(min) {
    const m = Math.floor(min);
    const s = Math.round((min - m) * 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  function pickRandom(arr, rng = Math.random) {
    return arr[Math.floor(rng() * arr.length)];
  }
  function rollInt(lo, hi, rng = Math.random) {
    return Math.floor(rng() * (hi - lo + 1)) + lo;
  }
  function jitter(min, max, rng = Math.random) {
    return min + rng() * (max - min);
  }
  function killsForSide(side, winnerKills, loserKills) {
    return side === "blue" ? { blue: winnerKills, red: loserKills } : { blue: loserKills, red: winnerKills };
  }
  function rolesOf(c) {
    return new Set(c.roles.map((r) => r.toLowerCase()));
  }
  function isAP2(c) {
    return rolesOf(c).has(ROLE_MAGE);
  }
  function isAD2(c) {
    const r = rolesOf(c);
    if (r.has(ROLE_MARKSMAN) || r.has(ROLE_ASSASSIN)) return true;
    if (r.has(ROLE_FIGHTER) && !r.has(ROLE_MAGE)) return true;
    return false;
  }
  function fallbackMeta(c) {
    const r = rolesOf(c);
    const archetypes = [];
    if (r.has(ROLE_TANK)) archetypes.push("tank", "engage");
    if (r.has(ROLE_FIGHTER) && !r.has(ROLE_TANK))
      archetypes.push("skirmish", "dive");
    if (r.has(ROLE_MARKSMAN)) archetypes.push("hyper-carry");
    if (r.has(ROLE_ASSASSIN)) archetypes.push("assassin");
    if (r.has(ROLE_MAGE)) archetypes.push("burst");
    if (r.has("support")) archetypes.push("peel");
    let phase = "mid";
    if (r.has(ROLE_MARKSMAN) || r.has(ROLE_MAGE)) phase = "mid-late";
    else if (r.has(ROLE_ASSASSIN)) phase = "mid";
    else if (r.has(ROLE_FIGHTER) && !r.has(ROLE_TANK)) phase = "mid";
    let mobility = "low";
    if (r.has(ROLE_ASSASSIN)) mobility = "high";
    else if (r.has(ROLE_FIGHTER) && !r.has(ROLE_TANK)) mobility = "medium";
    else if (r.has(ROLE_MARKSMAN)) mobility = "medium";
    return {
      phase,
      archetypes: archetypes.length > 0 ? archetypes : ["skirmish"],
      cc: r.has(ROLE_TANK) || r.has("support") ? "hard" : "soft",
      mobility,
      metaTiers: {}
    };
  }
  function metaFor2(c) {
    return getChampionMeta(c.alias) ?? fallbackMeta(c);
  }
  function laneOf(picks, lane) {
    const idx = POSITIONAL_LANES3.indexOf(lane);
    return idx >= 0 ? picks[idx] : null;
  }
  function findByArchetype(picks, archetypes) {
    for (const c of picks) {
      if (!c) continue;
      const meta = metaFor2(c);
      if (archetypes.some((a) => meta.archetypes.includes(a))) return c;
    }
    return null;
  }
  function findSquishy(picks) {
    const squishyArchetypes = [
      "hyper-carry",
      "enchanter",
      "burst",
      "poke"
    ];
    return findByArchetype(picks, squishyArchetypes) ?? picks.find((c) => c != null) ?? null;
  }
  function lateScalingCount(picks) {
    let n2 = 0;
    for (const c of picks) {
      if (!c) continue;
      const m = metaFor2(c);
      if (m.phase === "late" || m.phase === "mid-late") n2++;
    }
    return n2;
  }
  function earlyCount(picks) {
    let n2 = 0;
    for (const c of picks) {
      if (!c) continue;
      if (metaFor2(c).phase === "early") n2++;
    }
    return n2;
  }
  function teamName(side, blueName, redName) {
    return side === "blue" ? blueName : redName;
  }
  function killVerb(killer, rng = Math.random) {
    const meta = metaFor2(killer);
    const has = (a) => meta.archetypes.includes(a);
    if (has("pick"))
      return pickRandom(["lands a hook on", "snipes", "catches"], rng);
    if (has("assassin"))
      return pickRandom(["all-ins", "deletes", "blows up"], rng);
    if (has("dive") && has("engage"))
      return pickRandom(["tower-dives", "flank-engages on"], rng);
    if (has("skirmish")) return pickRandom(["outduels", "1v1s"], rng);
    if (has("burst")) return pickRandom(["one-shots", "burns down"], rng);
    if (has("hyper-carry")) return "kites down";
    return "catches";
  }
  function spreadLaneGold(amount, side) {
    const sign = side === "blue" ? 1 : -1;
    const each = sign * amount / 5;
    return { top: each, jungle: each, middle: each, bottom: each, support: each };
  }
  function singleLaneGold(lane, amount, side) {
    const sign = side === "blue" ? 1 : -1;
    return { [lane]: sign * amount };
  }
  function gankLaneGold(lane, killGold, side) {
    const sign = side === "blue" ? 1 : -1;
    return {
      [lane]: sign * killGold * 0.6,
      jungle: sign * killGold * 0.4
    };
  }
  function supportRoamLaneGold(targetLane, killGold, adcPenalty, side) {
    const sign = side === "blue" ? 1 : -1;
    return {
      [targetLane]: sign * killGold * 0.6,
      support: sign * killGold * 0.4,
      bottom: -sign * adcPenalty
    };
  }
  function describeSupportRoam(side, picks, targetLane, blueName, redName) {
    const sup = laneOf(picks, "support");
    const adc = laneOf(picks, "bottom");
    const laner = laneOf(picks, targetLane);
    const laneShort = targetLane === "middle" ? "mid" : targetLane;
    const who = sup?.name ?? `${teamName(side, blueName, redName)}'s support`;
    const helped = laner ? ` with ${laner.name}` : "";
    const left = adc ? `, leaving ${adc.name} alone bot` : "";
    return `${who} roams ${laneShort} for a kill${helped}${left}`;
  }
  function sideLaneGoldSplit(amount, side) {
    const sign = side === "blue" ? 1 : -1;
    return {
      top: sign * amount * 0.4,
      bottom: sign * amount * 0.4,
      middle: sign * amount * 0.1,
      jungle: sign * amount * 0.05,
      support: sign * amount * 0.05
    };
  }
  function firstBloodKillerLane(winnerPicks) {
    const killer = findByArchetype(winnerPicks, ["assassin", "skirmish", "pick", "dive"]) ?? winnerPicks.find((c) => c != null);
    if (!killer) return null;
    const idx = winnerPicks.indexOf(killer);
    return idx >= 0 ? POSITIONAL_LANES3[idx] : null;
  }
  function describeFirstBlood(side, winnerPicks, loserPicks, earlyTime, rng = Math.random) {
    const killer = findByArchetype(winnerPicks, ["assassin", "skirmish", "pick", "dive"]) ?? winnerPicks.find((c) => c != null);
    const victim = findSquishy(loserPicks);
    const places = [
      "in the river",
      "post-back",
      "in a 2v2 trade",
      "in the enemy jungle",
      "fighting over the scuttle"
    ];
    let prefix = "";
    if (earlyTime < 3.4) prefix = "AN EARLY first blood \u2014 ";
    else if (earlyTime > 5) prefix = "Late first blood \u2014 ";
    if (killer && victim) {
      return `${prefix}${killer.name} ${killVerb(killer, rng)} ${victim.name} ${pickRandom(places, rng)}`;
    }
    return `${prefix}First blood for ${teamName(side, "Blue", "Red")}`;
  }
  function describeDragon(side, blueName, redName, stack, drakeType, stolen = false) {
    const ord = stack === 1 ? "first" : stack === 2 ? "second" : stack === 3 ? "third" : "fourth";
    if (stolen) {
      return `STOLEN! ${teamName(side, blueName, redName)} smites ${drakeType} Drake away (${ord})`;
    }
    return `${teamName(side, blueName, redName)} secures ${drakeType} Drake (${ord})`;
  }
  function describeSoul(side, blueName, redName, drakeType) {
    return `${teamName(side, blueName, redName)} claims ${drakeType} SOUL`;
  }
  function describeAtakhan(side, blueName, redName, variant) {
    const buff = variant === "Voracious" ? "extra gold from kills" : "Blood Roses for revives";
    return `${teamName(side, blueName, redName)} kills ${variant} Atakhan \u2014 ${buff}`;
  }
  function describeGrubs(side, blueName, redName, count) {
    return `${teamName(side, blueName, redName)} secures ${count} Voidgrub${count === 1 ? "" : "s"}`;
  }
  function describeHerald(side, blueName, redName, rng = Math.random) {
    const lanes = ["top", "middle"];
    const lane = pickRandom(lanes, rng);
    return `${teamName(side, blueName, redName)} grabs Rift Herald, smashes ${lane} tier-1`;
  }
  function describeTower(side, picks, blueName, redName, isFirst, rng = Math.random) {
    const splitPush = findByArchetype(picks, ["splitpush"]);
    if (splitPush && rng() < 0.55) {
      const sideLane = splitPush.lanes.includes("top") ? "top" : splitPush.lanes.includes("bottom") ? "bottom" : "top";
      return `${splitPush.name} solo-pushes ${isFirst ? "the outer" : "an inner"} ${sideLane} tower`;
    }
    const lanes = ["top", "middle", "bottom"];
    const tier = isFirst ? "outer" : "inner";
    return `${teamName(side, blueName, redName)} takes the ${tier} ${pickRandom(lanes, rng)} tower`;
  }
  function describeInhibitor(side, picks, blueName, redName, rng = Math.random) {
    const splitPush = findByArchetype(picks, ["splitpush"]);
    const lanes = ["top", "middle", "bottom"];
    const lane = pickRandom(lanes, rng);
    if (splitPush && rng() < 0.4) {
      return `${splitPush.name} cracks the ${lane} inhibitor \u2014 super minions inbound`;
    }
    return `${teamName(side, blueName, redName)} breaks the ${lane} inhibitor`;
  }
  function describePick(side, winnerPicks, loserPicks, rng = Math.random) {
    const hooker = findByArchetype(winnerPicks, ["pick"]);
    const target = findSquishy(loserPicks);
    if (hooker && target) {
      const places = [
        "in the fog",
        "stepping onto a ward",
        "after a back",
        "near Baron pit"
      ];
      return `${hooker.name} ${killVerb(hooker, rng)} ${target.name} ${pickRandom(places, rng)}`;
    }
    return `${teamName(side, "Blue", "Red")} picks off a stray`;
  }
  var TEAMFIGHT_CARRY = ["wombo", "burst", "hyper-carry", "engage"];
  var SKIRMISH_CARRY = [
    "wombo",
    "engage",
    "burst",
    "assassin",
    "skirmish"
  ];
  function describeSkirmish(side, winnerPicks, winnerKills, loserKills, rng = Math.random) {
    const carry = findByArchetype(winnerPicks, SKIRMISH_CARRY) ?? winnerPicks.find((c) => c != null);
    const places = ["the river", "bot side jungle", "top side jungle", "mid lane"];
    const where = pickRandom(places, rng);
    const fightSize = pickRandom(["2v2", "3v3", "3v2"], rng);
    if (carry) {
      return `${carry.name} wins a ${fightSize} in ${where} (${winnerKills}-${loserKills})`;
    }
    return `${fightSize} in ${where} \u2014 ${teamName(side, "Blue", "Red")} ahead ${winnerKills}-${loserKills}`;
  }
  function describeTeamfight(side, winnerPicks, winnerLabel, winnerKills, loserKills, rng = Math.random) {
    const score = `${winnerKills}-${loserKills}`;
    const places = ["dragon pit", "Baron pit", "mid lane", "river", "tri-bush"];
    const place = pickRandom(places, rng);
    const tag = winnerLabel ? ` \u2014 ${winnerLabel} hits` : "";
    const carry = findByArchetype(winnerPicks, TEAMFIGHT_CARRY);
    const opener = winnerKills - loserKills >= 4 ? "MASSIVE fight at" : "5v5 at";
    if (carry && rng() < 0.6) {
      return `${opener} ${place}, ${carry.name} pops off ${score}${tag}`;
    }
    return `${opener} ${place}, ${teamName(side, "Blue", "Red")} wins ${score}${tag}`;
  }
  function describeBaron(side, winnerPicks, blueName, redName, stolen, contestKills, rng = Math.random) {
    const smiter = laneOf(winnerPicks, "jungle");
    if (stolen && smiter) {
      return `STOLEN! ${smiter.name} smites Baron Nashor away`;
    }
    if (smiter && rng() < 0.4) {
      return `${smiter.name} secures Baron Nashor (${contestKills.winner}-${contestKills.loser})`;
    }
    return `${teamName(side, blueName, redName)} takes Baron Nashor (${contestKills.winner}-${contestKills.loser})`;
  }
  function describeAce(side, blueName, redName) {
    return `${teamName(side, blueName, redName)} ACES \u2014 bases wide open`;
  }
  function describeElder(side, blueName, redName, stolen) {
    return stolen ? `STOLEN Elder! ${teamName(side, blueName, redName)} clutches the smite` : `${teamName(side, blueName, redName)} kills Elder Dragon`;
  }
  function describeNexus(side, blueName, redName, time) {
    return `${teamName(side, blueName, redName)} destroys the Nexus at ${time}`;
  }
  function describeSoloKill(side, winnerPicks, lane) {
    const idx = POSITIONAL_LANES3.indexOf(lane);
    const winnerChamp = winnerPicks[idx];
    const laneShort = lane === "middle" ? "mid" : lane === "bottom" ? "bot" : lane;
    if (!winnerChamp) return `Solo kill in ${laneShort}`;
    return `${winnerChamp.name} solo-kills in ${laneShort}`;
  }
  function describeGank(side, picks, lane, blueName, redName) {
    const jg = picks[POSITIONAL_LANES3.indexOf("jungle")];
    const idx = POSITIONAL_LANES3.indexOf(lane);
    const laner = picks[idx];
    const laneShort = lane === "middle" ? "mid" : lane === "bottom" ? "bot" : lane;
    if (jg && laner) {
      return `${jg.name} ganks ${laneShort} for ${laner.name}`;
    }
    return `${teamName(side, blueName, redName)} successful ${laneShort} gank`;
  }
  function describeCounterGank(side, picks, blueName, redName) {
    const jg = picks[POSITIONAL_LANES3.indexOf("jungle")];
    if (jg) {
      return `${jg.name} counter-ganks the play`;
    }
    return `${teamName(side, blueName, redName)} flips the gank`;
  }
  function describePlates(side, picks, blueName, redName, rng = Math.random) {
    const pusher = findByArchetype(picks, ["splitpush", "poke"]);
    const lanes = ["top", "middle", "bottom"];
    const lane = pickRandom(lanes, rng);
    const laneShort = lane === "middle" ? "mid" : lane === "bottom" ? "bot" : lane;
    if (pusher) {
      return `${pusher.name} cracks all plates ${laneShort}`;
    }
    return `${teamName(side, blueName, redName)} secures plates ${laneShort}`;
  }
  function describeInvade(side, winnerPicks, loserPicks, blueName, redName, rng = Math.random) {
    const engager = findByArchetype(winnerPicks, ["engage", "pick", "tank"]) ?? winnerPicks.find((c) => c != null);
    const victim = findSquishy(loserPicks);
    const place = pickRandom(
      ["enemy red buff", "enemy blue buff", "enemy raptors", "tri-bush"],
      rng
    );
    if (engager && victim) {
      return `LEVEL ONE \u2014 ${engager.name} catches ${victim.name} at ${place}`;
    }
    return `${teamName(side, blueName, redName)} wins the level 1 invade at ${place}`;
  }
  function describeScuttle(side, picks, blueName, redName, rng = Math.random) {
    const jg = picks[POSITIONAL_LANES3.indexOf("jungle")];
    const where = pickRandom(["bot side", "top side"], rng);
    if (jg) {
      return `${jg.name} fights for ${where} scuttler \u2014 wins the crab`;
    }
    return `${teamName(side, blueName, redName)} secures ${where} scuttle`;
  }
  function describeRoam(side, picks, targetLane, blueName, redName, roamerLane) {
    const midIdx = POSITIONAL_LANES3.indexOf("middle");
    const supIdx = POSITIONAL_LANES3.indexOf("support");
    const roamer = (roamerLane != null ? laneOf(picks, roamerLane) : null) ?? findByArchetype(picks, ["assassin", "pick", "burst"]) ?? picks[midIdx] ?? picks[supIdx];
    const laneShort = targetLane === "middle" ? "mid" : targetLane === "bottom" ? "bot" : targetLane;
    if (roamer) {
      return `${roamer.name} roams to ${laneShort}, picks up a kill`;
    }
    return `${teamName(side, blueName, redName)} roams ${laneShort} for a kill`;
  }
  function describeBuffSteal(side, picks, blueName, redName, rng = Math.random) {
    const jg = picks[POSITIONAL_LANES3.indexOf("jungle")];
    const buff = pickRandom(["red buff", "blue buff", "raptors", "krugs"], rng);
    if (jg) {
      return `${jg.name} invades the enemy jungle, steals ${buff}`;
    }
    return `${teamName(side, blueName, redName)} steals enemy ${buff}`;
  }
  function shutdownVictim(loserPicks) {
    return findByArchetype(loserPicks, ["hyper-carry", "burst", "assassin"]) ?? findSquishy(loserPicks);
  }
  function shutdownVictimLane(loserPicks) {
    const victim = shutdownVictim(loserPicks);
    if (!victim) return null;
    const idx = loserPicks.indexOf(victim);
    return idx >= 0 ? POSITIONAL_LANES3[idx] : null;
  }
  function describeShutdown(side, winnerPicks, loserPicks, bounty, killerLane) {
    const killer = (killerLane != null ? laneOf(winnerPicks, killerLane) : null) ?? findByArchetype(winnerPicks, ["assassin", "pick", "burst", "skirmish"]) ?? winnerPicks.find((c) => c != null);
    const victim = shutdownVictim(loserPicks);
    if (killer && victim) {
      return `SHUTDOWN! ${killer.name} collects ${bounty}g bounty on ${victim.name}`;
    }
    return `Shutdown \u2014 ${bounty}g bounty cashed in`;
  }
  function describeBackdoor(side, picks, blueName, redName) {
    const splitter = findByArchetype(picks, ["splitpush", "skirmish"]) ?? picks.find((c) => c != null);
    if (splitter) {
      return `BACKDOOR! ${splitter.name} sneaks in alone, smashes the Nexus`;
    }
    return `${teamName(side, blueName, redName)} backdoors the Nexus`;
  }
  function describeVision(side, winnerPicks, loserPicks, blueName, redName, rng = Math.random, watcherLane) {
    const watcher = (watcherLane != null ? laneOf(winnerPicks, watcherLane) : null) ?? findByArchetype(winnerPicks, ["pick", "engage", "tank"]) ?? laneOf(winnerPicks, "support") ?? winnerPicks.find((c) => c != null);
    const victim = findSquishy(loserPicks);
    const place = pickRandom(
      [
        "the Baron pit bush",
        "tri-bush",
        "drake pit",
        "river entrance",
        "the lane brush"
      ],
      rng
    );
    if (watcher && victim) {
      return `${watcher.name} drops a control ward in ${place} \u2014 ${victim.name} steps on it`;
    }
    return `${teamName(side, blueName, redName)} reads the map, lands a vision-pick at ${place}`;
  }
  function describeOutplay(side, winnerPicks, loserPicks, outnumberedBy, rng = Math.random, heroLane) {
    const star = (heroLane != null ? laneOf(winnerPicks, heroLane) : null) ?? findByArchetype(winnerPicks, ["assassin", "skirmish", "hyper-carry", "burst"]) ?? winnerPicks.find((c) => c != null);
    const place = pickRandom(
      ["the side lane", "river", "tri-bush", "their own jungle"],
      rng
    );
    const ratio = outnumberedBy >= 3 ? "1v3" : "1v2";
    if (star) {
      const flair = pickRandom(["OUTPLAY!", "INSANE!", "WHAT A PLAY!"], rng);
      return `${flair} ${star.name} wins a ${ratio} in ${place}`;
    }
    return `Outplay \u2014 ${teamName(side, "Blue", "Red")} wins a ${ratio} in ${place}`;
  }
  function describeObjectiveTrade(side, blueName, redName, giveUp, takeFor) {
    const labels = {
      drake: "Drake",
      herald: "Herald",
      tower: "tower",
      plates: "plates"
    };
    return `Cross-map: ${teamName(side, blueName, redName)} trades ${labels[giveUp]} for ${labels[takeFor]}`;
  }
  function describeComebackStand(side, winnerPicks, loserPicks, rng = Math.random) {
    const hero = findByArchetype(winnerPicks, [
      "hyper-carry",
      "skirmish",
      "tank",
      "engage"
    ]) ?? winnerPicks.find((c) => c != null);
    const victim = findSquishy(loserPicks);
    const flair = pickRandom(
      ["THE STAND!", "NOT TODAY!", "DEFIANCE!", "HELD THE LINE!"],
      rng
    );
    if (hero && victim) {
      return `${flair} ${hero.name} anchors a desperation hold, blows up ${victim.name} \u2014 the deficit shrinks`;
    }
    if (hero) {
      return `${flair} ${hero.name} anchors a desperation hold \u2014 the deficit shrinks`;
    }
    return `${flair} the trailing team refuses to die`;
  }
  function describeThrow(side, blueName, redName, what, rng = Math.random) {
    const thrower = teamName(side === "blue" ? "red" : "blue", blueName, redName);
    const flair = pickRandom(["THROWN!", "GREED PUNISHED!", "WHAT A THROW!"], rng);
    return `${flair} ${thrower} over-extends on ${what} \u2014 ${teamName(side, blueName, redName)} punishes and swings it back`;
  }
  function describeCounterJungle(side, picks, blueName, redName) {
    const jg = picks[POSITIONAL_LANES3.indexOf("jungle")];
    if (jg) {
      return `${jg.name} invades and clears the enemy jungle \u2014 their jungler falls behind`;
    }
    return `${teamName(side, blueName, redName)} counter-jungles, denying camps`;
  }
  function describeBackdoorCaught(side, splitterPicks, blueName, redName) {
    const splitter = findByArchetype(splitterPicks, ["splitpush", "skirmish"]) ?? splitterPicks.find((c) => c != null);
    if (splitter) {
      return `CAUGHT! ${splitter.name}'s backdoor gets sniffed out \u2014 collapsed on at the base`;
    }
    return `${teamName(side, blueName, redName)} sniffs out the backdoor and denies it`;
  }
  function describeBaseRace(side, blueName, redName) {
    return `BASE RACE! both Nexuses crumbling \u2014 ${teamName(side, blueName, redName)} hits home first`;
  }
  function describeWaveCrash(side, picks, lane, blueName, redName) {
    const idx = POSITIONAL_LANES3.indexOf(lane);
    const laner = picks[idx];
    const laneShort = lane === "middle" ? "mid" : lane === "bottom" ? "bot" : lane;
    if (laner) {
      return `${laner.name} crashes the wave ${laneShort}, freezes the bounce`;
    }
    return `${teamName(side, blueName, redName)} wins the wave-crash ${laneShort}`;
  }
  function describeTowerDive(side, picks, lane, blueName, redName, traded) {
    const laneShort = lane === "middle" ? "mid" : lane === "bottom" ? "bot" : lane;
    const diver = picks[POSITIONAL_LANES3.indexOf(lane === "jungle" ? "middle" : "jungle")];
    const team = teamName(side, blueName, redName);
    if (traded) {
      return `${team} dives ${laneShort} under tower \u2014 trades a body but takes the kill`;
    }
    return diver ? `${diver.name} collapses ${laneShort} \u2014 clean tower dive` : `${team} dives ${laneShort} under the turret`;
  }
  function describePokeSiege(side, blueName, redName, rng = Math.random) {
    const team = teamName(side, blueName, redName);
    return pickRandom(
      [
        `${team} pokes the turret down \u2014 no engage, no escape`,
        `${team} sieges from range, chunks the tower to nothing`,
        `${team} grinds the turret with poke \u2014 the war of attrition`
      ],
      rng
    );
  }
  function describeTeleportFlank(side, picks, blueName, redName) {
    const top = picks[POSITIONAL_LANES3.indexOf("top")];
    const team = teamName(side, blueName, redName);
    return top ? `${top.name} Teleports behind \u2014 the flank turns the fight` : `${team} flanks with a cross-map Teleport and flips it`;
  }
  function describeCheese(side, picks, blueName, redName, success, rng = Math.random) {
    const team = teamName(side, blueName, redName);
    const c = picks[POSITIONAL_LANES3.indexOf(pickRandom(["top", "middle"], rng))];
    if (success) {
      return c ? `${c.name} cheeses the early all-in \u2014 first blood off the gamble` : `${team} cheeses the level-2 all-in and it lands`;
    }
    return `${team}'s early cheese gets read \u2014 the gamble whiffs`;
  }
  function describeDisengage(side, picks, blueName, redName, rng = Math.random) {
    const team = teamName(side, blueName, redName);
    const sup = picks[POSITIONAL_LANES3.indexOf("support")];
    return pickRandom(
      [
        sup ? `${sup.name} peels it back \u2014 the dive is denied, everyone lives` : `${team} peels the dive \u2014 nobody dies, the lead holds at bay`,
        `${team} disengages cleanly \u2014 the enemy commit finds nothing`
      ],
      rng
    );
  }
  var CHAMPION_SIGNATURE = {
    Thresh: "{n} lands the hook \u2014 Death Sentence into the kill",
    Blitzcrank: "{n} hooks them clean out of position",
    Pyke: "{n} hooks, then executes for the reset",
    Nautilus: "{n} chains the engage and locks them down",
    LeeSin: "{n} insec-kicks the carry into the whole team",
    Yasuo: "{n} rides the knock-up and ults the squad",
    Yone: "{n} ults through the backline and resets",
    Malphite: "{n} flanks and Unstoppable Force into all five",
    Amumu: "{n} curses the entire team with the bandage toss",
    Orianna: "{n} lands the perfect Shockwave",
    Katarina: "{n} resets across the fight \u2014 Death Lotus pops off",
    Zed: "{n} marks the carry and executes from the shadows",
    Akali: "{n} vanishes in the shroud and bursts the carry",
    Riven: "{n} animation-cancels through the squad",
    Kennen: "{n} flashes in for the triple stun",
    Sett: "{n} suplexes the carry into the team",
    Wukong: "{n} clones in and knocks the whole team up",
    Diana: "{n} pulls them in and detonates",
    Galio: "{n} ults across the map \u2014 the flank lands",
    Jarvan: "{n} cataclysms the carry into a cage",
    Ashe: "{n} lands the cross-map arrow to start it",
    Ahri: "{n} charms the carry and bursts it down",
    Vi: "{n} flies in and locks the carry out of the fight",
    Camille: "{n} ults the carry into a 1v1 and deletes it",
    Rell: "{n} crashes the engage and pins them down"
  };
  function championSignature(champ) {
    const line = CHAMPION_SIGNATURE[champ.alias];
    return line ? line.replace("{n}", champ.name) : null;
  }
  var SIGNATURE_ENGAGERS = /* @__PURE__ */ new Set([
    "Malphite",
    "Amumu",
    "Orianna",
    "Nautilus",
    "Wukong",
    "Jarvan",
    "Galio",
    "Rell",
    "Sett",
    "Diana"
  ]);
  function signatureEngage(picks) {
    const found = picks.find((c) => c && SIGNATURE_ENGAGERS.has(c.alias));
    return found ? championSignature(found) : null;
  }
  function describeLastStand(side, blueName, redName) {
    return `${teamName(side, blueName, redName)} repels the push at the Nexus \u2014 one more breath`;
  }
  function describeStrategicPivot(side, blueName, redName, kind) {
    const team = teamName(side, blueName, redName);
    switch (kind) {
      case "all-in":
        return `PLAN PIVOT \u2014 ${team} abandons the slow game: hunt picks, force Baron`;
      case "splitpush":
        return `PLAN PIVOT \u2014 ${team} splits 1-3-1 to crack the siege, backdoor on the table`;
      case "objective-rush":
        return `PLAN PIVOT \u2014 ${team} sells out for objectives, trading everything for the next take`;
    }
  }
  function describePowerSpike(champion, keyItem, rng = Math.random) {
    const verb = pickRandom(["completes", "powers up with", "finishes"], rng);
    return `POWER SPIKE \u2014 ${champion.name} ${verb} ${keyItem}`;
  }
  var LANE_LIST = [
    "top",
    "jungle",
    "middle",
    "bottom",
    "support"
  ];
  var KILL_WEIGHTS = {
    top: 0.19,
    jungle: 0.22,
    middle: 0.24,
    bottom: 0.26,
    support: 0.05
  };
  var DEATH_WEIGHTS = {
    top: 0.18,
    jungle: 0.13,
    middle: 0.18,
    bottom: 0.27,
    support: 0.24
  };
  var ASSIST_WEIGHTS = {
    top: 0.11,
    jungle: 0.24,
    middle: 0.2,
    bottom: 0.13,
    support: 0.3
  };
  function makeKDA() {
    return { blue: {}, red: {} };
  }
  var NO_KDA = Object.freeze({ blue: {}, red: {} });
  function laneBucket(side, lane) {
    let v = side[lane];
    if (!v) {
      v = { k: 0, d: 0, a: 0 };
      side[lane] = v;
    }
    return v;
  }
  function addKill(kda, side, lane, n2 = 1) {
    laneBucket(kda[side], lane).k += n2;
  }
  function addAssist(kda, side, lane, n2 = 1) {
    laneBucket(kda[side], lane).a += n2;
  }
  function addDeath(kda, side, lane, n2 = 1) {
    laneBucket(kda[side], lane).d += n2;
  }
  function pickWeighted(weights, rng = Math.random) {
    const total = LANE_LIST.reduce((s, l) => s + weights[l], 0);
    let r = rng() * total;
    for (const lane of LANE_LIST) {
      r -= weights[lane];
      if (r <= 0) return lane;
    }
    return LANE_LIST[LANE_LIST.length - 1];
  }
  function laneKillKDA(winnerSide, lane, kills = 1, victimLane = lane) {
    const k = makeKDA();
    if (kills <= 0) return k;
    const loserSide = winnerSide === "blue" ? "red" : "blue";
    addKill(k, winnerSide, lane, kills);
    addDeath(k, loserSide, victimLane, kills);
    return k;
  }
  function gankKDA(winnerSide, killerLane, assistLane, victimLane) {
    const k = makeKDA();
    const loserSide = winnerSide === "blue" ? "red" : "blue";
    addKill(k, winnerSide, killerLane);
    addAssist(k, winnerSide, assistLane);
    addDeath(k, loserSide, victimLane);
    return k;
  }
  var PENTA_ARCHETYPE_WEIGHT = {
    "hyper-carry": 5,
    burst: 4,
    assassin: 4,
    skirmish: 3,
    poke: 3,
    dive: 2
  };
  var FORM_PENTA_WEIGHT = 1.2;
  function pentakiller(winnerPicks, rng = Math.random, forms) {
    const weights = [];
    let total = 0;
    for (let i = 0; i < POSITIONAL_LANES3.length; i++) {
      const c = winnerPicks[i];
      if (!c) {
        weights.push(0);
        continue;
      }
      let w = 1;
      for (const a of metaFor2(c).archetypes) {
        w = Math.max(w, PENTA_ARCHETYPE_WEIGHT[a] ?? 1);
      }
      if (c.roles.some((r2) => r2.toLowerCase() === "marksman")) w = Math.max(w, 5);
      if (POSITIONAL_LANES3[i] === "support") w *= 0.3;
      const form = forms?.[POSITIONAL_LANES3[i]] ?? 0;
      w = Math.max(0.05, w * (1 + form * FORM_PENTA_WEIGHT));
      weights.push(w);
      total += w;
    }
    if (total <= 0) return null;
    let r = rng() * total;
    for (let i = 0; i < POSITIONAL_LANES3.length; i++) {
      r -= weights[i];
      if (r <= 0 && winnerPicks[i]) {
        return { lane: POSITIONAL_LANES3[i], champ: winnerPicks[i] };
      }
    }
    for (let i = POSITIONAL_LANES3.length - 1; i >= 0; i--) {
      if (winnerPicks[i]) return { lane: POSITIONAL_LANES3[i], champ: winnerPicks[i] };
    }
    return null;
  }
  function pentakillKDA(winnerSide, lane) {
    const k = makeKDA();
    const loserSide = winnerSide === "blue" ? "red" : "blue";
    addKill(k, winnerSide, lane, 5);
    for (const l of LANE_LIST) {
      addDeath(k, loserSide, l);
      if (l !== lane) addAssist(k, winnerSide, l, 2);
    }
    return k;
  }
  function teamfightKDA(winnerSide, winnerKills, loserKills, rng = Math.random) {
    const k = makeKDA();
    const loserSide = winnerSide === "blue" ? "red" : "blue";
    for (let i = 0; i < winnerKills; i++) {
      addKill(k, winnerSide, pickWeighted(KILL_WEIGHTS, rng));
    }
    const assists = Math.max(0, Math.floor(winnerKills * 1.5));
    for (let i = 0; i < assists; i++) {
      addAssist(k, winnerSide, pickWeighted(ASSIST_WEIGHTS, rng));
    }
    for (let i = 0; i < winnerKills; i++) {
      addDeath(k, loserSide, pickWeighted(DEATH_WEIGHTS, rng));
    }
    for (let i = 0; i < loserKills; i++) {
      addKill(k, loserSide, pickWeighted(KILL_WEIGHTS, rng));
    }
    const loserAssists = Math.max(0, Math.floor(loserKills * 1.3));
    for (let i = 0; i < loserAssists; i++) {
      addAssist(k, loserSide, pickWeighted(ASSIST_WEIGHTS, rng));
    }
    for (let i = 0; i < loserKills; i++) {
      addDeath(k, winnerSide, pickWeighted(DEATH_WEIGHTS, rng));
    }
    return k;
  }
  function aceKDA(winnerSide) {
    const k = makeKDA();
    const loserSide = winnerSide === "blue" ? "red" : "blue";
    for (const lane of LANE_LIST) {
      addKill(k, winnerSide, lane);
      addDeath(k, loserSide, lane);
      addAssist(k, winnerSide, lane, 3);
    }
    return k;
  }
  function objectiveKDA(winnerSide, winnerKills, loserKills, smiterStolen, smiterSide = winnerSide, rng = Math.random) {
    const k = teamfightKDA(winnerSide, winnerKills, loserKills, rng);
    if (smiterStolen) {
      addAssist(k, smiterSide, "jungle");
    }
    return k;
  }
  function topFraggerLane(kda, side) {
    let best = null;
    let bestK = 0;
    let bestA = -1;
    for (const lane of LANE_LIST) {
      const v = kda[side][lane];
      if (!v || v.k <= 0) continue;
      if (v.k > bestK || v.k === bestK && v.a > bestA) {
        best = lane;
        bestK = v.k;
        bestA = v.a;
      }
    }
    return best;
  }
  function nameActualFragger(desc, picks, kda, side, carryArchetypes) {
    const carry = findByArchetype(picks, carryArchetypes) ?? picks.find((c) => c != null);
    if (!carry || !desc.includes(carry.name)) return desc;
    const lane = topFraggerLane(kda, side);
    const frag = lane != null ? laneOf(picks, lane) : null;
    return frag && frag !== carry ? desc.replace(carry.name, frag.name) : desc;
  }
  var TEAMFIGHT_CARRY_ARCHETYPES = TEAMFIGHT_CARRY;
  var SKIRMISH_CARRY_ARCHETYPES = SKIRMISH_CARRY;
  var KILL_GOLD = 300;
  var ASSIST_GOLD = 100;
  function kdaToLaneGold(kda) {
    const out = {};
    for (const lane of LANE_LIST) {
      const blue = kda.blue[lane];
      const red = kda.red[lane];
      let net = 0;
      if (blue) net += blue.k * KILL_GOLD + blue.a * ASSIST_GOLD;
      if (red) net -= red.k * KILL_GOLD + red.a * ASSIST_GOLD;
      if (net !== 0) out[lane] = net;
    }
    return out;
  }
  function mergeLaneGold(base, add) {
    const out = { ...base };
    for (const lane of LANE_LIST) {
      const v = add[lane];
      if (v !== void 0 && v !== 0) {
        out[lane] = (out[lane] ?? 0) + v;
      }
    }
    return out;
  }

  // lib/sim/strategies.ts
  var DEFAULT_STRATEGY = {
    gamePlan: "teamfight",
    jungle: "balanced",
    weakside: "none",
    winCondition: "spread",
    macro: "group",
    fightStyle: "balanced",
    objective: "balanced",
    vision: "standard",
    tempo: "standard",
    risk: "standard",
    pickTarget: "balanced",
    laneSwap: "standard",
    topPlay: "group",
    midPlay: "standard",
    botPlay: "standard",
    supportPlay: "lane"
  };
  function archetypeCounts2(picks) {
    const c = {};
    for (const p of picks) {
      if (!p) continue;
      for (const a of metaFor2(p).archetypes) c[a] = (c[a] ?? 0) + 1;
    }
    return c;
  }
  function n(c, a) {
    return c[a] ?? 0;
  }
  function topIsSelfSufficient(picks) {
    const top = laneOf(picks, "top");
    if (!top) return false;
    const a = metaFor2(top).archetypes;
    return a.includes("tank") || a.includes("splitpush");
  }
  function botIsScalingCarry(picks) {
    const bot = laneOf(picks, "bottom");
    if (!bot) return false;
    return metaFor2(bot).archetypes.includes("hyper-carry");
  }
  function winConditionLane(wc) {
    return wc === "top-carry" ? "top" : wc === "mid-carry" ? "middle" : wc === "bot-carry" ? "bottom" : null;
  }
  function carryStrengthAt(picks, lane) {
    const c = laneOf(picks, lane);
    if (!c) return 0;
    const a = metaFor2(c).archetypes;
    let s = 0;
    if (a.includes("hyper-carry")) s += 3;
    if (a.includes("burst")) s += 2;
    if (a.includes("assassin")) s += 2;
    if (c.roles.some((r) => r.toLowerCase() === "marksman")) s += 2;
    return s;
  }
  function choose(cands, rng) {
    const valid = cands.filter((c) => c.weight > 0);
    if (valid.length === 0) return cands[0].value;
    if (!rng) return valid.reduce((a, b) => b.weight > a.weight ? b : a).value;
    const total = valid.reduce((s, c) => s + c.weight, 0);
    let r = rng() * total;
    for (const c of valid) if ((r -= c.weight) <= 0) return c.value;
    return valid[valid.length - 1].value;
  }
  var LANE_IDX = {
    top: 0,
    middle: 2,
    bottom: 3
  };
  function tierAt(roster, idx) {
    const p = roster?.[idx];
    return p ? PLAYER_TIER_VALUE[p.tier] : 0;
  }
  function strongestEnemyLane(ctx) {
    if (ctx.enemyRoster) {
      const lanes = [
        ["top", tierAt(ctx.enemyRoster, LANE_IDX.top)],
        ["mid", tierAt(ctx.enemyRoster, LANE_IDX.middle)],
        ["bot", tierAt(ctx.enemyRoster, LANE_IDX.bottom)]
      ];
      const best = lanes.reduce((a, b) => b[1] > a[1] ? b : a);
      if (best[1] > 0) return best[0];
    }
    if (ctx.enemyPicks) {
      const lanes = [
        ["top", carryStrengthAt(ctx.enemyPicks, "top")],
        ["mid", carryStrengthAt(ctx.enemyPicks, "middle")],
        ["bot", carryStrengthAt(ctx.enemyPicks, "bottom")]
      ];
      const best = lanes.reduce((a, b) => b[1] > a[1] ? b : a);
      if (best[1] >= 2) return best[0];
    }
    return "balanced";
  }
  function topMatchupUnfavorable(picks, ctx) {
    if (ctx.roster && ctx.enemyRoster) {
      if (tierAt(ctx.roster, LANE_IDX.top) <= tierAt(ctx.enemyRoster, LANE_IDX.top) - 2)
        return true;
    }
    const myTop = laneOf(picks, "top");
    const oppTop = ctx.enemyPicks ? laneOf(ctx.enemyPicks, "top") : null;
    if (myTop && oppTop) {
      const myPhase = metaFor2(myTop).phase;
      const oppPhase = metaFor2(oppTop).phase;
      const myLate = myPhase === "late" || myPhase === "mid-late";
      if (myLate && oppPhase === "early") return true;
    }
    return false;
  }
  function chooseAIStrategy(picks, ctx = {}) {
    const rng = ctx.rng;
    const early = earlyCount(picks);
    const late = lateScalingCount(picks);
    const counts = archetypeCounts2(picks);
    const hasSplit = !!findByArchetype(picks, ["splitpush"]);
    const hasFrontline = n(counts, "tank") >= 1;
    const hasHyperCarry = n(counts, "hyper-carry") >= 1;
    const pokeCount = n(counts, "poke");
    const pickPotential = n(counts, "pick") + n(counts, "assassin") + n(counts, "burst");
    const gamePlan = choose(
      [
        { value: "scaling", weight: late >= 3 ? 7 : late >= 2 ? 3 : 1 },
        { value: "early-snowball", weight: early >= 3 ? 7 : early >= 2 ? 3 : 1 },
        { value: "teamfight", weight: 3 + (hasFrontline && n(counts, "engage") >= 1 ? 2 : 0) }
      ],
      rng
    );
    const scaling = gamePlan === "scaling";
    const snowball = gamePlan === "early-snowball";
    const jungle = choose(
      [
        { value: "farm", weight: scaling ? 5 : late >= 2 ? 2 : 1 },
        { value: "gank", weight: snowball ? 5 : early >= 2 ? 2 : 1 },
        { value: "invade", weight: snowball && early >= 3 ? 2.5 : 0.4 },
        { value: "counter-jungle", weight: 1.5 },
        { value: "balanced", weight: 2.5 }
      ],
      rng
    );
    const tempo = choose(
      [
        { value: "aggressive", weight: snowball ? 5 : early >= 2 ? 2.5 : 1 },
        { value: "passive", weight: scaling ? 5 : late >= 2 ? 2.5 : 1 },
        { value: "standard", weight: 3.5 }
      ],
      rng
    );
    const macro = choose(
      [
        { value: "splitpush", weight: hasSplit ? 6 : 0.3 },
        // A loaded pick comp (3+ catch tools) commits to the pick game harder.
        { value: "pick", weight: pickPotential >= 3 ? 5 : pickPotential >= 2 ? 4 : 1 },
        { value: "siege", weight: pokeCount >= 2 ? 4 : 0.4 },
        { value: "group", weight: 3.5 }
      ],
      rng
    );
    const fightStyle = choose(
      [
        { value: "front-to-back", weight: hasFrontline && hasHyperCarry ? 5 : hasFrontline ? 2 : 0.4 },
        { value: "flank", weight: pickPotential >= 2 ? 4 : 1 },
        { value: "poke", weight: pokeCount >= 3 ? 5 : pokeCount >= 2 ? 2 : 0.4 },
        { value: "balanced", weight: 3 }
      ],
      rng
    );
    const objective = choose(
      [
        { value: "dragon", weight: scaling || late >= 2 ? 3.5 : 1.5 },
        { value: "herald", weight: snowball || early >= 2 ? 3 : 1 },
        { value: "baron", weight: 1.5 },
        { value: "atakhan", weight: hasFrontline || hasHyperCarry ? 1.5 : 0.8 },
        { value: "balanced", weight: 3 }
      ],
      rng
    );
    const vision = choose(
      [
        { value: "proactive", weight: pickPotential >= 2 ? 4.5 : 1.2 },
        { value: "reactive", weight: scaling ? 3 : 1.2 },
        { value: "standard", weight: 4 }
      ],
      rng
    );
    const behind = (ctx.oppWins ?? 0) - (ctx.selfWins ?? 0);
    const oppMatchPoint = ctx.gamesToWin != null && (ctx.oppWins ?? 0) === ctx.gamesToWin - 1 && behind > 0;
    const selfMatchPoint = ctx.gamesToWin != null && (ctx.selfWins ?? 0) === ctx.gamesToWin - 1 && behind < 0;
    const risk = choose(
      [
        { value: "high-roll", weight: oppMatchPoint ? 8 : behind >= 2 ? 6 : behind === 1 ? 3 : 1 },
        { value: "safe", weight: selfMatchPoint ? 5 : behind <= -1 ? 4 : 1 },
        { value: "standard", weight: 4 }
      ],
      rng
    );
    const target = strongestEnemyLane(ctx);
    const pickTarget = choose(
      [
        { value: target, weight: target !== "balanced" ? pickPotential >= 2 ? 5 : 2.5 : 0 },
        { value: "balanced", weight: 3.5 }
      ],
      rng
    );
    const laneSwap = choose(
      [
        { value: "lane-swap", weight: topMatchupUnfavorable(picks, ctx) ? 4 : 0.15 },
        { value: "standard", weight: 6 }
      ],
      rng
    );
    const weakside = choose(
      [
        { value: "top", weight: topIsSelfSufficient(picks) ? 3.5 : 0.3 },
        { value: "bottom", weight: botIsScalingCarry(picks) && early >= 1 ? 2.5 : 0.3 },
        { value: "none", weight: 4 }
      ],
      rng
    );
    const winCondition = choose(
      [
        { value: "top-carry", weight: carryStrengthAt(picks, "top") >= 2 ? 2.5 : 0.2 },
        { value: "mid-carry", weight: carryStrengthAt(picks, "middle") >= 2 ? 2.5 : 0.2 },
        { value: "bot-carry", weight: carryStrengthAt(picks, "bottom") >= 3 ? 3 : 0.3 },
        { value: "spread", weight: 4 }
      ],
      rng
    );
    const topPlay = choose(
      [
        { value: "splitpush", weight: hasSplit ? 5 : 0.4 },
        { value: "rotate", weight: hasFrontline ? 2 : 1 },
        { value: "group", weight: 4 }
      ],
      rng
    );
    const midPlay = choose(
      [
        { value: "roam", weight: pickPotential >= 2 ? 4 : 1 },
        { value: "push-prio", weight: pokeCount >= 1 ? 2 : 1.2 },
        { value: "standard", weight: 4 }
      ],
      rng
    );
    const botPlay = choose(
      [
        { value: "scale", weight: botIsScalingCarry(picks) ? 5 : 1 },
        { value: "dive", weight: early >= 3 ? 3 : n(counts, "engage") >= 1 ? 1.5 : 0.5 },
        { value: "standard", weight: 3.5 }
      ],
      rng
    );
    const supportPlay = choose(
      [
        { value: "protect", weight: botIsScalingCarry(picks) || hasHyperCarry ? 4 : 1 },
        { value: "roam", weight: pickPotential >= 2 || n(counts, "engage") >= 1 ? 3 : 1 },
        { value: "lane", weight: 3.5 }
      ],
      rng
    );
    return {
      gamePlan,
      jungle,
      weakside,
      winCondition,
      macro,
      fightStyle,
      objective,
      vision,
      tempo,
      risk,
      pickTarget,
      laneSwap,
      topPlay,
      midPlay,
      botPlay,
      supportPlay
    };
  }
  function wasStomped(g) {
    if (g.stomp != null) return g.stomp;
    if (g.goldDiff != null) return g.goldDiff <= -7e3;
    return false;
  }
  function chooseAIStrategyForGame(input) {
    const rng = input.rng ?? Math.random;
    const picks = input.picks;
    const base = chooseAIStrategy(picks, { ...input.context, rng });
    const history = (input.priorGames ?? []).filter(
      (g) => !input.opponentName || !g.opponentName || g.opponentName === input.opponentName
    );
    const last = history[history.length - 1];
    if (!last) return base;
    const early = earlyCount(picks);
    const late = lateScalingCount(picks);
    const hasSplit = !!findByArchetype(picks, ["splitpush"]);
    if (last.won) {
      const macro = last.strategy.macro === "splitpush" && !hasSplit ? base.macro : last.strategy.macro;
      return {
        ...base,
        gamePlan: last.strategy.gamePlan,
        tempo: last.strategy.tempo,
        macro,
        objective: last.strategy.objective
      };
    }
    const out = { ...base };
    if (last.strategy.gamePlan === "scaling" || last.strategy.tempo === "passive") {
      out.gamePlan = early >= 1 ? "early-snowball" : "teamfight";
      out.tempo = "aggressive";
      out.jungle = "gank";
      out.objective = "herald";
    } else if (last.strategy.gamePlan === "early-snowball" || last.strategy.tempo === "aggressive") {
      out.gamePlan = late >= 1 ? "scaling" : "teamfight";
      out.tempo = "passive";
      out.jungle = "farm";
      out.objective = "dragon";
      out.botPlay = "scale";
      out.supportPlay = "protect";
    } else if (hasSplit) {
      out.macro = "splitpush";
      out.topPlay = "splitpush";
    } else {
      out.macro = "pick";
      out.vision = "proactive";
    }
    if (last.opponentStrategy && (last.opponentStrategy.macro === "splitpush" || last.opponentStrategy.topPlay === "splitpush")) {
      out.macro = "group";
      out.vision = "proactive";
      out.pickTarget = "top";
    } else if (last.opponentStrategy?.macro === "pick") {
      out.macro = "group";
      out.vision = "proactive";
      out.supportPlay = "protect";
    }
    if (wasStomped(last)) out.risk = "high-roll";
    return out;
  }
  function strategyFit(strategy, picks) {
    const early = earlyCount(picks);
    const late = lateScalingCount(picks);
    const counts = archetypeCounts2(picks);
    const hasSplit = !!findByArchetype(picks, ["splitpush"]);
    const hasFrontline = n(counts, "tank") >= 1;
    const hasHyperCarry = n(counts, "hyper-carry") >= 1;
    const pickPotential = n(counts, "pick") + n(counts, "assassin") + n(counts, "burst");
    let fit = 0;
    if (strategy.gamePlan === "scaling") {
      fit += late >= 3 ? 2 : late >= 2 ? 1 : early >= 3 ? -3 : -1;
    } else if (strategy.gamePlan === "early-snowball") {
      fit += early >= 3 ? 2 : early >= 2 ? 1 : late >= 3 ? -3 : -1;
    }
    if (strategy.jungle === "invade") fit += early >= 2 ? 1.5 : late >= 3 ? -2 : -0.5;
    else if (strategy.jungle === "counter-jungle") fit += early >= 2 ? 0.75 : late >= 3 ? -0.5 : 0;
    else if (strategy.jungle === "gank") fit += early >= 2 ? 1 : late >= 3 ? -1 : 0;
    else if (strategy.jungle === "farm") fit += late >= 2 ? 1 : early >= 3 ? -0.5 : 0;
    if (strategy.weakside === "top") fit += topIsSelfSufficient(picks) ? 1 : -1.5;
    else if (strategy.weakside === "bottom") fit += botIsScalingCarry(picks) ? 1 : -1;
    if (strategy.winCondition !== "spread") {
      const lane = winConditionLane(strategy.winCondition);
      fit += lane && carryStrengthAt(picks, lane) >= 2 ? 1.5 : -1.5;
    }
    if (strategy.macro === "splitpush") fit += hasSplit ? 1.5 : -2.5;
    else if (strategy.macro === "pick") fit += pickPotential >= 2 ? 1.5 : -1.5;
    else if (strategy.macro === "siege") fit += n(counts, "poke") >= 2 ? 1.5 : -1;
    if (strategy.fightStyle === "front-to-back")
      fit += hasFrontline && hasHyperCarry ? 1.5 : hasFrontline ? 0.5 : -1.5;
    else if (strategy.fightStyle === "flank") fit += pickPotential >= 2 ? 1.5 : -1;
    else if (strategy.fightStyle === "poke")
      fit += n(counts, "poke") >= 3 ? 1.5 : n(counts, "poke") >= 2 ? 0.5 : -1;
    if (strategy.objective === "dragon") fit += late >= 2 ? 0.5 : 0;
    else if (strategy.objective === "baron") fit += early >= 2 ? 0.5 : -0.25;
    else if (strategy.objective === "herald") fit += early >= 2 ? 0.5 : late >= 3 ? -0.5 : 0;
    else if (strategy.objective === "atakhan") fit += hasHyperCarry || hasFrontline ? 0.4 : 0;
    if (strategy.vision === "proactive") fit += pickPotential >= 2 ? 0.5 : 0;
    if (strategy.tempo === "aggressive") fit += early >= 2 ? 1.5 : late >= 3 ? -2 : 0;
    else if (strategy.tempo === "passive") fit += late >= 2 ? 1.5 : early >= 3 ? -1.5 : 0;
    if (strategy.topPlay === "splitpush") fit += hasSplit ? 1.5 : -1;
    else if (strategy.topPlay === "rotate") fit += hasFrontline ? 0.5 : 0;
    if (strategy.midPlay === "roam") fit += pickPotential >= 2 ? 1 : -0.5;
    if (strategy.botPlay === "dive")
      fit += botIsScalingCarry(picks) ? -1 : n(counts, "engage") >= 1 ? 1 : 0;
    else if (strategy.botPlay === "scale")
      fit += botIsScalingCarry(picks) ? 1 : 0;
    if (strategy.supportPlay === "roam")
      fit += n(counts, "pick") >= 1 || n(counts, "engage") >= 1 ? 0.75 : -0.5;
    else if (strategy.supportPlay === "protect")
      fit += botIsScalingCarry(picks) || hasHyperCarry ? 0.75 : -0.25;
    if (strategy.pickTarget !== "balanced")
      fit += pickPotential >= 2 ? 0.3 : -0.4;
    if (strategy.laneSwap === "lane-swap")
      fit += early >= 2 ? 0.4 : late >= 3 ? -0.5 : 0;
    return Math.max(-FIT_CAP, Math.min(FIT_CAP, fit * FIT_SCALE));
  }
  var FIT_SCALE = 1.6;
  var FIT_CAP = 8;
  function gankScore(s) {
    return s.jungle === "invade" ? 1.5 : s.jungle === "gank" ? 1 : s.jungle === "counter-jungle" ? 0.5 : s.jungle === "farm" ? -1 : 0;
  }
  function riskScore(s) {
    return s.risk === "high-roll" ? 1 : s.risk === "safe" ? -1 : 0;
  }
  function visionScore(s) {
    return s.vision === "proactive" ? 1 : s.vision === "reactive" ? -1 : 0;
  }
  function roamScore(s) {
    let r = 0;
    if (s.tempo === "aggressive") r += 1;
    else if (s.tempo === "passive") r -= 1;
    if (s.macro === "pick") r += 0.5;
    if (s.midPlay === "roam") r += 1.5;
    if (s.supportPlay === "roam") r += 1;
    return r;
  }
  function objectiveControlScore(s) {
    let r = 0;
    if (s.topPlay === "rotate") r += 1;
    if (s.midPlay === "push-prio") r += 0.5;
    return r;
  }
  function earlyAggroScore(s) {
    let r = 0;
    if (s.tempo === "aggressive") r += 1;
    else if (s.tempo === "passive") r -= 1;
    if (s.gamePlan === "early-snowball") r += 1;
    else if (s.gamePlan === "scaling") r -= 0.5;
    if (s.jungle === "invade") r += 0.5;
    else if (s.jungle === "counter-jungle") r += 0.25;
    if (s.botPlay === "dive") r += 1;
    else if (s.botPlay === "scale") r -= 1;
    if (s.laneSwap === "lane-swap") r += 0.5;
    return r;
  }
  function durationScore(s) {
    let d = 0;
    if (s.gamePlan === "scaling") d += 2;
    else if (s.gamePlan === "early-snowball") d -= 2;
    if (s.tempo === "passive") d += 1.5;
    else if (s.tempo === "aggressive") d -= 1.5;
    if (s.topPlay === "splitpush") d += 1;
    if (s.botPlay === "scale") d += 1;
    if (s.supportPlay === "protect") d += 0.5;
    if (s.macro === "siege") d += 0.5;
    return d;
  }
  function strategyTimelineModifiers(blue, red) {
    const blueGank = gankScore(blue);
    const redGank = gankScore(red);
    const blueRoam = roamScore(blue);
    const redRoam = roamScore(red);
    const blueRisk = riskScore(blue);
    const redRisk = riskScore(red);
    const pickTargetBias = (blue.pickTarget !== "balanced" ? 0.15 : 0) - (red.pickTarget !== "balanced" ? 0.15 : 0);
    return {
      // More ganks if either jungler camps; fewer if both farm.
      gankChanceDelta: 0.12 * blueGank + 0.12 * redGank,
      gankBias: (blueGank - redGank) * 0.3,
      roamChanceDelta: 0.1 * Math.max(0, blueRoam) + 0.1 * Math.max(0, redRoam),
      roamBias: (blueRoam - redRoam) * 0.22,
      drakeBias: ((blue.objective === "dragon" ? 1 : 0) - (red.objective === "dragon" ? 1 : 0)) * 0.25 + (objectiveControlScore(blue) - objectiveControlScore(red)) * 0.12,
      // Baron + Herald both push map/tower objectives, so both tilt the baron roll.
      baronBias: ((blue.objective === "baron" || blue.objective === "herald" ? 1 : 0) - (red.objective === "baron" || red.objective === "herald" ? 1 : 0)) * 0.25 + (objectiveControlScore(blue) - objectiveControlScore(red)) * 0.12,
      atakhanBias: ((blue.objective === "atakhan" ? 1 : 0) - (red.objective === "atakhan" ? 1 : 0)) * 0.3,
      stealChanceDelta: 0.05 * Math.max(0, blueRisk) + 0.05 * Math.max(0, redRisk) + 0.035 * Math.min(0, blueRisk) + 0.035 * Math.min(0, redRisk),
      // Either team going high-roll injects chaos into the deciding fight; both
      // playing safe makes it more deterministic.
      closingRiskFactor: Math.max(
        0.5,
        Math.min(
          1.5,
          1 - 0.28 * (Math.max(0, blueRisk) + Math.max(0, redRisk)) + 0.18 * (-Math.min(0, blueRisk) - Math.min(0, redRisk))
        )
      ),
      earlyAggroBias: (earlyAggroScore(blue) - earlyAggroScore(red)) * 0.14,
      visionChanceDelta: 0.12 * Math.max(0, visionScore(blue)) + 0.12 * Math.max(0, visionScore(red)) + 0.08 * Math.min(0, visionScore(blue)) + 0.08 * Math.min(0, visionScore(red)),
      visionBias: (visionScore(blue) - visionScore(red)) * 0.2 + pickTargetBias,
      durationDelta: durationScore(blue) + durationScore(red)
    };
  }
  function backdoorBonusFor(strategy) {
    return strategy.macro === "splitpush" || strategy.topPlay === "splitpush" ? 0.12 : 0;
  }
  var WEAK_PENALTY = 22;
  var WEAK_BOOST = 8;
  function applySideWeakside(laneAdv, side, weak) {
    if (weak === "none") return;
    const sign = side === "blue" ? 1 : -1;
    laneAdv[weak] -= WEAK_PENALTY * sign;
    const fundedSolo = weak === "top" ? "bottom" : "top";
    laneAdv.jungle += WEAK_BOOST * sign;
    laneAdv[fundedSolo] += WEAK_BOOST * sign;
  }
  function applyWeaksideToLaneAdv(laneAdv, blue, red) {
    const out = { ...laneAdv };
    applySideWeakside(out, "blue", blue.weakside);
    applySideWeakside(out, "red", red.weakside);
    return out;
  }
  var CARRY_BOOST = 12;
  var CARRY_DRAW = 5;
  function applySideCarry(laneAdv, side, wc) {
    const lane = winConditionLane(wc);
    if (!lane) return;
    const sign = side === "blue" ? 1 : -1;
    laneAdv[lane] += CARRY_BOOST * sign;
    if (lane !== "support") laneAdv.support -= CARRY_DRAW * sign;
    if (lane !== "jungle") laneAdv.jungle -= (CARRY_DRAW - 1) * sign;
  }
  function applyCarryFocusToLaneAdv(laneAdv, blue, red) {
    const out = { ...laneAdv };
    applySideCarry(out, "blue", blue.winCondition);
    applySideCarry(out, "red", red.winCondition);
    return out;
  }
  var PICK_DENY = 9;
  function pickTargetLane(pt) {
    return pt === "top" ? "top" : pt === "mid" ? "middle" : pt === "bot" ? "bottom" : null;
  }
  function applyPickTargetToLaneAdv(laneAdv, blue, red) {
    const out = { ...laneAdv };
    const bl = pickTargetLane(blue.pickTarget);
    if (bl) out[bl] += PICK_DENY;
    const rl = pickTargetLane(red.pickTarget);
    if (rl) out[rl] -= PICK_DENY;
    return out;
  }
  function applyLaneSwapToLaneAdv(laneAdv, blue, red) {
    const out = { ...laneAdv };
    if (blue.laneSwap === "lane-swap") {
      if (out.top < 0) out.top *= 0.45;
      out.bottom -= 5;
    }
    if (red.laneSwap === "lane-swap") {
      if (out.top > 0) out.top *= 0.45;
      out.bottom += 5;
    }
    return out;
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
  function getAbilityProfile(alias) {
    const found = ABILITIES[alias];
    if (found) return found;
    return {
      alias,
      hardCCDuration: 0,
      ultCooldown: 90,
      ultCastTime: 0,
      hasResets: false,
      burstWindowSeconds: 4
    };
  }
  function teamLockdownTotal(picks) {
    let total = 0;
    for (const alias of picks) {
      if (!alias) continue;
      total += getAbilityProfile(alias).hardCCDuration;
    }
    return total;
  }

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
  var ZERO = {
    ad: 0,
    ap: 0,
    armor: 0,
    mr: 0,
    hp: 0,
    abilityHaste: 0,
    attackSpeed: 0,
    crit: 0,
    armorPen: 0,
    magicPen: 0,
    lifesteal: 0,
    omnivamp: 0,
    movespeed: 0
  };
  function getItem(name) {
    return ITEMS[name] ?? ZERO;
  }
  function sumItems(...names) {
    const out = { ...ZERO };
    for (const n2 of names) {
      const it = getItem(n2);
      for (const k of Object.keys(out)) {
        out[k] += it[k];
      }
    }
    return out;
  }
  var BUILDS = {
    "hyper-carry": {
      spikes: [
        { minute: 8, items: ["Berserker's Greaves", "Doran's Blade"] },
        { minute: 14, items: ["Berserker's Greaves", "Kraken Slayer"] },
        { minute: 20, items: ["Berserker's Greaves", "Kraken Slayer", "Phantom Dancer"] },
        { minute: 26, items: ["Berserker's Greaves", "Kraken Slayer", "Phantom Dancer", "Infinity Edge"] },
        { minute: 32, items: ["Berserker's Greaves", "Kraken Slayer", "Phantom Dancer", "Infinity Edge", "Lord Dominik's Regards"] },
        { minute: 40, items: ["Berserker's Greaves", "Kraken Slayer", "Phantom Dancer", "Infinity Edge", "Lord Dominik's Regards", "Bloodthirster"] }
      ]
    },
    burst: {
      spikes: [
        { minute: 8, items: ["Sorcerer's Shoes"] },
        { minute: 14, items: ["Sorcerer's Shoes", "Luden's Companion"] },
        { minute: 20, items: ["Sorcerer's Shoes", "Luden's Companion", "Shadowflame"] },
        { minute: 26, items: ["Sorcerer's Shoes", "Luden's Companion", "Shadowflame", "Rabadon's Deathcap"] },
        { minute: 32, items: ["Sorcerer's Shoes", "Luden's Companion", "Shadowflame", "Rabadon's Deathcap", "Void Staff"] },
        { minute: 40, items: ["Sorcerer's Shoes", "Luden's Companion", "Shadowflame", "Rabadon's Deathcap", "Void Staff", "Banshee's Veil"] }
      ]
    },
    poke: {
      spikes: [
        { minute: 8, items: ["Sorcerer's Shoes"] },
        { minute: 14, items: ["Sorcerer's Shoes", "Liandry's Torment"] },
        { minute: 20, items: ["Sorcerer's Shoes", "Liandry's Torment", "Blackfire Torch"] },
        { minute: 26, items: ["Sorcerer's Shoes", "Liandry's Torment", "Blackfire Torch", "Rabadon's Deathcap"] },
        { minute: 32, items: ["Sorcerer's Shoes", "Liandry's Torment", "Blackfire Torch", "Rabadon's Deathcap", "Void Staff"] },
        { minute: 40, items: ["Sorcerer's Shoes", "Liandry's Torment", "Blackfire Torch", "Rabadon's Deathcap", "Void Staff", "Cryptbloom"] }
      ]
    },
    assassin: {
      spikes: [
        { minute: 8, items: ["Plated Steelcaps"] },
        { minute: 14, items: ["Plated Steelcaps", "Eclipse"] },
        { minute: 20, items: ["Plated Steelcaps", "Eclipse", "Profane Hydra"] },
        { minute: 26, items: ["Plated Steelcaps", "Eclipse", "Profane Hydra", "Edge of Night"] },
        { minute: 32, items: ["Plated Steelcaps", "Eclipse", "Profane Hydra", "Edge of Night", "Black Cleaver"] },
        { minute: 40, items: ["Plated Steelcaps", "Eclipse", "Profane Hydra", "Edge of Night", "Black Cleaver", "Guardian Angel"] }
      ]
    },
    tank: {
      spikes: [
        { minute: 8, items: ["Plated Steelcaps"] },
        { minute: 14, items: ["Plated Steelcaps", "Sunfire Aegis"] },
        { minute: 20, items: ["Plated Steelcaps", "Sunfire Aegis", "Heartsteel"] },
        { minute: 26, items: ["Plated Steelcaps", "Sunfire Aegis", "Heartsteel", "Thornmail"] },
        { minute: 32, items: ["Plated Steelcaps", "Sunfire Aegis", "Heartsteel", "Thornmail", "Force of Nature"] },
        { minute: 40, items: ["Plated Steelcaps", "Sunfire Aegis", "Heartsteel", "Thornmail", "Force of Nature", "Spirit Visage"] }
      ]
    },
    "skirmish": {
      spikes: [
        { minute: 8, items: ["Plated Steelcaps"] },
        { minute: 14, items: ["Plated Steelcaps", "Goredrinker"] },
        { minute: 20, items: ["Plated Steelcaps", "Goredrinker", "Black Cleaver"] },
        { minute: 26, items: ["Plated Steelcaps", "Goredrinker", "Black Cleaver", "Death's Dance"] },
        { minute: 32, items: ["Plated Steelcaps", "Goredrinker", "Black Cleaver", "Death's Dance", "Sterak's Gage"] },
        { minute: 40, items: ["Plated Steelcaps", "Goredrinker", "Black Cleaver", "Death's Dance", "Sterak's Gage", "Guardian Angel"] }
      ]
    },
    dive: {
      spikes: [
        { minute: 8, items: ["Plated Steelcaps"] },
        { minute: 14, items: ["Plated Steelcaps", "Trinity Force"] },
        { minute: 20, items: ["Plated Steelcaps", "Trinity Force", "Sterak's Gage"] },
        { minute: 26, items: ["Plated Steelcaps", "Trinity Force", "Sterak's Gage", "Black Cleaver"] },
        { minute: 32, items: ["Plated Steelcaps", "Trinity Force", "Sterak's Gage", "Black Cleaver", "Death's Dance"] },
        { minute: 40, items: ["Plated Steelcaps", "Trinity Force", "Sterak's Gage", "Black Cleaver", "Death's Dance", "Guardian Angel"] }
      ]
    },
    enchanter: {
      spikes: [
        { minute: 8, items: ["Mobility Boots", "World Atlas"] },
        { minute: 14, items: ["Mobility Boots", "World Atlas", "Moonstone Renewer"] },
        { minute: 20, items: ["Mobility Boots", "World Atlas", "Moonstone Renewer", "Ardent Censer"] },
        { minute: 26, items: ["Mobility Boots", "World Atlas", "Moonstone Renewer", "Ardent Censer", "Staff of Flowing Water"] },
        { minute: 32, items: ["Mobility Boots", "World Atlas", "Moonstone Renewer", "Ardent Censer", "Staff of Flowing Water", "Redemption"] },
        { minute: 40, items: ["Mobility Boots", "World Atlas", "Moonstone Renewer", "Ardent Censer", "Staff of Flowing Water", "Redemption", "Mikael's Blessing"] }
      ]
    },
    peel: {
      spikes: [
        { minute: 8, items: ["Mobility Boots", "World Atlas"] },
        { minute: 14, items: ["Mobility Boots", "World Atlas", "Locket of the Iron Solari"] },
        { minute: 20, items: ["Mobility Boots", "World Atlas", "Locket of the Iron Solari", "Knight's Vow"] },
        { minute: 26, items: ["Mobility Boots", "World Atlas", "Locket of the Iron Solari", "Knight's Vow", "Zeke's Convergence"] },
        { minute: 32, items: ["Mobility Boots", "World Atlas", "Locket of the Iron Solari", "Knight's Vow", "Zeke's Convergence", "Frozen Heart"] },
        { minute: 40, items: ["Mobility Boots", "World Atlas", "Locket of the Iron Solari", "Knight's Vow", "Zeke's Convergence", "Frozen Heart", "Force of Nature"] }
      ]
    }
  };
  var ARCHETYPE_PRIORITY = [
    "hyper-carry",
    "burst",
    "assassin",
    "poke",
    "dive",
    "skirmish",
    "tank",
    "enchanter",
    "peel"
  ];
  var buildPathCache = /* @__PURE__ */ new WeakMap();
  function buildPathFor(meta) {
    const cached = buildPathCache.get(meta);
    if (cached) return cached;
    let path = BUILDS.skirmish;
    for (const a of ARCHETYPE_PRIORITY) {
      if (meta.archetypes.includes(a)) {
        path = BUILDS[a];
        break;
      }
    }
    buildPathCache.set(meta, path);
    return path;
  }
  var CARRY_SPIKE_ARCHETYPES = /* @__PURE__ */ new Set([
    "hyper-carry",
    "burst",
    "assassin",
    "poke",
    "skirmish",
    "dive"
  ]);
  var BOOTS_NAMES = /* @__PURE__ */ new Set([
    "Berserker's Greaves",
    "Sorcerer's Shoes",
    "Plated Steelcaps",
    "Mercury's Treads",
    "Mobility Boots",
    "Ionian Boots of Lucidity",
    "Boots"
  ]);
  var _activePowerSpikeOverride = null;
  function getKeyPowerSpike(meta, alias) {
    const path = buildPathFor(meta);
    const spike = path.spikes[1] ?? path.spikes[0];
    const keyItem = spike.items.find(
      (n2) => !BOOTS_NAMES.has(n2) && n2 !== "World Atlas" && n2 !== "Doran's Blade"
    ) ?? spike.items[spike.items.length - 1];
    const isCarrySpike = meta.archetypes.some(
      (a) => CARRY_SPIKE_ARCHETYPES.has(a)
    );
    const overrideMinute = alias && _activePowerSpikeOverride ? _activePowerSpikeOverride[alias] : void 0;
    return {
      minute: overrideMinute ?? spike.minute,
      keyItem,
      isCarrySpike
    };
  }
  function buildStatsAt(meta, gameTime) {
    const path = buildPathFor(meta);
    const spikes = path.spikes;
    if (spikes.length === 0) return ZERO;
    if (gameTime <= spikes[0].minute) {
      const t = Math.max(0, gameTime / spikes[0].minute);
      return scale(sumItems(...spikes[0].items), t);
    }
    for (let i = 0; i < spikes.length - 1; i++) {
      const prev = spikes[i];
      const next = spikes[i + 1];
      if (gameTime <= next.minute) {
        const prevStats = sumItems(...prev.items);
        const nextStats = sumItems(...next.items);
        const t = (gameTime - prev.minute) / (next.minute - prev.minute);
        return lerp(prevStats, nextStats, t);
      }
    }
    return sumItems(...spikes[spikes.length - 1].items);
  }
  function scale(s, k) {
    const out = { ...ZERO };
    for (const key of Object.keys(s)) {
      out[key] = s[key] * k;
    }
    return out;
  }
  function lerp(a, b, t) {
    const out = { ...ZERO };
    for (const key of Object.keys(a)) {
      out[key] = a[key] + (b[key] - a[key]) * t;
    }
    return out;
  }

  // lib/sim/timeline/balance.ts
  var BALANCE = {
    // ─── Gold economy (team-equivalent gold per unit) ─────────────────────────
    // Real-LoL gold values (rounded for clarity):
    //   - kill: ~300g local + assist gold ≈ 300 team-equivalent
    //   - turret plate: ~125g, turret kill: ~250g local + 100g/ally global ≈ 550
    //   - inhibitor: ~400g local + super-minion pressure ≈ 800 team-equivalent
    KILL_GOLD: 300,
    TOWER_GOLD: 550,
    INHIB_GOLD: 800,
    // ─── Momentum ──────────────────────────────────────────────────────────────
    // Multiplicative decay applied before each event's impact lands.
    MOMENTUM_DECAY: 0.7,
    // ─── Event-side / snapshot logit coefficients ─────────────────────────────
    COMP_DIFF_WEIGHT: 0.022,
    GOLD_LEAD_NORM: 4500,
    MOMENTUM_WEIGHT: 1.2,
    BLUE_SIDE_BONUS: 0.1,
    // Event-side rolls are clamped so upsets are always possible.
    EVENT_PROB_MIN: 0.18,
    EVENT_PROB_MAX: 0.82,
    // Win-prob snapshots get a wider band (display, not a roll).
    SNAPSHOT_PROB_MIN: 0.03,
    SNAPSHOT_PROB_MAX: 0.97,
    // ─── Objective logit (persistent win-odds tilts) ──────────────────────────
    DRAKE_LOGIT_PER_STACK: 0.08,
    SOUL_LOGIT: 0.45,
    ELDER_LOGIT: 0.7,
    ATAKHAN_LOGIT: 0.22,
    // ─── Gold-lead weight by game phase ───────────────────────────────────────
    // Linear interp between (GOLD_WEIGHT_EARLY_MIN, GOLD_WEIGHT_EARLY) and
    // (GOLD_WEIGHT_LATE_MIN, GOLD_WEIGHT_LATE).
    GOLD_WEIGHT_EARLY: 1.8,
    GOLD_WEIGHT_LATE: 0.55,
    GOLD_WEIGHT_EARLY_MIN: 6,
    GOLD_WEIGHT_LATE_MIN: 35,
    GOLD_WEIGHT_SPAN: 29,
    GOLD_WEIGHT_DROP: 1.25,
    // ─── Tower pressure ────────────────────────────────────────────────────────
    TOWER_PRESSURE_BIAS: 0.45,
    TOWER_PRESSURE_CONSUME: 0.5,
    GRUB_TOWER_PRESSURE: 0.12,
    HERALD_TOWER_PRESSURE: 1,
    BARON_TOWER_PRESSURE: 1.2,
    // ─── Comeback detection (the "MOMENTUM SHIFT!" flair) ─────────────────────
    COMEBACK_MIN_IMPACT: 0.25,
    COMEBACK_GOLD_DEFICIT: 2500,
    COMEBACK_MOMENTUM_DEFICIT: 0.4,
    // ─── Comeback bias (NEGATIVE feedback for the event feed) ─────────────────
    // The causal links are all positive feedback (snowball), so a lead saturates
    // the event-side roll and the feed reads one-sided. This opposes the current
    // leader on SCRAPPY plays only (picks/vision/skirmishes/trades) — the losing
    // team still scraps for those — while objectives + the deciding fight keep
    // the leader's full edge. FACTOR = how much of the gold+momentum lead is
    // cancelled for those plays; CAP bounds it so the underdog never dominates.
    COMEBACK_BIAS_FACTOR: 0.6,
    COMEBACK_BIAS_CAP: 2,
    // A side far behind on gold mounts a desperation defensive STAND — wins a
    // fight it shouldn't, clawing back. Deficit to trigger + per-check chance.
    STAND_GOLD_DEFICIT: 4e3,
    STAND_CHANCE: 0.33,
    // A far-AHEAD team gets greedy and throws (face-checks an objective). Deficit
    // to qualify + per-check chance. The trailing team gets the swing.
    THROW_GOLD_DEFICIT: 4500,
    THROW_CHANCE: 0.3,
    // Counter-jungle invade: chance + how far behind it puts the enemy jungler
    // (fewer ganks). GANK_DAMP = chance subtracted from a behind-jungler's gank.
    COUNTER_JUNGLE_CHANCE: 0.22,
    JUNGLE_BEHIND_GANK_DAMP: 0.18,
    // Mid-game backdoor attempt by a splitpush comp: chance, and odds it's caught
    // (vs cracks a tower).
    BACKDOOR_ATTEMPT_CHANCE: 0.3,
    BACKDOOR_CAUGHT_ODDS: 0.45,
    // Base-race finish chance in the closing sequence (both nexuses low).
    BASE_RACE_CHANCE: 0.12,
    // A live Baron/Elder accelerates the inhibitor siege (extra inhib in the
    // cascade) and the super-minion tower pressure it generates.
    BUFF_SIEGE_INHIB_BONUS: 1,
    // ─── Polish: thin early events now feed the causal state ──────────────────
    // Plates / scuttle convert into lane-lead snowball (kills-equivalent units,
    // ×LANE_SNOWBALL_PER_KILL). Small — a plate edge is real but not a kill.
    PLATE_LANE_SNOWBALL: 0.6,
    SCUTTLE_JUNGLE_SNOWBALL: 0.5,
    // A near-ace mid teamfight (winner − loser kills ≥ this) buys a longer free-
    // objective window (ace → free Baron) and may flash a multikill flair.
    ACE_KILL_MARGIN: 4,
    ACE_PICKADV_MULT: 1.7,
    // New early/late flavor beats.
    LEVEL_SPIKE_GANK_CHANCE: 0.25,
    VISION_SWEEP_CHANCE: 0.25,
    BARON_DANCE_CHANCE: 0.3,
    // Chance a clean 5-0 ace (mid teamfight or closing) is a single-champion
    // PENTAKILL rather than a spread team ace. Rare — kept special.
    PENTAKILL_CHANCE: 0.03,
    // ─── New event beats (richer/varied feed) ─────────────────────────────────
    // Kept modest so calibration holds; every POSITIVE beat carries comebackBias
    // so a lead doesn't saturate the feed. Balanced by the negative beats below.
    // Tower dive: a collapse onto a side lane that dives the turret (1-2 kills,
    // may trade 1 to tower aggro). Fed by wave-crash/tower pressure (wave→dive).
    TOWER_DIVE_CHANCE: 0.24,
    TOWER_DIVE_TRADE_ODDS: 0.35,
    // odds the divers trade a death to the tower
    // Poke/siege comp chips a tower over a window — pressure + gold, no kills.
    POKE_SIEGE_CHANCE: 0.42,
    POKE_SIEGE_TOWER_PRESSURE: 0.3,
    // Teleport flank: a top-laner TPs cross-map and flips a contested skirmish.
    TP_FLANK_CHANCE: 0.26,
    // Early cheese (proxy / lvl-2 all-in): high-variance early gamble.
    CHEESE_CHANCE: 0.12,
    CHEESE_SUCCESS_ODDS: 0.55,
    // Disengage / peel: a trailing team gets dived but PEELS and survives — a
    // defensive NEGATIVE-feedback beat (no deaths for them, small momentum back).
    DISENGAGE_CHANCE: 0.38,
    DISENGAGE_GOLD_DEFICIT: 2500,
    // Last-stand: the losing team repels the final push ONCE before losing.
    LAST_STAND_CHANCE: 0.25,
    // Splitpush comp is down a body in the 5v5 → its mid teamfight is slightly
    // harder to win (negative feedback against the splitpush side).
    SPLITPUSH_TEAMFIGHT_DAMP: 0.22,
    // A high-CC ("wombo") teamfight comp converts a won 5v5 harder (+kill spread).
    WOMBO_KILL_BONUS: 1,
    // Grubs → lane: Touch of the Void helps the laners shove/dive (small lane
    // snowball on the side lanes, on top of the tower pressure).
    GRUB_LANE_SNOWBALL: 0.4,
    // Roam → tower: a successful roam opens the side lane → a touch of tower
    // pressure for the roaming side (the roam → collapse → tower chain).
    ROAM_TOWER_PRESSURE: 0.12,
    // First-tower gold bonus (real LoL ≈ 150g shared) — the first turret of the
    // game pays a little extra on top of the structure bounty.
    FIRST_TOWER_BONUS: 150,
    // Player form → highlight plays. A hot-streak carry (form in [-1,+1]) is more
    // likely to BE the outplaying side and to be the one who pops off. Symmetric
    // (nets to 0 when both teams are equally hot / forms absent), so it never
    // disturbs the mirror calibration. Magnitudes small — form nudges, it doesn't
    // decide the game.
    FORM_OUTPLAY_BIAS: 0.4,
    // per net-form-point on the outplay side roll (logit)
    FORM_LANE_WEIGHT: 1.5,
    // how hard form skews WHICH lane gets the highlight
    // ─── Anti-streak mean-reversion (event-feed clustering) ───────────────────
    // The event-side roll reads the snowballing gold/momentum on every event, so
    // a leader gets long uninterrupted RUNS of plays even though the clamp caps
    // their per-roll probability — the feed reads as one team's highlight reel.
    // This nudges the next roll AWAY from the side that just had a run, scaling
    // with run length (capped). Symmetric (history-based, not strength-based) so
    // it scatters the trailing team's plays through the feed without changing who
    // wins (Monte-Carlo calibration tracks any residual; the mirror cancels).
    // Modelled as recent-IMBALANCE pushback (not a hard run-counter): whenever
    // the last WINDOW events skew to one side past a deadzone, bias the next roll
    // back toward the other team, scaled by the skew (capped). Pre-empts runs from
    // forming AND catches near-streaks ("6 of the last 8"). The redistributed
    // plays are the low-stakes scrappy bulk; the closing fight is decided
    // separately (decideClosingWinner), so outcomes are preserved.
    ANTI_STREAK_WINDOW: 8,
    // how many recent event sides to weigh
    ANTI_STREAK_DEADZONE: 1,
    // ignore natural skews up to this imbalance
    ANTI_STREAK_PER_EVENT: 0.5,
    // logit per imbalance point beyond the deadzone
    ANTI_STREAK_CAP: 2.6,
    // max anti-streak logit
    // ─── Objective steal ──────────────────────────────────────────────────────
    STEAL_CHANCE_CAP: 0.45,
    // ─── Shutdown thresholds ──────────────────────────────────────────────────
    SHUTDOWN_BIG_LEAD: 4500,
    SHUTDOWN_MID_LEAD: 2500,
    SHUTDOWN_BIG_CHANCE: 0.55,
    SHUTDOWN_MID_CHANCE: 0.35,
    // ─── Inhibitor cascade thresholds ─────────────────────────────────────────
    STOMP_LEAD: 8e3,
    MAJOR_LEAD: 5e3,
    // Per-kill post-fight push gold for the deciding fight. Higher than the
    // mid-game teamfight's KILL_PUSH (super minions from open inhibs + uncontested
    // map make closing kills convert to more objective gold), but grounded in a
    // constant instead of a bare ×200 so the end-game gold chart stays sane.
    CLOSING_KILL_PUSH_GOLD: 120,
    MIDFIGHT_KILL_PUSH_GOLD: 60,
    // Voracious Atakhan: its taker banks +20% on the value of a won teamfight's
    // kills (kill gold, NOT the trivial CS spread the bonus used to land on).
    VORACIOUS_KILL_BONUS: 0.2,
    // Baron empowered-recall / siege window after it is taken (minutes). Its
    // tower-pressure edge only applies while the buff is live.
    BARON_DURATION: 3,
    // Pick → objective causal chain: how hard a fresh pick/vision-pick tilts the
    // next neutral objective toward the side that got the kill (logit units), and
    // for how long the man-advantage lasts (minutes). Modest — it nudges, momentum
    // still does the heavy lifting. The bias scales up with game time (death
    // timers grow), capped at PICK_ADVANTAGE_LATE_MULT.
    PICK_ADVANTAGE_BIAS: 0.5,
    PICK_ADVANTAGE_WINDOW: 3,
    PICK_ADVANTAGE_LATE_MULT: 2,
    // Summoner/ultimate cooldown edge: a catch (pick) burns the victim's Flash/
    // ult, and a punished throw / caught backdoor burns the AGGRESSOR's — leaving
    // one side a key cooldown down for the next teamfight or objective. A transient
    // tilt on those rolls (logit), decaying on its own. Symmetric (either side can
    // force or waste cooldowns) so it cancels in the calibration mirror. Modelled
    // on PICK_ADVANTAGE — slightly smaller, same window + late-game scaling (death
    // timers grow, so a flash-down late is far more punishing).
    COOLDOWN_EDGE_BIAS: 0.35,
    COOLDOWN_EDGE_WINDOW: 3,
    COOLDOWN_EDGE_LATE_MULT: 2,
    // Map state: each enemy tower a side cracks opens the map for them — more
    // vision and more picks. Tower-take advantage (net towers) tilts the next
    // vision/pick roll by this per-tower logit, and total towers down raises the
    // vision-pick CHANCE by this per-tower amount.
    MAP_CONTROL_BIAS: 0.08,
    MAP_CONTROL_VISION_CHANCE: 0.03,
    // Composition win-condition pursuit: how hard a comp's drafted macro pulls
    // events toward its preferred play — a splitpush comp generates cross-map
    // trades / backdoors, a grouping comp forces the teamfight. Blue-positive,
    // cancels when both sides share a macro (e.g. default group-vs-group).
    MACRO_EVENT_BIAS: 0.3,
    // Lane snowball: each lane kill (gank/solo/roam) feeds that lane's LIVE
    // advantage (g/min-equivalent), so a fed lane keeps producing kills and
    // objective prio. Symmetric — either side can snowball.
    LANE_SNOWBALL_PER_KILL: 30,
    // Objective → fight strength: a live Baron/Elder/Soul makes its holder win
    // the actual teamfight harder (added to fight dominance 0..0.6), not just
    // shift win-prob. Soul's value is type-specific (see SOUL_FIGHT_EDGE).
    OBJ_FIGHT_EDGE_BARON: 0.12,
    OBJ_FIGHT_EDGE_ELDER: 0.2,
    // Vision/score → steals: the contesting side's map control protects the pit
    // (per net tower), and a side far behind on gold throws desperation smites.
    STEAL_VISION_REDUCTION: 0.02,
    STEAL_DESPERATION: 0.06,
    STEAL_DESPERATION_DEFICIT: 3e3,
    // Gold lead → bigger power spike: a fed carry's core item swings harder.
    // (In the time-ordered engine a spike's minute is fixed at schedule time, so
    // the lead is recast as extra impact rather than an earlier spike.)
    SPIKE_LEAD_NORM: 4e3,
    // Gank → counter-gank: a gank makes the enemy jungler's counter-gank both
    // more likely and biased back toward the team that just got ganked.
    COUNTERGANK_AFTER_GANK_CHANCE: 0.18,
    COUNTERGANK_RESPONSE_BIAS: 0.5,
    // Wave-crash → tower: crashing the wave into the tower builds plate/turret
    // pressure for the crashing side (and a touch of lane snowball).
    WAVECRASH_TOWER_PRESSURE: 0.18,
    // ─── Closing-fight logit ──────────────────────────────────────────────────
    CLOSING_DIFF_WEIGHT: 0.028,
    CLOSING_GOLD_NORM: 5e3,
    CLOSING_MOMENTUM_WEIGHT: 0.9,
    CLOSING_OBJECTIVE_WEIGHT: 0.4,
    CLOSING_COMBAT_WEIGHT: 0.7,
    // ─── Late-game scaling payoff ─────────────────────────────────────────────
    LATE_RAMP_START: 27,
    // minutes — zero payoff at/under this duration
    LATE_RAMP_DIV: 8,
    // ramp slope: ~2.9 at the 50-min cap
    SCALING_PAYOFF_WEIGHT: 0.26,
    SCALING_PAYOFF_CAP: 3
  };

  // lib/sim/timeline/context.ts
  function picksOf(ctx, side) {
    return side === "blue" ? ctx.bluePicks : ctx.redPicks;
  }
  var clampChance = (p) => Math.max(0.1, Math.min(0.9, p));
  var SOUL_FIGHT_EDGE = {
    Infernal: 0.12,
    Chemtech: 0.09,
    Ocean: 0.07,
    Hextech: 0.06,
    Cloud: 0.05,
    Mountain: 0.05
  };
  var SOUL_STEAL_RESIST = {
    Mountain: 0.08
  };
  function soulFightEdge(soulType) {
    if (!soulType) return 0;
    return SOUL_FIGHT_EDGE[soulType] ?? 0.06;
  }
  function stealChance(tl, base, contestSide) {
    let v = base + tl.mods.stealChanceDelta;
    if (contestSide) {
      const { state } = tl;
      const sign = contestSide === "blue" ? 1 : -1;
      const myMapControl = sign * (state.mapControl.blue - state.mapControl.red);
      v -= Math.max(0, myMapControl) * BALANCE.STEAL_VISION_REDUCTION;
      if (state.soulSide === contestSide) {
        v -= SOUL_STEAL_RESIST[state.soulType ?? ""] ?? 0;
      }
      const oppLead = -sign * state.goldLead;
      if (oppLead < -BALANCE.STEAL_DESPERATION_DEFICIT) {
        v += BALANCE.STEAL_DESPERATION;
      }
    }
    return Math.max(0, Math.min(BALANCE.STEAL_CHANCE_CAP, v));
  }
  function objectiveFightEdge(tl, side, time) {
    const { state } = tl;
    let edge = 0;
    if (state.baronSide === side && state.baronExpiresAt != null && time <= state.baronExpiresAt) {
      edge += BALANCE.OBJ_FIGHT_EDGE_BARON;
    }
    if (state.elderSide === side) edge += BALANCE.OBJ_FIGHT_EDGE_ELDER;
    if (state.soulSide === side) edge += soulFightEdge(state.soulType);
    return edge;
  }
  function netObjectiveFightEdge(tl, side, time) {
    const opp = side === "blue" ? "red" : "blue";
    return objectiveFightEdge(tl, side, time) - objectiveFightEdge(tl, opp, time);
  }
  function bumpLaneLead(tl, side, lane, kills = 1) {
    const delta = (side === "blue" ? 1 : -1) * kills * BALANCE.LANE_SNOWBALL_PER_KILL;
    tl.state.laneLead[lane] += delta;
  }
  function objectiveLogit(tl) {
    const { state } = tl;
    const drakeFactor = (state.drakes.blue - state.drakes.red) * BALANCE.DRAKE_LOGIT_PER_STACK;
    const soulFactor = state.soulSide === "blue" ? BALANCE.SOUL_LOGIT : state.soulSide === "red" ? -BALANCE.SOUL_LOGIT : 0;
    const elderFactor = state.elderSide === "blue" ? BALANCE.ELDER_LOGIT : state.elderSide === "red" ? -BALANCE.ELDER_LOGIT : 0;
    const atakhanFactor = state.atakhanSide === "blue" ? BALANCE.ATAKHAN_LOGIT : state.atakhanSide === "red" ? -BALANCE.ATAKHAN_LOGIT : 0;
    return drakeFactor + soulFactor + elderFactor + atakhanFactor;
  }
  function goldPhaseWeight(time) {
    if (time <= BALANCE.GOLD_WEIGHT_EARLY_MIN) return BALANCE.GOLD_WEIGHT_EARLY;
    if (time >= BALANCE.GOLD_WEIGHT_LATE_MIN) return BALANCE.GOLD_WEIGHT_LATE;
    return BALANCE.GOLD_WEIGHT_EARLY - (time - BALANCE.GOLD_WEIGHT_EARLY_MIN) / BALANCE.GOLD_WEIGHT_SPAN * BALANCE.GOLD_WEIGHT_DROP;
  }
  function snapshotProb(tl, time) {
    const compFactor = tl.ctx.diff * BALANCE.COMP_DIFF_WEIGHT;
    const goldFactor = tl.state.goldLead / BALANCE.GOLD_LEAD_NORM * goldPhaseWeight(time);
    const momFactor = tl.state.momentum * BALANCE.MOMENTUM_WEIGHT;
    const blueBonus = BALANCE.BLUE_SIDE_BONUS;
    const logit = compFactor + goldFactor + momFactor + objectiveLogit(tl) + blueBonus;
    return Math.max(
      BALANCE.SNAPSHOT_PROB_MIN,
      Math.min(BALANCE.SNAPSHOT_PROB_MAX, 1 / (1 + Math.exp(-logit)))
    );
  }
  function comebackBias(tl, time) {
    const lead = tl.state.goldLead / BALANCE.GOLD_LEAD_NORM * goldPhaseWeight(time) + tl.state.momentum * BALANCE.MOMENTUM_WEIGHT;
    const capped = Math.max(
      -BALANCE.COMEBACK_BIAS_CAP,
      Math.min(BALANCE.COMEBACK_BIAS_CAP, lead)
    );
    return -capped * BALANCE.COMEBACK_BIAS_FACTOR;
  }
  function antiStreakBias(tl) {
    const r = tl.state.recentSides;
    if (r.length <= BALANCE.ANTI_STREAK_DEADZONE) return 0;
    let imb = 0;
    for (const s of r) imb += s === "blue" ? 1 : -1;
    const dead = BALANCE.ANTI_STREAK_DEADZONE;
    if (Math.abs(imb) <= dead) return 0;
    const eff = imb - Math.sign(imb) * dead;
    const mag = Math.min(
      BALANCE.ANTI_STREAK_CAP,
      Math.abs(eff) * BALANCE.ANTI_STREAK_PER_EVENT
    );
    return -Math.sign(imb) * mag;
  }
  function formEdge(tl) {
    const b = tl.ctx.blueForms;
    const r = tl.ctx.redForms;
    if (!b && !r) return 0;
    const CARRY = ["top", "jungle", "middle", "bottom"];
    let sum = 0;
    for (const l of CARRY) sum += (b?.[l] ?? 0) - (r?.[l] ?? 0);
    return sum * BALANCE.FORM_OUTPLAY_BIAS;
  }
  function formWeightedLane(candidates, baseWeights, forms, rng) {
    const weights = candidates.map(
      (l, i) => Math.max(0.02, baseWeights[i] * (1 + (forms?.[l] ?? 0) * BALANCE.FORM_LANE_WEIGHT))
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let x = rng() * total;
    for (let i = 0; i < candidates.length; i++) {
      x -= weights[i];
      if (x <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }
  function rollEventSide(tl, time, typeBias = 0, antiStreak = true) {
    const compFactor = tl.ctx.diff * BALANCE.COMP_DIFF_WEIGHT;
    const goldFactor = tl.state.goldLead / BALANCE.GOLD_LEAD_NORM * goldPhaseWeight(time);
    const momFactor = tl.state.momentum * BALANCE.MOMENTUM_WEIGHT;
    const blueBonus = BALANCE.BLUE_SIDE_BONUS;
    const logit = compFactor + goldFactor + momFactor + objectiveLogit(tl) + typeBias + (antiStreak ? antiStreakBias(tl) : 0) + blueBonus;
    const probBlue = 1 / (1 + Math.exp(-logit));
    const clamped = Math.max(
      BALANCE.EVENT_PROB_MIN,
      Math.min(BALANCE.EVENT_PROB_MAX, probBlue)
    );
    return tl.rng() < clamped ? "blue" : "red";
  }
  function pickAdvantageBias(tl, time) {
    const pa = tl.state.pickAdvantage;
    if (!pa || time > pa.expiresAt) return 0;
    const timeScale = Math.min(
      BALANCE.PICK_ADVANTAGE_LATE_MULT,
      1 + Math.max(0, time - 15) / 20
    );
    return (pa.side === "blue" ? 1 : -1) * BALANCE.PICK_ADVANTAGE_BIAS * timeScale;
  }
  function cooldownEdgeBias(tl, time) {
    const ce = tl.state.cooldownEdge;
    if (!ce || time > ce.expiresAt) return 0;
    const timeScale = Math.min(
      BALANCE.COOLDOWN_EDGE_LATE_MULT,
      1 + Math.max(0, time - 15) / 20
    );
    return (ce.side === "blue" ? 1 : -1) * BALANCE.COOLDOWN_EDGE_BIAS * timeScale;
  }
  function objectivePrioBias(tl, kind) {
    const la = tl.state.laneLead;
    const lanes = kind === "drake" ? ["bottom", "support", "jungle"] : ["top", "middle", "jungle"];
    let sum = 0;
    for (const lane of lanes) sum += la[lane];
    return sum / 1e3;
  }
  function mapControlBias(tl) {
    return (tl.state.mapControl.blue - tl.state.mapControl.red) * BALANCE.MAP_CONTROL_BIAS;
  }
  function mapControlChance(tl) {
    return (tl.state.mapControl.blue + tl.state.mapControl.red) * BALANCE.MAP_CONTROL_VISION_CHANCE;
  }
  function macroEventBias(tl, kind) {
    const want = kind === "trade" ? "splitpush" : kind === "teamfight" ? "group" : kind === "tower" ? "siege" : "pick";
    let bias = 0;
    if (tl.ctx.blueStrategy.macro === want) bias += BALANCE.MACRO_EVENT_BIAS;
    if (tl.ctx.redStrategy.macro === want) bias -= BALANCE.MACRO_EVENT_BIAS;
    return bias;
  }
  function rollTowerSide(tl, time) {
    let pressureDiff = tl.state.towerPressure.blue - tl.state.towerPressure.red;
    if (tl.state.baronExpiresAt != null && time <= tl.state.baronExpiresAt && tl.state.baronSide) {
      pressureDiff += (tl.state.baronSide === "blue" ? 1 : -1) * BALANCE.BARON_TOWER_PRESSURE;
    }
    return rollEventSide(
      tl,
      time,
      pressureDiff * BALANCE.TOWER_PRESSURE_BIAS + macroEventBias(tl, "tower")
    );
  }
  function consumeTowerPressure(tl, side) {
    tl.state.towerPressure[side] = Math.max(
      0,
      tl.state.towerPressure[side] - BALANCE.TOWER_PRESSURE_CONSUME
    );
  }
  function detectComeback(tl, side, momentumImpact) {
    if (momentumImpact < BALANCE.COMEBACK_MIN_IMPACT) return "";
    const wasLosing = side === "blue" && (tl.state.goldLead < -BALANCE.COMEBACK_GOLD_DEFICIT || tl.state.momentum < -BALANCE.COMEBACK_MOMENTUM_DEFICIT) || side === "red" && (tl.state.goldLead > BALANCE.COMEBACK_GOLD_DEFICIT || tl.state.momentum > BALANCE.COMEBACK_MOMENTUM_DEFICIT);
    return wasLosing ? "MOMENTUM SHIFT! " : "";
  }
  function applyState(tl, side, kills, towers, inhibs, momentumImpact) {
    const { state } = tl;
    state.goldLead += (kills.blue - kills.red) * BALANCE.KILL_GOLD + (towers.blue - towers.red) * BALANCE.TOWER_GOLD + (inhibs.blue - inhibs.red) * BALANCE.INHIB_GOLD;
    state.mapControl.blue += towers.blue + inhibs.blue;
    state.mapControl.red += towers.red + inhibs.red;
    state.momentum *= BALANCE.MOMENTUM_DECAY;
    state.momentum += side === "blue" ? momentumImpact : -momentumImpact;
    state.momentum = Math.max(-1, Math.min(1, state.momentum));
  }
  function addEvent(tl, type, minutes, side, description, deltas = {}, momentumImpact = 0.15) {
    const kills = deltas.kills ?? NO_KILLS;
    const towers = deltas.towers ?? NO_KILLS;
    const inhibs = deltas.inhibs ?? NO_KILLS;
    const baseLaneGold = deltas.laneGoldDelta ?? {};
    const kdaDelta = deltas.kdaDelta ?? NO_KDA;
    const laneGoldDelta = mergeLaneGold(baseLaneGold, kdaToLaneGold(kdaDelta));
    const flair = detectComeback(tl, side, momentumImpact);
    tl.state.recentSides.push(side);
    if (tl.state.recentSides.length > BALANCE.ANTI_STREAK_WINDOW) {
      tl.state.recentSides.shift();
    }
    applyState(tl, side, kills, towers, inhibs, momentumImpact);
    const winProbAfter = snapshotProb(tl, minutes);
    tl.events.push({
      type,
      minutes,
      time: formatTime(minutes),
      side,
      description: flair + description,
      kills,
      towers,
      inhibs,
      laneGoldDelta,
      kdaDelta,
      winProbAfter,
      // Snapshot the post-event gold lead so the UI can render a
      // gold-over-time chart without re-walking laneGoldDelta. Captures
      // the same applyState() output that drives win-prob.
      goldLeadAfter: tl.state.goldLead,
      momentumAfter: tl.state.momentum,
      mapControlAfter: tl.state.mapControl.blue - tl.state.mapControl.red,
      ...deltas.soulElement ? { soulElement: deltas.soulElement } : {},
      ...deltas.atakhanVariant ? { atakhanVariant: deltas.atakhanVariant } : {},
      ...deltas.pentakill ? { pentakill: deltas.pentakill } : {}
    });
  }

  // lib/sim/timeline/closing.ts
  function computeFinalLaneGold(tl) {
    const finalLaneGold = {
      top: 0,
      jungle: 0,
      middle: 0,
      bottom: 0,
      support: 0
    };
    for (const e of tl.events) {
      for (const lane of POSITIONAL_LANES3) {
        finalLaneGold[lane] += e.laneGoldDelta[lane] ?? 0;
      }
    }
    const lanePhaseTime = Math.min(tl.duration, 14);
    for (const lane of POSITIONAL_LANES3) {
      finalLaneGold[lane] += tl.ctx.laneAdvantages[lane] * lanePhaseTime;
    }
    return finalLaneGold;
  }
  function decideClosingWinner(tl, combat) {
    const { ctx, state, duration, mods } = tl;
    const blueLate = lateScalingCount(ctx.bluePicks);
    const redLate = lateScalingCount(ctx.redPicks);
    const blueEarly = earlyCount(ctx.bluePicks);
    const redEarly = earlyCount(ctx.redPicks);
    const scalingEdge = blueLate - redLate + (redEarly - blueEarly) * 0.5;
    const lateGameRamp = Math.max(
      0,
      (duration - BALANCE.LATE_RAMP_START) / BALANCE.LATE_RAMP_DIV
    );
    const scalingPayoff = Math.max(
      -BALANCE.SCALING_PAYOFF_CAP,
      Math.min(
        BALANCE.SCALING_PAYOFF_CAP,
        scalingEdge * lateGameRamp * BALANCE.SCALING_PAYOFF_WEIGHT
      )
    );
    const closingLogit = (ctx.diff * BALANCE.CLOSING_DIFF_WEIGHT + state.goldLead / BALANCE.CLOSING_GOLD_NORM * goldPhaseWeight(duration) + state.momentum * BALANCE.CLOSING_MOMENTUM_WEIGHT + objectiveLogit(tl) * BALANCE.CLOSING_OBJECTIVE_WEIGHT + Math.log(combat.ratio) * BALANCE.CLOSING_COMBAT_WEIGHT + scalingPayoff) * // Risk dial: high-roll flattens the deciding fight toward a coinflip
    // (helps the underdog), safe sharpens it toward the favorite.
    mods.closingRiskFactor;
    const closingProb = 1 / (1 + Math.exp(-closingLogit));
    return tl.rng() < closingProb ? "blue" : "red";
  }
  function phaseInhibitorCascade(tl, finalWinner) {
    const isStomp = Math.abs(tl.state.goldLead) >= BALANCE.STOMP_LEAD;
    const isMajor = Math.abs(tl.state.goldLead) >= BALANCE.MAJOR_LEAD;
    const buffSiege = tl.state.elderSide === finalWinner || tl.state.baronSide === finalWinner ? BALANCE.BUFF_SIEGE_INHIB_BONUS : 0;
    const inhibCount = (isStomp ? rollInt(2, 3, tl.rng) : isMajor ? rollInt(1, 2, tl.rng) : 1) + buffSiege;
    const t = jitter(tl.duration - 4, tl.duration - 2, tl.rng);
    addEvent(
      tl,
      "inhibitor",
      t,
      finalWinner,
      describeInhibitor(
        finalWinner,
        picksOf(tl.ctx, finalWinner),
        tl.ctx.blueName,
        tl.ctx.redName,
        tl.rng
      ) + (inhibCount > 1 ? ` (\xD7${inhibCount})` : ""),
      {
        towers: killsForSide(
          finalWinner,
          rollInt(1, 2, tl.rng) + (inhibCount - 1),
          0
        ),
        inhibs: killsForSide(finalWinner, inhibCount, 0),
        laneGoldDelta: singleLaneGold(
          pickRandom(["top", "middle", "bottom"], tl.rng),
          350 + (inhibCount - 1) * 200,
          finalWinner
        )
      },
      0.25 + (inhibCount - 1) * 0.08
    );
  }
  function phaseLastStand(tl, finalWinner) {
    if (Math.abs(tl.state.goldLead) < BALANCE.MAJOR_LEAD) return;
    if (tl.rng() >= BALANCE.LAST_STAND_CHANCE) return;
    const loser = finalWinner === "blue" ? "red" : "blue";
    const t = jitter(tl.duration - 2.6, tl.duration - 2, tl.rng);
    addEvent(
      tl,
      "comeback",
      t,
      loser,
      describeLastStand(loser, tl.ctx.blueName, tl.ctx.redName),
      {
        kills: killsForSide(loser, 1, 0),
        laneGoldDelta: spreadLaneGold(60, loser),
        kdaDelta: laneKillKDA(loser, "middle")
      },
      0.1
    );
  }
  function phaseClosingFight(tl, finalWinner, combat) {
    const t = jitter(tl.duration - 3, tl.duration - 0.7, tl.rng);
    const wScore = finalWinner === "blue" ? tl.ctx.blueScore : tl.ctx.redScore;
    const winnerPicks = picksOf(tl.ctx, finalWinner);
    const hasSplitter = !!findByArchetype(winnerPicks, ["splitpush"]);
    const closeGame = Math.abs(tl.state.goldLead) < 4e3;
    const backdoorRoll = tl.rng();
    const winnerStrategy = finalWinner === "blue" ? tl.ctx.blueStrategy : tl.ctx.redStrategy;
    const pivotBackdoorBonus = tl.pivot && tl.pivot.kind === "splitpush" && tl.pivot.side === finalWinner ? 0.12 : 0;
    const useBackdoor = hasSplitter && closeGame && backdoorRoll < 0.12 + backdoorBonusFor(winnerStrategy) + pivotBackdoorBonus;
    if (useBackdoor) {
      const bdWk = rollInt(0, 1, tl.rng);
      const bdLk = rollInt(0, 1, tl.rng);
      addEvent(
        tl,
        "backdoor",
        t,
        finalWinner,
        describeBackdoor(
          finalWinner,
          winnerPicks,
          tl.ctx.blueName,
          tl.ctx.redName
        ),
        {
          kills: killsForSide(finalWinner, bdWk, bdLk),
          towers: killsForSide(finalWinner, rollInt(1, 2, tl.rng), 0),
          laneGoldDelta: spreadLaneGold(400, finalWinner),
          kdaDelta: teamfightKDA(finalWinner, bdWk, bdLk, tl.rng)
        },
        0.5
      );
    } else if (tl.rng() < 0.5) {
      const penta = tl.rng() < BALANCE.PENTAKILL_CHANCE ? pentakiller(
        picksOf(tl.ctx, finalWinner),
        tl.rng,
        finalWinner === "blue" ? tl.ctx.blueForms : tl.ctx.redForms
      ) : null;
      addEvent(
        tl,
        "ace",
        t,
        finalWinner,
        penta ? `PENTAKILL!! ${penta.champ.name} solo-aces to end it` : describeAce(finalWinner, tl.ctx.blueName, tl.ctx.redName),
        {
          kills: killsForSide(finalWinner, 5, 0),
          towers: killsForSide(finalWinner, rollInt(1, 2, tl.rng), 0),
          laneGoldDelta: spreadLaneGold(800, finalWinner),
          kdaDelta: penta ? pentakillKDA(finalWinner, penta.lane) : aceKDA(finalWinner),
          pentakill: penta ? { lane: penta.lane, championName: penta.champ.name } : void 0
        },
        0.5
      );
    } else {
      const aligned = finalWinner === combat.winnerSide;
      const objEdge = Math.max(0, netObjectiveFightEdge(tl, finalWinner, t));
      const wk = (aligned ? combat.winnerKills : Math.max(2, combat.winnerKills - 2)) + Math.round(objEdge * 3);
      const lk = Math.max(
        0,
        (aligned ? combat.loserKills : Math.min(3, combat.loserKills + 1)) - (objEdge >= 0.18 ? 1 : 0)
      );
      const cfDesc = describeTeamfight(
        finalWinner,
        winnerPicks,
        wScore.identityLabel,
        wk,
        lk,
        tl.rng
      );
      const cfTowers = killsForSide(finalWinner, rollInt(1, 2, tl.rng), 0);
      const cfKda = teamfightKDA(finalWinner, wk, lk, tl.rng);
      addEvent(
        tl,
        "teamfight",
        t,
        finalWinner,
        nameActualFragger(cfDesc, winnerPicks, cfKda, finalWinner, TEAMFIGHT_CARRY_ARCHETYPES),
        {
          kills: killsForSide(finalWinner, wk, lk),
          towers: cfTowers,
          laneGoldDelta: spreadLaneGold(
            wk * BALANCE.CLOSING_KILL_PUSH_GOLD,
            finalWinner
          ),
          kdaDelta: cfKda
        },
        0.45
      );
    }
  }
  function phaseNexus(tl, finalWinner) {
    const baseRace = tl.rng() < BALANCE.BASE_RACE_CHANCE;
    addEvent(
      tl,
      "nexus",
      tl.duration,
      finalWinner,
      baseRace ? describeBaseRace(finalWinner, tl.ctx.blueName, tl.ctx.redName) : describeNexus(
        finalWinner,
        tl.ctx.blueName,
        tl.ctx.redName,
        formatTime(tl.duration)
      ),
      {
        towers: killsForSide(finalWinner, 2, 0),
        laneGoldDelta: spreadLaneGold(500, finalWinner)
      },
      0
    );
  }
  function finalizeTimeline(tl) {
    const { events } = tl;
    events.sort((a, b) => a.minutes - b.minutes);
    const firstTower = events.find(
      (e) => e.type === "tower" && (e.towers.blue > 0 || e.towers.red > 0) && e.minutes < 18
    );
    const laningEndMinute = firstTower?.minutes ?? 14;
    let laneAdvSum = 0;
    for (const lane of POSITIONAL_LANES3) laneAdvSum += tl.ctx.laneAdvantages[lane];
    let cumulativeEventGold = 0;
    for (const e of events) {
      for (const lane of POSITIONAL_LANES3) {
        cumulativeEventGold += e.laneGoldDelta[lane] ?? 0;
      }
      const lanePhaseTime = Math.min(e.minutes, laningEndMinute);
      e.goldLeadAfter = Math.round(
        laneAdvSum * lanePhaseTime + cumulativeEventGold
      );
    }
    const nexusEvt = events.find((e) => e.type === "nexus");
    if (nexusEvt) {
      const winnerBlue = nexusEvt.side === "blue";
      const certain = winnerBlue ? 0.99 : 0.01;
      const tipped = winnerBlue ? 0.75 : 0.25;
      const closingStart = tl.duration - 4.5;
      for (const e of events) {
        if (e.minutes < closingStart || e.side !== nexusEvt.side) continue;
        if (e.type === "nexus") e.winProbAfter = certain;
        else
          e.winProbAfter = winnerBlue ? Math.max(e.winProbAfter, tipped) : Math.min(e.winProbAfter, tipped);
      }
    }
    return laningEndMinute;
  }

  // lib/sim/timeline/laning.ts
  function pickGankableLane(laneAdvantages, gankerSide) {
    const sign = gankerSide === "blue" ? -1 : 1;
    const candidates = ["top", "middle", "bottom"];
    const ranked = candidates.map((l) => ({ lane: l, score: sign * laneAdvantages[l] })).sort((a, b) => b.score - a.score);
    return ranked[0].lane;
  }
  function pickBullyLane(laneAdvantages, side) {
    const sign = side === "blue" ? 1 : -1;
    const candidates = ["top", "middle", "bottom"];
    const ranked = candidates.map((l) => ({ lane: l, advantage: sign * laneAdvantages[l] })).sort((a, b) => b.advantage - a.advantage);
    if (ranked[0].advantage >= 50) return ranked[0].lane;
    return null;
  }
  function phaseLevelOneInvade(tl) {
    const t = jitter(0.3, 1.8, tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= 0.3) return;
      const side = rollEventSide(tl, t);
      const wp = picksOf(tl.ctx, side);
      const lp = picksOf(tl.ctx, side === "blue" ? "red" : "blue");
      const killHappened = tl.rng() < 0.55;
      const kda = makeKDA();
      if (killHappened) {
        addKill(kda, side, "jungle");
        addAssist(kda, side, "support");
        addDeath(kda, side === "blue" ? "red" : "blue", "jungle");
      }
      addEvent(
        tl,
        "invade",
        t,
        side,
        describeInvade(side, wp, lp, tl.ctx.blueName, tl.ctx.redName, tl.rng),
        {
          kills: killHappened ? killsForSide(side, 1, 0) : NO_KILLS,
          laneGoldDelta: spreadLaneGold(killHappened ? 200 : 80, side),
          kdaDelta: kda
        },
        0.12
      );
    });
  }
  function phaseCheese(tl) {
    const t = jitter(1, 3, tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= BALANCE.CHEESE_CHANCE) return;
      const side = rollEventSide(tl, t, tl.laneBias * 0.3);
      const oppSide = side === "blue" ? "red" : "blue";
      const success = tl.rng() < BALANCE.CHEESE_SUCCESS_ODDS;
      const lane = pickRandom(["top", "middle"], tl.rng);
      addEvent(
        tl,
        "invade",
        t,
        success ? side : oppSide,
        describeCheese(
          side,
          picksOf(tl.ctx, side),
          tl.ctx.blueName,
          tl.ctx.redName,
          success,
          tl.rng
        ),
        success ? {
          kills: killsForSide(side, 1, 0),
          laneGoldDelta: singleLaneGold(lane, 120, side),
          kdaDelta: laneKillKDA(side, lane)
        } : { laneGoldDelta: singleLaneGold(lane, 60, oppSide) },
        success ? 0.14 : 0.06
      );
      if (success) bumpLaneLead(tl, side, lane);
    });
  }
  function phaseFirstScuttle(tl) {
    const t = jitter(3, 4.5, tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= 0.6) return;
      const side = rollEventSide(tl, t);
      addEvent(
        tl,
        "scuttle",
        t,
        side,
        describeScuttle(
          side,
          picksOf(tl.ctx, side),
          tl.ctx.blueName,
          tl.ctx.redName,
          tl.rng
        ),
        { laneGoldDelta: singleLaneGold("jungle", 80, side) },
        0.06
      );
      bumpLaneLead(tl, side, "jungle", BALANCE.SCUTTLE_JUNGLE_SNOWBALL);
    });
  }
  function phaseSoloKills(tl) {
    const t = jitter(4, 7, tl.rng);
    tl.schedule(t, () => {
      const blueBully = pickBullyLane(tl.state.laneLead, "blue");
      const redBully = pickBullyLane(tl.state.laneLead, "red");
      let bullySide = null;
      if (blueBully && !redBully) bullySide = "blue";
      else if (redBully && !blueBully) bullySide = "red";
      else if (blueBully && redBully) {
        const blueAdv = Math.abs(tl.state.laneLead[blueBully]);
        const redAdv = Math.abs(tl.state.laneLead[redBully]);
        bullySide = blueAdv > redAdv ? "blue" : "red";
      }
      if (!bullySide) return;
      const lane = pickBullyLane(tl.state.laneLead, bullySide);
      const advMag = Math.abs(tl.state.laneLead[lane]);
      const numKills = advMag >= 100 ? rollInt(2, 3, tl.rng) : advMag >= 65 ? rollInt(1, 2, tl.rng) : 1;
      const winnerChamp = picksOf(tl.ctx, bullySide)[POSITIONAL_LANES3.indexOf(lane)];
      const laneShort = lane === "middle" ? "mid" : lane === "bottom" ? "bot" : lane;
      const desc = numKills > 1 && winnerChamp ? `${winnerChamp.name} dominates ${laneShort} (${numKills} solo kills)` : describeSoloKill(bullySide, picksOf(tl.ctx, bullySide), lane);
      addEvent(
        tl,
        "solo-kill",
        t,
        bullySide,
        desc,
        {
          kills: killsForSide(bullySide, numKills, 0),
          // Kill bounty (300g) flows via kdaDelta. The lane delta here is
          // just the lost-CS gold from the victim recalling/dying — small.
          laneGoldDelta: singleLaneGold(lane, 120 * numKills, bullySide),
          kdaDelta: laneKillKDA(bullySide, lane, numKills)
        },
        0.15 + numKills * 0.05
      );
      bumpLaneLead(tl, bullySide, lane, numKills);
    });
  }
  function phaseFirstBlood(tl) {
    const t = jitter(3, 5.5, tl.rng);
    tl.schedule(t, () => {
      const side = rollEventSide(tl, t, 0.1 + tl.mods.earlyAggroBias);
      const isFirstBlood = !tl.events.some(
        (e) => (e.kills.blue > 0 || e.kills.red > 0) && e.minutes <= t
      );
      const fbLanes = ["top", "jungle", "middle", "bottom"];
      const fbLane = pickRandom(fbLanes, tl.rng);
      const winnerChamp = picksOf(tl.ctx, side)[POSITIONAL_LANES3.indexOf(fbLane)] ?? null;
      const desc = isFirstBlood ? describeFirstBlood(
        side,
        picksOf(tl.ctx, side),
        picksOf(tl.ctx, side === "blue" ? "red" : "blue"),
        t,
        tl.rng
      ) : winnerChamp ? `Early kill \u2014 ${winnerChamp.name} draws blood ${fbLane === "middle" ? "mid" : fbLane === "bottom" ? "bot" : fbLane}` : `Early kill in ${fbLane === "middle" ? "mid" : fbLane === "bottom" ? "bot" : fbLane}`;
      const creditLane = (isFirstBlood ? firstBloodKillerLane(picksOf(tl.ctx, side)) : null) ?? fbLane;
      const fbKda = laneKillKDA(side, creditLane);
      if (tl.rng() < 0.4 && creditLane !== "jungle") {
        addAssist(fbKda, side, "jungle");
      }
      addEvent(
        tl,
        // Only TYPE it first-blood when it actually IS first blood — otherwise
        // the UI would stamp a "First Blood" badge on an "early kill" that
        // something already preceded. A follow-up early kill is just a solo kill.
        isFirstBlood ? "first-blood" : "solo-kill",
        t,
        side,
        desc,
        {
          kills: killsForSide(side, 1, 0),
          laneGoldDelta: singleLaneGold(creditLane, isFirstBlood ? 100 : 0, side),
          kdaDelta: fbKda
        },
        0.2
      );
      bumpLaneLead(tl, side, creditLane);
    });
  }
  function phaseGank(tl) {
    const t = jitter(3.5, 9.5, tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= clampChance(0.55 + tl.mods.gankChanceDelta)) return;
      const jgBias = tl.state.jungleBehind === "blue" ? -BALANCE.JUNGLE_BEHIND_GANK_DAMP : tl.state.jungleBehind === "red" ? BALANCE.JUNGLE_BEHIND_GANK_DAMP : 0;
      const side = rollEventSide(
        tl,
        t,
        tl.laneBias * 0.5 + tl.mods.gankBias + jgBias + tl.mods.earlyAggroBias * 0.4
      );
      const lane = pickGankableLane(tl.state.laneLead, side);
      addEvent(
        tl,
        "gank",
        t,
        side,
        describeGank(
          side,
          picksOf(tl.ctx, side),
          lane,
          tl.ctx.blueName,
          tl.ctx.redName
        ),
        {
          kills: killsForSide(side, 1, 0),
          // Kill+assist gold flows through kdaDelta. Remaining lane gold here
          // models lost CS for the victim while recalling.
          laneGoldDelta: gankLaneGold(lane, 100, side),
          kdaDelta: gankKDA(side, lane, "jungle", lane)
        },
        0.16
      );
      bumpLaneLead(tl, side, lane);
      tl.state.lastGankSide = side;
    });
  }
  function phaseCounterGank(tl) {
    const t = jitter(5.5, 9.5, tl.rng);
    tl.schedule(t, () => {
      const ganked = tl.state.lastGankSide;
      const chance = 0.3 + (ganked ? BALANCE.COUNTERGANK_AFTER_GANK_CHANCE : 0);
      if (tl.rng() >= chance) return;
      const responseBias = ganked ? (ganked === "blue" ? -1 : 1) * BALANCE.COUNTERGANK_RESPONSE_BIAS : 0;
      const side = rollEventSide(tl, t, responseBias);
      const flippedLane = pickRandom(["top", "middle", "bottom"], tl.rng);
      addEvent(
        tl,
        "counter-gank",
        t,
        side,
        describeCounterGank(
          side,
          picksOf(tl.ctx, side),
          tl.ctx.blueName,
          tl.ctx.redName
        ),
        {
          kills: killsForSide(side, 1, 0),
          laneGoldDelta: gankLaneGold(flippedLane, 100, side),
          kdaDelta: gankKDA(side, "jungle", flippedLane, "jungle")
        },
        0.18
      );
      bumpLaneLead(tl, side, flippedLane);
      tl.state.lastGankSide = null;
    });
  }
  function phaseBuffSteal(tl) {
    const t = jitter(5.5, 9, tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= 0.22) return;
      const side = rollEventSide(tl, t, tl.laneBias * 0.6);
      const killHappened = tl.rng() < 0.4;
      addEvent(
        tl,
        "buff-steal",
        t,
        side,
        describeBuffSteal(
          side,
          picksOf(tl.ctx, side),
          tl.ctx.blueName,
          tl.ctx.redName,
          tl.rng
        ),
        {
          kills: killHappened ? killsForSide(side, 1, 0) : NO_KILLS,
          laneGoldDelta: singleLaneGold("jungle", killHappened ? 220 : 100, side),
          kdaDelta: killHappened ? laneKillKDA(side, "jungle", 1, "jungle") : NO_KDA
        },
        0.1
      );
      tl.state.jungleBehind = side === "blue" ? "red" : "blue";
    });
  }
  function phasePlates(tl) {
    const t = jitter(8, 12, tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= 0.5) return;
      const side = rollEventSide(tl, t, tl.laneBias * 0.7);
      addEvent(
        tl,
        "plates",
        t,
        side,
        describePlates(
          side,
          picksOf(tl.ctx, side),
          tl.ctx.blueName,
          tl.ctx.redName,
          tl.rng
        ),
        { laneGoldDelta: sideLaneGoldSplit(400, side) },
        0.1
      );
      bumpLaneLead(tl, side, "top", BALANCE.PLATE_LANE_SNOWBALL);
      bumpLaneLead(tl, side, "bottom", BALANCE.PLATE_LANE_SNOWBALL);
    });
  }
  function phaseMidRoam(tl) {
    const t = jitter(9, 13, tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= clampChance(0.4 + tl.mods.roamChanceDelta)) return;
      const side = rollEventSide(tl, t, tl.laneBias * 0.9 + tl.mods.roamBias);
      const targetLane = pickRandom(["top", "bottom"], tl.rng);
      addEvent(
        tl,
        "roam",
        t,
        side,
        describeRoam(
          side,
          picksOf(tl.ctx, side),
          targetLane,
          tl.ctx.blueName,
          tl.ctx.redName,
          "middle"
        ),
        {
          kills: killsForSide(side, 1, 0),
          // Kill bounty + roamer assist via kdaDelta; lane delta = lost CS only.
          laneGoldDelta: gankLaneGold(targetLane, 100, side),
          // Roamer (mid) gets the kill, the laner being roamed for assists,
          // opponent in target lane dies.
          kdaDelta: gankKDA(side, "middle", targetLane, targetLane)
        },
        0.13
      );
      bumpLaneLead(tl, side, targetLane);
      tl.state.towerPressure[side] += BALANCE.ROAM_TOWER_PRESSURE;
    });
  }
  function phaseSupportRoam(tl) {
    const t = jitter(8, 13, tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= clampChance(0.28 + tl.mods.roamChanceDelta)) return;
      const side = rollEventSide(tl, t, tl.laneBias * 0.9 + tl.mods.roamBias);
      const targetLane = pickRandom(["middle", "top"], tl.rng);
      const oppSide = side === "blue" ? "red" : "blue";
      addEvent(
        tl,
        "roam",
        t,
        side,
        describeSupportRoam(
          side,
          picksOf(tl.ctx, side),
          targetLane,
          tl.ctx.blueName,
          tl.ctx.redName
        ),
        {
          kills: killsForSide(side, 1, 0),
          // Target laner gets the kill (60%), support the assist (40%); the ADC
          // left alone in bot bleeds the counterpart penalty.
          laneGoldDelta: supportRoamLaneGold(targetLane, 100, 50, side),
          // Laner kills, roaming support assists, enemy in the target lane dies.
          kdaDelta: gankKDA(side, targetLane, "support", targetLane)
        },
        0.13
      );
      bumpLaneLead(tl, side, targetLane);
      bumpLaneLead(tl, oppSide, "bottom", 0.5);
      tl.state.towerPressure[side] += BALANCE.ROAM_TOWER_PRESSURE;
    });
  }
  function phaseWaveCrash(tl) {
    const t = jitter(8, 13, tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= 0.35) return;
      const side = rollEventSide(tl, t, tl.laneBias * 0.5);
      const lane = pickRandom(["top", "middle", "bottom"], tl.rng);
      addEvent(
        tl,
        "wave-crash",
        t,
        side,
        describeWaveCrash(
          side,
          picksOf(tl.ctx, side),
          lane,
          tl.ctx.blueName,
          tl.ctx.redName
        ),
        { laneGoldDelta: singleLaneGold(lane, 220, side) },
        0.06
      );
      tl.state.towerPressure[side] += BALANCE.WAVECRASH_TOWER_PRESSURE;
      bumpLaneLead(tl, side, lane);
    });
  }
  function phaseLevelSpikeGank(tl) {
    const t = jitter(6, 9, tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= BALANCE.LEVEL_SPIKE_GANK_CHANCE) return;
      const side = rollEventSide(tl, t, tl.laneBias * 0.4 + tl.mods.gankBias);
      const lane = pickRandom(["top", "middle", "bottom"], tl.rng);
      const champ = picksOf(tl.ctx, side)[POSITIONAL_LANES3.indexOf(lane)];
      const laneShort = lane === "middle" ? "mid" : lane === "bottom" ? "bot" : lane;
      const desc = champ ? `LEVEL 6 \u2014 ${champ.name} hits ult and all-ins ${laneShort}` : `Level-6 all-in ${laneShort}`;
      addEvent(
        tl,
        "gank",
        t,
        side,
        desc,
        {
          kills: killsForSide(side, 1, 0),
          laneGoldDelta: gankLaneGold(lane, 100, side),
          kdaDelta: gankKDA(side, lane, "jungle", lane)
        },
        0.16
      );
      bumpLaneLead(tl, side, lane);
    });
  }

  // lib/sim/timeline/objectives.ts
  function phaseGrubs(tl) {
    const t = jitter(6, 7.5, tl.rng);
    tl.schedule(t, () => {
      const side = rollEventSide(tl, t, tl.laneBias * 0.7);
      const grubsTaken = tl.rng() < 0.5 ? 6 : tl.rng() < 0.7 ? 3 : rollInt(4, 5, tl.rng);
      tl.state.grubCount[side] += grubsTaken;
      tl.state.towerPressure[side] += grubsTaken * BALANCE.GRUB_TOWER_PRESSURE;
      const grubGold = 60 + grubsTaken * 25;
      addEvent(
        tl,
        "grubs",
        t,
        side,
        describeGrubs(side, tl.ctx.blueName, tl.ctx.redName, grubsTaken),
        { laneGoldDelta: spreadLaneGold(grubGold, side) },
        0.06 + grubsTaken * 0.01
      );
      const laneBump = grubsTaken / 6 * BALANCE.GRUB_LANE_SNOWBALL;
      bumpLaneLead(tl, side, "top", laneBump);
      bumpLaneLead(tl, side, "middle", laneBump);
    });
  }
  function contestDrake(tl, t, sideBias, stealBase, drakeGold, momStolen, momPlain) {
    const contestSide = rollEventSide(
      tl,
      t,
      sideBias + pickAdvantageBias(tl, t) + cooldownEdgeBias(tl, t),
      false
    );
    const stolen = tl.rng() < stealChance(tl, stealBase, contestSide);
    const side = stolen ? contestSide === "blue" ? "red" : "blue" : contestSide;
    tl.state.drakes[side]++;
    if (tl.state.drakes[side] === 4 && tl.state.soulSide == null) {
      tl.state.soulSide = side;
      const soulType = pickRandom(DRAGON_TYPES, tl.rng);
      tl.state.soulType = soulType;
      const wK = rollInt(1, 3, tl.rng);
      const lK = rollInt(0, 2, tl.rng);
      addEvent(
        tl,
        "soul",
        t,
        side,
        describeSoul(side, tl.ctx.blueName, tl.ctx.redName, soulType),
        {
          kills: killsForSide(side, wK, lK),
          towers: killsForSide(side, rollInt(0, 1, tl.rng), 0),
          laneGoldDelta: spreadLaneGold(800, side),
          kdaDelta: teamfightKDA(side, wK, lK, tl.rng),
          soulElement: soulType
        },
        0.55
      );
    } else {
      const drakeType = pickRandom(DRAGON_TYPES, tl.rng);
      const stealK = stolen ? rollInt(1, 2, tl.rng) : 0;
      addEvent(
        tl,
        "dragon",
        t,
        side,
        describeDragon(
          side,
          tl.ctx.blueName,
          tl.ctx.redName,
          tl.state.drakes[side],
          drakeType,
          stolen
        ),
        {
          kills: stolen ? killsForSide(side, 0, stealK) : NO_KILLS,
          laneGoldDelta: spreadLaneGold(drakeGold, side),
          // For a steal, opponents collected the kills (loser of objective
          // wins the post-smite skirmish). Otherwise no kills, no KDA.
          kdaDelta: stolen ? objectiveKDA(
            side === "blue" ? "red" : "blue",
            stealK,
            0,
            true,
            side,
            tl.rng
          ) : NO_KDA
        },
        stolen ? momStolen : momPlain
      );
    }
  }
  function phaseFirstDrake(tl) {
    const t = jitter(6.5, 8.3, tl.rng);
    tl.schedule(t, () => {
      contestDrake(
        tl,
        t,
        objectivePrioBias(tl, "drake") * 0.6 + tl.mods.drakeBias,
        0.08,
        150,
        0.25,
        0.12
      );
    });
  }
  function phaseSecondDrake(tl) {
    if (tl.duration < 18) return;
    const t = jitter(11.5, 14.3, tl.rng);
    tl.schedule(t, () => {
      contestDrake(
        tl,
        t,
        objectivePrioBias(tl, "drake") * 0.4 + tl.mods.drakeBias,
        0.08,
        200,
        0.28,
        0.14
      );
    });
  }
  function phaseThirdDrake(tl) {
    if (tl.duration < 22) return;
    const t = jitter(16.5, 20, tl.rng);
    tl.schedule(t, () => {
      contestDrake(tl, t, tl.mods.drakeBias, 0.1, 220, 0.3, 0.15);
    });
  }
  function phaseFourthDrakeSoul(tl) {
    if (tl.duration < 26) return;
    const t = jitter(21, Math.min(25, tl.duration - 3), tl.rng);
    tl.schedule(t, () => {
      if (tl.state.soulSide != null) return;
      contestDrake(tl, t, tl.mods.drakeBias, 0.1, 240, 0.3, 0.18);
    });
  }
  function phaseFirstTower(tl) {
    const t = jitter(10, 13, tl.rng);
    tl.schedule(t, () => {
      const side = rollTowerSide(tl, t);
      consumeTowerPressure(tl, side);
      const towerLane = pickRandom(["top", "middle", "bottom"], tl.rng);
      addEvent(
        tl,
        "tower",
        t,
        side,
        describeTower(
          side,
          picksOf(tl.ctx, side),
          tl.ctx.blueName,
          tl.ctx.redName,
          true,
          tl.rng
        ),
        {
          towers: killsForSide(side, 1, 0),
          // First turret of the game pays the real-LoL first-tower bonus on top
          // of the structure bounty.
          laneGoldDelta: singleLaneGold(
            towerLane,
            350 + BALANCE.FIRST_TOWER_BONUS,
            side
          )
        },
        0.15
      );
    });
  }
  function phaseAtakhanOrHerald(tl) {
    const t = jitter(14, 16, tl.rng);
    tl.schedule(t, () => {
      const side = rollEventSide(
        tl,
        t,
        objectivePrioBias(tl, "herald") * 0.4 + tl.mods.atakhanBias
      );
      if (tl.rng() < 0.6) {
        const atakhanVariant = tl.rng() < 0.5 ? "Voracious" : "Ruinous";
        tl.state.atakhanVariant = atakhanVariant;
        tl.state.atakhanSide = side;
        if (atakhanVariant === "Ruinous") tl.state.ruinousActive = true;
        const wKills = rollInt(1, 2, tl.rng);
        const lKills = rollInt(0, 1, tl.rng);
        addEvent(
          tl,
          "atakhan",
          t,
          side,
          describeAtakhan(side, tl.ctx.blueName, tl.ctx.redName, atakhanVariant),
          {
            kills: killsForSide(side, wKills, lKills),
            laneGoldDelta: spreadLaneGold(250, side),
            kdaDelta: teamfightKDA(side, wKills, lKills, tl.rng),
            atakhanVariant
          },
          0.18
        );
      } else {
        const heraldLane = pickRandom(["top", "middle"], tl.rng);
        tl.state.towerPressure[side] += BALANCE.HERALD_TOWER_PRESSURE;
        addEvent(
          tl,
          "herald",
          t,
          side,
          describeHerald(side, tl.ctx.blueName, tl.ctx.redName, tl.rng),
          {
            towers: killsForSide(side, 1, 0),
            laneGoldDelta: singleLaneGold(heraldLane, 350, side)
          },
          0.13
        );
      }
    });
  }
  function phaseFirstBaron(tl) {
    if (tl.duration < 25) return;
    const tMax = Math.min(tl.duration - 4, 30);
    const t = jitter(20, Math.max(21, tMax), tl.rng);
    tl.schedule(t, () => {
      const contestSide = rollEventSide(
        tl,
        t,
        0.05 + tl.mods.baronBias + pickAdvantageBias(tl, t) + cooldownEdgeBias(tl, t),
        false
        // Baron is game-deciding — macro-pure, no anti-streak
      );
      const stolen = tl.rng() < stealChance(tl, 0.15, contestSide);
      const baronSide = stolen ? contestSide === "blue" ? "red" : "blue" : contestSide;
      const wk = rollInt(1, 3, tl.rng);
      const lk = rollInt(0, 2, tl.rng);
      tl.state.baronExpiresAt = t + BALANCE.BARON_DURATION;
      tl.state.baronSide = baronSide;
      addEvent(
        tl,
        "baron",
        t,
        baronSide,
        describeBaron(
          baronSide,
          picksOf(tl.ctx, baronSide),
          tl.ctx.blueName,
          tl.ctx.redName,
          stolen,
          { winner: wk, loser: lk },
          tl.rng
        ),
        {
          kills: killsForSide(baronSide, wk, lk),
          towers: killsForSide(baronSide, rollInt(2, 3, tl.rng), 0),
          laneGoldDelta: spreadLaneGold(900, baronSide),
          kdaDelta: objectiveKDA(baronSide, wk, lk, stolen, baronSide, tl.rng)
        },
        stolen ? 0.65 : 0.5
      );
    });
  }
  function phaseMidTower(tl) {
    if (tl.duration < 27) return;
    const t = jitter(23, Math.max(24, tl.duration - 3), tl.rng);
    tl.schedule(t, () => {
      const side = rollTowerSide(tl, t);
      consumeTowerPressure(tl, side);
      addEvent(
        tl,
        "tower",
        t,
        side,
        describeTower(
          side,
          picksOf(tl.ctx, side),
          tl.ctx.blueName,
          tl.ctx.redName,
          false,
          tl.rng
        ),
        {
          towers: killsForSide(side, rollInt(1, 2, tl.rng), 0),
          laneGoldDelta: singleLaneGold(
            pickRandom(["top", "middle", "bottom"], tl.rng),
            400,
            side
          )
        },
        0.15
      );
    });
  }
  function phaseElder(tl) {
    if (tl.duration < 32) return;
    const t = jitter(tl.duration - 7, tl.duration - 3, tl.rng);
    tl.schedule(t, () => {
      if (tl.state.soulSide == null || tl.rng() >= 0.65) return;
      const contestSide = rollEventSide(tl, t, 0, false);
      const stolen = tl.rng() < stealChance(tl, 0.18, contestSide);
      const elderSide = stolen ? contestSide === "blue" ? "red" : "blue" : contestSide;
      tl.state.elderSide = elderSide;
      const elderWk = rollInt(1, 3, tl.rng);
      const elderLk = rollInt(0, 2, tl.rng);
      addEvent(
        tl,
        "elder",
        t,
        elderSide,
        describeElder(elderSide, tl.ctx.blueName, tl.ctx.redName, stolen),
        {
          kills: killsForSide(elderSide, elderWk, elderLk),
          towers: killsForSide(elderSide, rollInt(0, 2, tl.rng), 0),
          laneGoldDelta: spreadLaneGold(1e3, elderSide),
          kdaDelta: objectiveKDA(elderSide, elderWk, elderLk, stolen, elderSide, tl.rng)
        },
        stolen ? 0.75 : 0.65
      );
    });
  }

  // lib/sim/timeline/fights.ts
  var PIVOT_THRESHOLD = 1;
  function maybeMidgamePivot(tl, t) {
    if (!tl.ctx.adaptiveMidgame || tl.pivot) return;
    const { state, mods, ctx } = tl;
    const lead = state.goldLead / 2500 + state.momentum * 0.6 + (state.drakes.blue - state.drakes.red) * 0.25;
    if (Math.abs(lead) < PIVOT_THRESHOLD) return;
    const side = lead > 0 ? "red" : "blue";
    const own = side === "blue" ? ctx.blueStrategy : ctx.redStrategy;
    const opp = side === "blue" ? ctx.redStrategy : ctx.blueStrategy;
    const sgn = side === "blue" ? 1 : -1;
    let kind;
    if (opp.macro === "siege") {
      kind = "splitpush";
      state.towerPressure[side] += 0.4;
      mods.closingRiskFactor = Math.max(0.5, mods.closingRiskFactor * 0.94);
    } else if (own.gamePlan === "scaling" || own.tempo === "passive") {
      kind = "all-in";
      mods.baronBias += 0.16 * sgn;
      mods.visionChanceDelta += 0.08;
      mods.visionBias += 0.12 * sgn;
      mods.stealChanceDelta += 0.04;
      mods.closingRiskFactor = Math.max(0.5, mods.closingRiskFactor * 0.9);
    } else {
      kind = "objective-rush";
      mods.drakeBias += 0.12 * sgn;
      mods.baronBias += 0.12 * sgn;
      mods.stealChanceDelta += 0.03;
      mods.closingRiskFactor = Math.max(0.5, mods.closingRiskFactor * 0.94);
    }
    tl.pivot = { side, kind };
    addEvent(
      tl,
      "objective-trade",
      t,
      side,
      describeStrategicPivot(side, ctx.blueName, ctx.redName, kind),
      {},
      0.08
    );
  }
  function phasePowerSpikes(tl) {
    for (const spikeSide of ["blue", "red"]) {
      const sidePicks = picksOf(tl.ctx, spikeSide);
      const ARCHETYPE_PRIO = [
        "hyper-carry",
        "burst",
        "assassin",
        "poke",
        "skirmish",
        "dive"
      ];
      const carries = [];
      for (const want of ARCHETYPE_PRIO) {
        for (const c of sidePicks) {
          if (!c) continue;
          const m = metaFor2(c);
          if (m.archetypes.includes(want) && !carries.some((x) => x.champ === c)) {
            carries.push({ champ: c, meta: m });
          }
        }
        if (carries.length >= 2) break;
      }
      carries.slice(0, 2).forEach((chosen, idx) => {
        const spikeInfo = getKeyPowerSpike(chosen.meta, chosen.champ.alias);
        if (!spikeInfo.isCarrySpike) return;
        const lo = Math.max(5, spikeInfo.minute - 1);
        const hi = Math.max(lo + 0.5, spikeInfo.minute + 1);
        const t = jitter(lo, hi, tl.rng);
        tl.schedule(t, () => {
          if (tl.rng() >= (idx === 0 ? 0.72 : 0.45)) return;
          const SPIKE_MIN = 6;
          const SPIKE_MAX = 14;
          const t01 = Math.max(
            0,
            Math.min(1, (spikeInfo.minute - SPIKE_MIN) / (SPIKE_MAX - SPIKE_MIN))
          );
          const weight = idx === 0 ? 1 : 0.7;
          const sideLead = spikeSide === "blue" ? tl.state.goldLead : -tl.state.goldLead;
          const leadBoost = sideLead > 0 ? 1 + Math.min(0.3, sideLead / BALANCE.SPIKE_LEAD_NORM * 0.3) : 1;
          const goldDelta = Math.round((60 + 180 * t01) * weight * leadBoost);
          const momentumImpact = (0.04 + 0.1 * t01) * weight * leadBoost;
          addEvent(
            tl,
            "power-spike",
            t,
            spikeSide,
            describePowerSpike(chosen.champ, spikeInfo.keyItem, tl.rng),
            { laneGoldDelta: spreadLaneGold(goldDelta, spikeSide) },
            momentumImpact
          );
          if (idx === 0) {
            tl.state.pickAdvantage = {
              side: spikeSide,
              expiresAt: t + BALANCE.PICK_ADVANTAGE_WINDOW
            };
          }
        });
      });
    }
  }
  function phaseMidPickOrSkirmish(tl) {
    const t = jitter(15.5, 19, tl.rng);
    tl.schedule(t, () => {
      const side = rollEventSide(
        tl,
        t,
        tl.spikeBias(t) + mapControlBias(tl) + macroEventBias(tl, "pick") + comebackBias(tl, t)
      );
      const winnerScore = side === "blue" ? tl.ctx.blueScore : tl.ctx.redScore;
      const winnerHasPick = winnerScore.identityLabel === "Pick Comp";
      const wp = picksOf(tl.ctx, side);
      const lp = picksOf(tl.ctx, side === "blue" ? "red" : "blue");
      if (winnerHasPick) {
        const pickKda = makeKDA();
        const carryLane = tl.rng() < 0.55 ? "bottom" : "middle";
        addKill(pickKda, side, carryLane);
        addAssist(pickKda, side, "support");
        addAssist(pickKda, side, "jungle");
        addDeath(pickKda, side === "blue" ? "red" : "blue", carryLane);
        const basePick = describePick(side, wp, lp, tl.rng);
        const hooker = wp.find(
          (c) => c != null && ["Thresh", "Blitzcrank", "Pyke", "Nautilus"].includes(c.alias)
        );
        const pickDesc = ((hooker ? championSignature(hooker) : null) ?? basePick) + " (Flash down)";
        addEvent(
          tl,
          "pick",
          t,
          side,
          pickDesc,
          {
            kills: killsForSide(side, 1, 0),
            laneGoldDelta: spreadLaneGold(180, side),
            kdaDelta: pickKda
          },
          0.15
        );
        tl.state.pickAdvantage = {
          side,
          expiresAt: t + BALANCE.PICK_ADVANTAGE_WINDOW
        };
        tl.state.cooldownEdge = {
          side,
          expiresAt: t + BALANCE.COOLDOWN_EDGE_WINDOW
        };
      } else {
        const wk = rollInt(1, 2, tl.rng);
        const lk = rollInt(0, 1, tl.rng);
        const skirmishDesc = describeSkirmish(side, wp, wk, lk, tl.rng);
        const skirmishKda = teamfightKDA(side, wk, lk, tl.rng);
        addEvent(
          tl,
          "skirmish",
          t,
          side,
          nameActualFragger(skirmishDesc, wp, skirmishKda, side, SKIRMISH_CARRY_ARCHETYPES),
          {
            kills: killsForSide(side, wk, lk),
            // Kill bounty (300g) flows per-lane via kdaDelta. Small spread
            // models the "everyone is up" team gold from the broader fight —
            // winner-only: the loser's `lk` kills are the loser's gold, not the
            // winner's, so they must not inflate the winner side's lane strip.
            laneGoldDelta: spreadLaneGold(wk * 30, side),
            kdaDelta: skirmishKda
          },
          0.18
        );
        if (wk > lk) {
          tl.state.pickAdvantage = {
            side,
            expiresAt: t + BALANCE.PICK_ADVANTAGE_WINDOW
          };
        }
      }
    });
  }
  function phaseMidTeamfight(tl) {
    const t = jitter(19, Math.max(20, Math.min(24, tl.duration - 4)), tl.rng);
    tl.schedule(t, () => {
      const splitDamp = (tl.ctx.blueStrategy.macro === "splitpush" ? -BALANCE.SPLITPUSH_TEAMFIGHT_DAMP : 0) + (tl.ctx.redStrategy.macro === "splitpush" ? BALANCE.SPLITPUSH_TEAMFIGHT_DAMP : 0);
      const side = rollEventSide(
        tl,
        t,
        macroEventBias(tl, "teamfight") + mapControlBias(tl) + splitDamp + cooldownEdgeBias(tl, t),
        // a side fighting with Flash/ult up tips the 5v5
        false
        // the mid teamfight is game-deciding — macro-pure, no anti-streak
      );
      const wp = picksOf(tl.ctx, side);
      const ratioBlue = tl.combatRatioBlue(
        picksOf(tl.ctx, "blue"),
        picksOf(tl.ctx, "red"),
        t,
        tl.state.goldLead
      );
      const myRatio = side === "blue" ? ratioBlue : 1 / ratioBlue;
      const dom = Math.max(
        0,
        Math.min(
          0.6,
          tl.fightDominance(myRatio, 1) + netObjectiveFightEdge(tl, side, t)
        )
      );
      let wk = rollInt(3, 5, tl.rng) + Math.floor(dom * 3);
      let lk = Math.max(0, rollInt(0, 2, tl.rng) - Math.floor(dom * 2));
      const voraciousBonus = tl.state.atakhanVariant === "Voracious" && tl.state.atakhanSide === side ? Math.round(wk * BALANCE.KILL_GOLD * BALANCE.VORACIOUS_KILL_BONUS) : 0;
      const losingSide = side === "blue" ? "red" : "blue";
      if (tl.state.ruinousActive && tl.state.atakhanSide === losingSide && lk > 0) {
        lk -= 1;
        tl.state.ruinousActive = false;
      }
      const winningScore = side === "blue" ? tl.ctx.blueScore : tl.ctx.redScore;
      const WOMBO_LABELS = ["Wombo Combo", "Hyper Engage", "Heavy CC Lockdown"];
      if (wk > lk && WOMBO_LABELS.includes(winningScore.identityLabel ?? "")) {
        wk += BALANCE.WOMBO_KILL_BONUS;
      }
      const objTag = tl.state.elderSide === side ? "Elder-empowered \u2014 " : tl.state.baronSide === side && tl.state.baronExpiresAt != null && t <= tl.state.baronExpiresAt ? "Baron buff \u2014 " : tl.state.soulSide === side ? "Soul edge \u2014 " : "";
      const tfDesc = describeTeamfight(side, wp, winningScore.identityLabel, wk, lk, tl.rng);
      const tfTowers = killsForSide(side, rollInt(1, 2, tl.rng), 0);
      const tfKda = teamfightKDA(side, wk, lk, tl.rng);
      const flairRoll = tl.rng();
      const isAce = wk >= 5 && lk === 0;
      const penta = isAce && flairRoll < BALANCE.PENTAKILL_CHANCE ? pentakiller(
        wp,
        tl.rng,
        side === "blue" ? tl.ctx.blueForms : tl.ctx.redForms
      ) : null;
      const fightKills = penta ? killsForSide(side, 5, 0) : killsForSide(side, wk, lk);
      const fightKda = penta ? pentakillKDA(side, penta.lane) : tfKda;
      const engage = penta ? null : signatureEngage(wp);
      const fightDesc = penta ? `PENTAKILL!! ${penta.champ.name} solo-aces the enemy team` : engage && flairRoll > 0.6 ? objTag + engage : objTag + (isAce && flairRoll < 0.5 ? "ACE! " : wk - lk >= BALANCE.ACE_KILL_MARGIN && flairRoll < 0.3 ? "RAMPAGE! " : "") + nameActualFragger(tfDesc, wp, tfKda, side, TEAMFIGHT_CARRY_ARCHETYPES);
      addEvent(
        tl,
        "teamfight",
        t,
        side,
        fightDesc,
        {
          kills: fightKills,
          towers: tfTowers,
          // Post-fight push gold — plus any Voracious bonus. Win-condition funnel
          // (#10): a hyper-carry comp pumps it into its ADC instead of spreading.
          laneGoldDelta: wp.some(
            (c) => c != null && metaFor2(c).archetypes.includes("hyper-carry")
          ) ? singleLaneGold(
            "bottom",
            wk * BALANCE.MIDFIGHT_KILL_PUSH_GOLD + voraciousBonus,
            side
          ) : spreadLaneGold(
            wk * BALANCE.MIDFIGHT_KILL_PUSH_GOLD + voraciousBonus,
            side
          ),
          kdaDelta: fightKda,
          pentakill: penta ? { lane: penta.lane, championName: penta.champ.name } : void 0
        },
        0.32 + dom * 0.12
      );
      const aceLevel = wk - lk >= BALANCE.ACE_KILL_MARGIN;
      tl.state.pickAdvantage = {
        side,
        expiresAt: t + BALANCE.PICK_ADVANTAGE_WINDOW * (aceLevel ? BALANCE.ACE_PICKADV_MULT : 1)
      };
      maybeMidgamePivot(tl, t + 0.4);
    });
  }
  function phaseShutdown(tl) {
    if (tl.duration < 22) return;
    const t = jitter(21, Math.max(22, Math.min(26, tl.duration - 5)), tl.rng);
    tl.schedule(t, () => {
      const lead = Math.abs(tl.state.goldLead);
      const shutdownChance = lead >= BALANCE.SHUTDOWN_BIG_LEAD ? BALANCE.SHUTDOWN_BIG_CHANCE : lead >= BALANCE.SHUTDOWN_MID_LEAD ? BALANCE.SHUTDOWN_MID_CHANCE : 0;
      if (tl.rng() >= shutdownChance) return;
      const side = tl.state.goldLead > 0 ? "red" : "blue";
      const oppSide = side === "blue" ? "red" : "blue";
      const wp = picksOf(tl.ctx, side);
      const lp = picksOf(tl.ctx, oppSide);
      const sutdownKda = makeKDA();
      const shutdownLane = tl.rng() < 0.5 ? "jungle" : "middle";
      const bounty = pickRandom([400, 500, 600], tl.rng);
      const victimLane = shutdownVictimLane(lp) ?? (tl.rng() < 0.5 ? "bottom" : "middle");
      addKill(sutdownKda, side, shutdownLane);
      addAssist(sutdownKda, side, "support");
      addDeath(sutdownKda, oppSide, victimLane);
      addEvent(
        tl,
        "shutdown",
        t,
        side,
        describeShutdown(side, wp, lp, bounty, shutdownLane),
        {
          kills: killsForSide(side, 1, 0),
          // The shutdown bounty is the killer's gold — it goes to the lane that
          // landed the play (the kill's 300g bounty flows separately via
          // kdaDelta), so the scoreboard matches "X collects {bounty}g".
          laneGoldDelta: singleLaneGold(shutdownLane, bounty, side),
          kdaDelta: sutdownKda
        },
        0.28
      );
    });
  }
  function phaseVisionPick(tl) {
    if (tl.duration < 22) return;
    const t = jitter(16, Math.min(22, tl.duration - 5), tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= clampChance(0.28 + tl.mods.visionChanceDelta + mapControlChance(tl)))
        return;
      const side = rollEventSide(
        tl,
        t,
        tl.laneBias * 0.3 + tl.mods.visionBias + // Vision is THE map-control play, so map control counts extra here: the
        // team that owns the map both catches more and is harder to catch (#6).
        mapControlBias(tl) * 1.3 + macroEventBias(tl, "pick") + comebackBias(tl, t)
      );
      const wp = picksOf(tl.ctx, side);
      const lp = picksOf(tl.ctx, side === "blue" ? "red" : "blue");
      const visionKda = makeKDA();
      const finisherLane = tl.rng() < 0.4 ? "middle" : tl.rng() < 0.7 ? "jungle" : "bottom";
      addKill(visionKda, side, finisherLane);
      addAssist(visionKda, side, "support");
      if (finisherLane !== "jungle") addAssist(visionKda, side, "jungle");
      const victimRoll = tl.rng();
      const victimLane = victimRoll < 0.35 ? "middle" : victimRoll < 0.65 ? "bottom" : victimRoll < 0.85 ? "support" : "jungle";
      addDeath(visionKda, side === "blue" ? "red" : "blue", victimLane);
      addEvent(
        tl,
        "vision",
        t,
        side,
        describeVision(side, wp, lp, tl.ctx.blueName, tl.ctx.redName, tl.rng, finisherLane),
        {
          kills: killsForSide(side, 1, 0),
          // Kill + assist gold via kdaDelta; small spread for vision setup +
          // map control gain.
          laneGoldDelta: spreadLaneGold(150, side),
          kdaDelta: visionKda
        },
        0.18
      );
      tl.state.pickAdvantage = {
        side,
        expiresAt: t + BALANCE.PICK_ADVANTAGE_WINDOW
      };
    });
  }
  function phaseOutplay(tl) {
    if (tl.duration < 25) return;
    const t = jitter(17, Math.min(26, tl.duration - 4), tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= 0.18) return;
      const side = rollEventSide(
        tl,
        t,
        tl.laneBias * 0.2 + comebackBias(tl, t) + formEdge(tl)
      );
      const wp = picksOf(tl.ctx, side);
      const lp = picksOf(tl.ctx, side === "blue" ? "red" : "blue");
      const outnumber = tl.rng() < 0.25 ? 3 : 2;
      const wKills = outnumber >= 3 ? 2 : rollInt(1, 2, tl.rng);
      const heroLane = formWeightedLane(
        ["middle", "bottom", "jungle"],
        [0.4, 0.39, 0.21],
        side === "blue" ? tl.ctx.blueForms : tl.ctx.redForms,
        tl.rng
      );
      const outplayKda = makeKDA();
      addKill(outplayKda, side, heroLane, wKills);
      const opposingSide = side === "blue" ? "red" : "blue";
      for (let i = 0; i < wKills; i++) {
        addDeath(
          outplayKda,
          opposingSide,
          pickRandom(
            ["top", "jungle", "middle", "bottom", "support"],
            tl.rng
          )
        );
      }
      const baseOutplay = describeOutplay(side, wp, lp, outnumber, tl.rng, heroLane);
      const heroChamp = wp[POSITIONAL_LANES3.indexOf(heroLane)];
      const outplayDesc = (heroChamp ? championSignature(heroChamp) : null) ?? baseOutplay;
      addEvent(
        tl,
        "outplay",
        t,
        side,
        outplayDesc,
        {
          kills: killsForSide(side, wKills, 0),
          // The hero's kill bounties (300g each, all in heroLane) flow via
          // kdaDelta. Small bonus here for the play's swing — outplays demoralize.
          laneGoldDelta: singleLaneGold(heroLane, 100 * wKills, side),
          kdaDelta: outplayKda
        },
        0.22
      );
    });
  }
  function phaseObjectiveTrade(tl) {
    if (tl.duration < 24) return;
    const t = jitter(18, Math.min(25, tl.duration - 4), tl.rng);
    tl.schedule(t, () => {
      const splitpushPresent = tl.ctx.blueStrategy.macro === "splitpush" || tl.ctx.redStrategy.macro === "splitpush";
      if (tl.rng() >= (splitpushPresent ? 0.4 : 0.25)) return;
      const side = rollEventSide(
        tl,
        t,
        tl.laneBias * 0.3 + macroEventBias(tl, "trade") + comebackBias(tl, t)
      );
      const otherSide = side === "blue" ? "red" : "blue";
      const giveUp = pickRandom(
        ["drake", "tower"],
        tl.rng
      );
      const takeFor = pickRandom(
        ["tower", "plates"],
        tl.rng
      );
      const laneGold = {
        ...spreadLaneGold(180, side)
      };
      const otherLane = pickRandom(
        ["top", "middle", "bottom"],
        tl.rng
      );
      const sign = otherSide === "blue" ? 1 : -1;
      laneGold[otherLane] = (laneGold[otherLane] ?? 0) + sign * 200;
      addEvent(
        tl,
        "objective-trade",
        t,
        side,
        describeObjectiveTrade(
          side,
          tl.ctx.blueName,
          tl.ctx.redName,
          giveUp,
          takeFor
        ),
        { laneGoldDelta: laneGold },
        0.05
      );
    });
  }
  function phaseComebackStand(tl) {
    if (tl.duration < 24) return;
    const t = jitter(22, Math.max(23, Math.min(34, tl.duration - 3)), tl.rng);
    tl.schedule(t, () => {
      if (Math.abs(tl.state.goldLead) < BALANCE.STAND_GOLD_DEFICIT) return;
      if (tl.rng() >= BALANCE.STAND_CHANCE) return;
      const side = tl.state.goldLead > 0 ? "red" : "blue";
      const wp = picksOf(tl.ctx, side);
      const lp = picksOf(tl.ctx, side === "blue" ? "red" : "blue");
      const wk = rollInt(2, 4, tl.rng);
      const lk = rollInt(0, 1, tl.rng);
      const kda = teamfightKDA(side, wk, lk, tl.rng);
      addEvent(
        tl,
        "comeback",
        t,
        side,
        describeComebackStand(side, wp, lp, tl.rng),
        {
          kills: killsForSide(side, wk, lk),
          // Post-fight push + the kill bounties (via kdaDelta) swing gold back.
          laneGoldDelta: spreadLaneGold(wk * 80, side),
          kdaDelta: kda
        },
        0.35
        // strong momentum swing toward the trailing side
      );
    });
  }
  function phaseCounterJungle(tl) {
    const t = jitter(6, 12, tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= BALANCE.COUNTER_JUNGLE_CHANCE) return;
      const side = rollEventSide(tl, t, tl.laneBias * 0.4);
      addEvent(
        tl,
        "counter-jungle",
        t,
        side,
        describeCounterJungle(
          side,
          picksOf(tl.ctx, side),
          tl.ctx.blueName,
          tl.ctx.redName
        ),
        { laneGoldDelta: singleLaneGold("jungle", 200, side) },
        0.08
      );
      tl.state.jungleBehind = side === "blue" ? "red" : "blue";
    });
  }
  function phasePitSkirmish(tl) {
    if (tl.duration < 27) return;
    const t = jitter(22, Math.max(23, Math.min(28, tl.duration - 4)), tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= 0.45) return;
      const side = rollEventSide(tl, t, comebackBias(tl, t));
      const wp = picksOf(tl.ctx, side);
      const wk = rollInt(1, 3, tl.rng);
      const lk = rollInt(0, 2, tl.rng);
      const desc = describeSkirmish(side, wp, wk, lk, tl.rng);
      const kda = teamfightKDA(side, wk, lk, tl.rng);
      addEvent(
        tl,
        "skirmish",
        t,
        side,
        nameActualFragger(desc, wp, kda, side, SKIRMISH_CARRY_ARCHETYPES),
        {
          kills: killsForSide(side, wk, lk),
          laneGoldDelta: spreadLaneGold(wk * 30, side),
          kdaDelta: kda
        },
        0.2
      );
      tl.state.pickAdvantage = {
        side,
        expiresAt: t + BALANCE.PICK_ADVANTAGE_WINDOW
      };
    });
  }
  function phaseThrownLead(tl) {
    if (tl.duration < 24) return;
    const t = jitter(20, Math.max(21, Math.min(32, tl.duration - 3)), tl.rng);
    tl.schedule(t, () => {
      if (Math.abs(tl.state.goldLead) < BALANCE.THROW_GOLD_DEFICIT) return;
      if (tl.rng() >= BALANCE.THROW_CHANCE) return;
      const side = tl.state.goldLead > 0 ? "red" : "blue";
      const what = tl.duration >= 28 ? "Baron" : "a greedy pick";
      const wk = rollInt(2, 3, tl.rng);
      const kda = teamfightKDA(side, wk, 0, tl.rng);
      addEvent(
        tl,
        "throw",
        t,
        side,
        describeThrow(side, tl.ctx.blueName, tl.ctx.redName, what, tl.rng) + " \u2014 flashes blown on the face-check",
        {
          kills: killsForSide(side, wk, 0),
          laneGoldDelta: spreadLaneGold(wk * 100, side),
          kdaDelta: kda
        },
        0.4
        // big momentum swing to the underdog
      );
      tl.state.cooldownEdge = {
        side,
        expiresAt: t + BALANCE.COOLDOWN_EDGE_WINDOW
      };
    });
  }
  function phaseBackdoorAttempt(tl) {
    if (tl.duration < 26) return;
    const t = jitter(24, Math.max(25, Math.min(34, tl.duration - 3)), tl.rng);
    tl.schedule(t, () => {
      const blueSplit = tl.ctx.blueStrategy.macro === "splitpush";
      const redSplit = tl.ctx.redStrategy.macro === "splitpush";
      if (!blueSplit && !redSplit) return;
      if (tl.rng() >= BALANCE.BACKDOOR_ATTEMPT_CHANCE) return;
      const side = blueSplit && !redSplit ? "blue" : !blueSplit && redSplit ? "red" : tl.rng() < 0.5 ? "blue" : "red";
      const caught = tl.rng() < BALANCE.BACKDOOR_CAUGHT_ODDS;
      if (caught) {
        const defender = side === "blue" ? "red" : "blue";
        addEvent(
          tl,
          "backdoor",
          t,
          defender,
          describeBackdoorCaught(
            defender,
            picksOf(tl.ctx, side),
            tl.ctx.blueName,
            tl.ctx.redName
          ),
          {
            kills: killsForSide(defender, 1, 0),
            laneGoldDelta: spreadLaneGold(120, defender),
            kdaDelta: laneKillKDA(defender, "top", 1, "top")
          },
          0.12
        );
        tl.state.cooldownEdge = {
          side: defender,
          expiresAt: t + BALANCE.COOLDOWN_EDGE_WINDOW
        };
      } else {
        addEvent(
          tl,
          "backdoor",
          t,
          side,
          describeBackdoor(
            side,
            picksOf(tl.ctx, side),
            tl.ctx.blueName,
            tl.ctx.redName
          ),
          {
            towers: killsForSide(side, 1, 0),
            laneGoldDelta: singleLaneGold("top", 250, side)
          },
          0.15
        );
      }
    });
  }
  function phaseVisionSweep(tl) {
    if (tl.duration < 20) return;
    const t = jitter(16, Math.min(24, tl.duration - 4), tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= BALANCE.VISION_SWEEP_CHANCE) return;
      const side = rollEventSide(tl, t, tl.laneBias * 0.2 + mapControlBias(tl));
      const teamNm = side === "blue" ? tl.ctx.blueName : tl.ctx.redName;
      addEvent(
        tl,
        "vision",
        t,
        side,
        `${teamNm} sweeps the wards \u2014 vision cleared before the objective`,
        { laneGoldDelta: singleLaneGold("jungle", 60, side) },
        0.06
      );
      bumpLaneLead(tl, side, "jungle", BALANCE.SCUTTLE_JUNGLE_SNOWBALL);
    });
  }
  function phaseTowerDive(tl) {
    const t = jitter(9, 15, tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= BALANCE.TOWER_DIVE_CHANCE) return;
      const side = rollEventSide(
        tl,
        t,
        tl.laneBias * 0.5 + mapControlBias(tl) + comebackBias(tl, t)
      );
      const oppSide = side === "blue" ? "red" : "blue";
      const lane = pickRandom(["top", "bottom"], tl.rng);
      const traded = tl.rng() < BALANCE.TOWER_DIVE_TRADE_ODDS;
      const wk = rollInt(1, 2, tl.rng);
      const kda = makeKDA();
      addKill(kda, side, lane === "jungle" ? "middle" : "jungle", wk);
      addAssist(kda, side, lane);
      for (let i = 0; i < wk; i++) addDeath(kda, oppSide, lane);
      if (traded) addDeath(kda, side, lane);
      addEvent(
        tl,
        "dive",
        t,
        side,
        describeTowerDive(
          side,
          picksOf(tl.ctx, side),
          lane,
          tl.ctx.blueName,
          tl.ctx.redName,
          traded
        ),
        {
          kills: killsForSide(side, wk, 0),
          laneGoldDelta: singleLaneGold(lane, 120, side),
          kdaDelta: kda
        },
        0.16
      );
      bumpLaneLead(tl, side, lane, wk);
      tl.state.pickAdvantage = {
        side,
        expiresAt: t + BALANCE.PICK_ADVANTAGE_WINDOW
      };
    });
  }
  function phasePokeSiege(tl) {
    if (tl.duration < 24) return;
    const t = jitter(20, Math.min(30, tl.duration - 3), tl.rng);
    tl.schedule(t, () => {
      const siegePresent = tl.ctx.blueStrategy.macro === "siege" || tl.ctx.redStrategy.macro === "siege";
      if (!siegePresent) return;
      if (tl.rng() >= BALANCE.POKE_SIEGE_CHANCE) return;
      const side = rollEventSide(
        tl,
        t,
        macroEventBias(tl, "tower") + comebackBias(tl, t)
      );
      tl.state.towerPressure[side] += BALANCE.POKE_SIEGE_TOWER_PRESSURE;
      addEvent(
        tl,
        "siege",
        t,
        side,
        describePokeSiege(side, tl.ctx.blueName, tl.ctx.redName, tl.rng),
        { laneGoldDelta: spreadLaneGold(120, side) },
        0.1
      );
    });
  }
  function phaseTeleportFlank(tl) {
    if (tl.duration < 22) return;
    const t = jitter(16, Math.min(26, tl.duration - 4), tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= BALANCE.TP_FLANK_CHANCE) return;
      const side = rollEventSide(tl, t, tl.laneBias * 0.2 + comebackBias(tl, t));
      const wk = rollInt(1, 2, tl.rng);
      const lk = rollInt(0, 1, tl.rng);
      const kda = teamfightKDA(side, wk, lk, tl.rng);
      addEvent(
        tl,
        "skirmish",
        t,
        side,
        describeTeleportFlank(
          side,
          picksOf(tl.ctx, side),
          tl.ctx.blueName,
          tl.ctx.redName
        ),
        {
          kills: killsForSide(side, wk, lk),
          laneGoldDelta: spreadLaneGold(wk * 40, side),
          kdaDelta: kda
        },
        0.18
      );
      if (wk > lk) {
        tl.state.pickAdvantage = {
          side,
          expiresAt: t + BALANCE.PICK_ADVANTAGE_WINDOW
        };
      }
    });
  }
  function phaseDisengage(tl) {
    if (tl.duration < 22) return;
    const t = jitter(18, Math.min(30, tl.duration - 3), tl.rng);
    tl.schedule(t, () => {
      if (Math.abs(tl.state.goldLead) < BALANCE.DISENGAGE_GOLD_DEFICIT) return;
      if (tl.rng() >= BALANCE.DISENGAGE_CHANCE) return;
      const side = tl.state.goldLead > 0 ? "red" : "blue";
      addEvent(
        tl,
        "comeback",
        t,
        side,
        describeDisengage(
          side,
          picksOf(tl.ctx, side),
          tl.ctx.blueName,
          tl.ctx.redName,
          tl.rng
        ),
        { laneGoldDelta: spreadLaneGold(60, side) },
        0.2
        // momentum back, but no kills — pure tempo relief
      );
    });
  }
  function phaseBaronDance(tl) {
    if (tl.duration < 27) return;
    const t = jitter(24, Math.min(33, tl.duration - 3), tl.rng);
    tl.schedule(t, () => {
      if (tl.rng() >= BALANCE.BARON_DANCE_CHANCE) return;
      if (Math.abs(tl.state.goldLead) > 4e3) return;
      const side = rollEventSide(tl, t, tl.laneBias * 0.2);
      addEvent(
        tl,
        "objective-trade",
        t,
        side,
        "Both teams dance around Baron \u2014 neither commits, the tension builds",
        {},
        0.03
      );
    });
  }

  // lib/matchSimulator.ts
  function buildTeam(picks, lanes) {
    const out = [];
    for (let i = 0; i < picks.length; i++) {
      const c = picks[i];
      if (!c) continue;
      out.push({ champ: c, meta: metaFor2(c), lane: lanes[i] });
    }
    return out;
  }
  function archetypeCounts3(team) {
    const counts = {
      engage: 0,
      peel: 0,
      poke: 0,
      dive: 0,
      pick: 0,
      wombo: 0,
      "hyper-carry": 0,
      splitpush: 0,
      assassin: 0,
      tank: 0,
      enchanter: 0,
      burst: 0,
      skirmish: 0,
      sustain: 0
    };
    for (const m of team) {
      for (const a of m.meta.archetypes) counts[a]++;
    }
    return counts;
  }
  function damageBalanceScore(team) {
    const ap = team.filter((m) => isAP2(m.champ)).length;
    const ad = team.filter((m) => isAD2(m.champ)).length;
    const max = Math.max(ap, ad);
    const min = Math.min(ap, ad);
    if (max === 0) return { score: 0, ap, ad };
    const ratio = min / max;
    return { score: Math.round(ratio * 8), ap, ad };
  }
  function frontlineScore(team) {
    const tankCount = team.filter((m) => m.meta.archetypes.includes("tank")).length;
    const sustainBruiser = team.filter(
      (m) => !m.meta.archetypes.includes("tank") && m.meta.archetypes.includes("sustain") && (m.meta.archetypes.includes("dive") || m.meta.archetypes.includes("skirmish"))
    ).length;
    const effective = tankCount + sustainBruiser * 0.5;
    let score = 0;
    if (effective >= 2.5) score = 6;
    else if (effective >= 1.5) score = 5;
    else if (effective >= 1) score = 3;
    else if (effective >= 0.5) score = 1;
    else score = 0;
    return { score, count: tankCount };
  }
  function laneSynergyScore(picks, lanes) {
    let score = 0;
    for (let i = 0; i < picks.length; i++) {
      const c = picks[i];
      const lane = lanes[i];
      if (!c || !lane) continue;
      if (c.lanes.includes(lane)) score += 0.8;
      else score += 0.1;
    }
    return Math.min(4, Math.round(score));
  }
  function engagePresenceScore(counts) {
    const eng = counts.engage;
    const isProtect = counts["hyper-carry"] >= 1 && counts.peel >= 3;
    if (eng >= 2) return 3;
    if (eng === 1) return 1;
    if (isProtect) return -1;
    return -6;
  }
  function ccQualityScore(team) {
    const hard = team.filter((m) => m.meta.cc === "hard").length;
    let score = 0;
    if (hard >= 4) score = 5;
    else if (hard === 3) score = 4;
    else if (hard === 2) score = 2;
    else if (hard === 1) score = 1;
    return { score, count: hard };
  }
  function compIdentityScore(counts, mob, hardCcCount) {
    if (counts["hyper-carry"] >= 1 && counts.peel >= 3)
      return { label: "Protect The Carry", score: 6 };
    if (counts.wombo >= 3 && counts.engage >= 1)
      return { label: "Wombo Combo", score: 6 };
    if (counts.engage >= 3 && counts.tank >= 2)
      return { label: "Hyper Engage", score: 6 };
    if (hardCcCount >= 4 && counts.tank >= 1)
      return { label: "Heavy CC Lockdown", score: 5 };
    if (counts.tank >= 3 && counts.engage >= 2)
      return { label: "Tank Stack", score: 5 };
    if (counts.poke >= 3) return { label: "Poke / Siege", score: 5 };
    if (counts.dive >= 3 && counts.engage >= 1)
      return { label: "Dive Comp", score: 5 };
    if (counts.pick >= 2 && (counts.assassin >= 1 || counts.burst >= 1))
      return { label: "Pick Comp", score: 5 };
    if (counts.burst >= 3) return { label: "AP Burst", score: 5 };
    if (counts.skirmish >= 3 && counts.sustain >= 2)
      return { label: "Bruiser Brawl", score: 5 };
    if (mob.high >= 4) return { label: "Mobile Skirmish", score: 4 };
    if (counts.splitpush >= 2) return { label: "1-3-1 / Splitpush", score: 4 };
    if (counts.skirmish >= 3) return { label: "Skirmish / Bruiser", score: 4 };
    if (counts.tank === 0 && counts["hyper-carry"] + counts.burst >= 3)
      return { label: "Glass Cannon", score: 3 };
    if (counts.engage >= 2 && counts["hyper-carry"] >= 1)
      return { label: "Standard Teamfight", score: 3 };
    return { label: null, score: 0 };
  }
  function phaseBalanceScore(team) {
    const phases = team.map((m) => m.meta.phase);
    const early = phases.filter((p) => p === "early").length;
    const late = phases.filter((p) => p === "late" || p === "mid-late").length;
    const allEarly = phases.every((p) => p === "early");
    const allLate = phases.every((p) => p === "late" || p === "mid-late");
    if (allEarly) return -2;
    if (allLate) return 1;
    if (early >= 1 && late >= 2) return 3;
    if (early >= 1 || late >= 1) return 1;
    return 0;
  }
  function mobilityProfile(team) {
    let high = 0;
    let med = 0;
    let low = 0;
    for (const m of team) {
      if (m.meta.mobility === "high") high++;
      else if (m.meta.mobility === "medium") med++;
      else low++;
    }
    return { high, med, low };
  }
  function damageDealerCountSim(team) {
    let n2 = 0;
    for (const m of team) {
      const a = m.meta.archetypes;
      if (a.includes("hyper-carry") || a.includes("burst") || a.includes("poke")) {
        n2++;
        continue;
      }
      const roles = lowerRoles(m.champ);
      if (roles.includes("marksman")) {
        n2++;
        continue;
      }
      if (roles.includes("mage") && !a.includes("enchanter") && !a.includes("peel")) {
        n2++;
      }
    }
    return n2;
  }
  function matchupModifierScore(myCounts, oppCounts, myMob, oppMob, myHardCc, myDamageDealers, oppDamageDealers, myAP, myAD, oppAP, oppAD) {
    let mod = 0;
    const tags = [];
    if (myMob.high >= 3 && oppCounts.poke >= 3) {
      mod += 2;
      tags.push("Mobile vs Poke");
    }
    if (myMob.low >= 3 && oppCounts.pick >= 2) {
      mod -= 2;
      tags.push("Immobile vs Pick");
    }
    if (myCounts.engage >= 2 && oppCounts.tank === 0 && oppCounts.peel < 2) {
      mod += 2;
      tags.push("Engage vs No Frontline");
    }
    if (myCounts["hyper-carry"] >= 1 && myCounts.peel < 2 && oppCounts.dive >= 3) {
      mod -= 3;
      tags.push("Carry without Peel vs Dive");
    }
    if (myCounts.wombo >= 3 && (oppCounts.peel >= 3 || oppMob.high >= 3)) {
      mod -= 2;
      tags.push("Wombo vs Disengage");
    }
    if (myCounts.poke >= 3 && oppCounts.engage >= 2 && oppCounts.tank >= 1) {
      mod -= 2;
      tags.push("Poke vs Engage Tank");
    }
    if (myCounts.dive >= 3 && oppCounts["hyper-carry"] >= 1 && oppCounts.peel < 2) {
      mod += 2;
      tags.push("Dive into Backline");
    }
    if (myMob.high >= 4 && oppCounts.poke + oppCounts.burst >= 3) {
      mod += 1;
      tags.push("Slippery vs Skillshots");
    }
    if (myHardCc >= 4 && oppMob.high >= 4) {
      mod -= 1;
      tags.push("CC Chain vs Mobile");
    }
    if (myCounts.assassin + myCounts.burst >= 2 && oppCounts.tank >= 3 && myCounts["hyper-carry"] < 1) {
      mod -= 2;
      tags.push("Burst vs Tank Wall");
    }
    if (myDamageDealers < 2 && oppCounts.tank >= 2) {
      mod -= oppCounts.tank >= 3 ? 4 : 3;
      tags.push("Insufficient DPS vs Tanks");
    }
    if (myDamageDealers >= 3 && oppCounts.tank === 0 && oppCounts.peel < 2) {
      mod += 2;
      tags.push("DPS vs Soft Backline");
    }
    if (myCounts.tank >= 2 && oppDamageDealers < 2) {
      mod += 2;
      tags.push("Tank Wall vs No DPS");
    }
    if (myAP >= 4 && oppCounts.tank >= 2) {
      mod -= 2;
      tags.push("Mono AP vs Tanks");
    }
    if (myAD >= 4 && oppCounts.tank >= 2) {
      mod -= 2;
      tags.push("Mono AD vs Tanks");
    }
    if (myAP >= 2 && myAD >= 2 && myDamageDealers >= 3 && oppCounts.tank >= 2) {
      mod += 1;
      tags.push("Mixed Damage Pressure");
    }
    if (myCounts.sustain >= 3 && oppCounts.burst >= 3) {
      mod += 2;
      tags.push("Sustain vs Burst");
    }
    if (myCounts.peel >= 3 && oppCounts.engage >= 3) {
      mod += 2;
      tags.push("Engage Cancel");
    }
    if (myCounts.tank === 0 && myCounts.peel < 2 && myCounts["hyper-carry"] + myCounts.burst >= 3 && oppCounts.assassin + oppCounts.dive >= 2) {
      mod -= 3;
      tags.push("Glass Cannon Exposed");
    }
    if (myCounts.splitpush >= 2 && oppCounts.splitpush === 0) {
      mod += 1;
      tags.push("Splitpush Pressure");
    }
    if (myHardCc >= 5) {
      mod += 1;
      tags.push("Full Lockdown");
    }
    return { score: Math.max(-4, Math.min(4, mod)), tags };
  }
  function synergyBonusScore(picks) {
    const aliases = picks.filter((c) => !!c).map((c) => c.alias);
    const tags = [];
    let total = 0;
    for (let i = 0; i < aliases.length; i++) {
      for (let j = i + 1; j < aliases.length; j++) {
        const s = getSynergy(aliases[i], aliases[j]);
        if (s) {
          total += s.bonus;
          tags.push(s.tag);
        }
      }
    }
    return { score: Math.min(6, total), tags };
  }
  function metaStrengthScore(picks, lanes) {
    if (!getMetaEnabled()) return { score: 0, avg: 0 };
    let total = 0;
    let count = 0;
    for (let i = 0; i < picks.length; i++) {
      const c = picks[i];
      const lane = lanes[i];
      if (!c || !lane) continue;
      const tier = getEffectiveTier(c.alias, lane, c.lanes) ?? "C";
      total += TIER_VALUE[tier];
      count++;
    }
    if (count === 0) return { score: 0, avg: 0 };
    const avg = total / count;
    let score = 0;
    if (avg >= 5.5) score = 5;
    else if (avg >= 4.5) score = 4;
    else if (avg >= 3.7) score = 2;
    else if (avg >= 2.8) score = 0;
    else if (avg >= 1.7) score = -2;
    else score = -3;
    return { score, avg };
  }
  function scalingAdvantageScore(myTeam, oppTeam) {
    const myLate = myTeam.filter(
      (m) => m.meta.phase === "late" || m.meta.phase === "mid-late"
    ).length;
    const oppLate = oppTeam.filter(
      (m) => m.meta.phase === "late" || m.meta.phase === "mid-late"
    ).length;
    const myEarly = myTeam.filter((m) => m.meta.phase === "early").length;
    const oppEarly = oppTeam.filter((m) => m.meta.phase === "early").length;
    const lateDiff = myLate - oppLate;
    const earlyDiff = myEarly - oppEarly;
    const base = lateDiff * 1.5 + earlyDiff * 0.55;
    const earlyContrast = Math.max(0, oppLate - myLate) * Math.max(0, myEarly);
    const lateContrast = Math.max(0, oppEarly - myEarly) * Math.max(0, myLate);
    const contrastBonus = (earlyContrast - lateContrast) * 0.12;
    const raw = base + contrastBonus;
    const score = Math.max(-5, Math.min(5, Math.round(raw)));
    return { score, lateCount: myLate, earlyCount: myEarly };
  }
  function teamScore(picks, lanes, oppPicks, oppLanes) {
    const team = buildTeam(picks, lanes);
    const oppTeam = buildTeam(oppPicks, oppLanes);
    const counts = archetypeCounts3(team);
    const oppCounts = archetypeCounts3(oppTeam);
    const myMob = mobilityProfile(team);
    const oppMob = mobilityProfile(oppTeam);
    const dmg = damageBalanceScore(team);
    const front = frontlineScore(team);
    const synergy = laneSynergyScore(picks, lanes);
    const engage = engagePresenceScore(counts);
    const cc = ccQualityScore(team);
    const identity = compIdentityScore(counts, myMob, cc.count);
    const phase = phaseBalanceScore(team);
    const scaling = scalingAdvantageScore(team, oppTeam);
    const myDamageDealers = damageDealerCountSim(team);
    const oppDamageDealers = damageDealerCountSim(oppTeam);
    const oppDmg = damageBalanceScore(oppTeam);
    const matchup = matchupModifierScore(
      counts,
      oppCounts,
      myMob,
      oppMob,
      cc.count,
      myDamageDealers,
      oppDamageDealers,
      dmg.ap,
      dmg.ad,
      oppDmg.ap,
      oppDmg.ad
    );
    const meta = metaStrengthScore(picks, lanes);
    const synergyPair = synergyBonusScore(picks);
    return {
      damageBalance: dmg.score,
      frontline: front.score,
      laneSynergy: synergy,
      engagePresence: engage,
      ccQuality: cc.score,
      compIdentity: identity.score,
      phaseBalance: phase,
      scalingAdvantage: scaling.score,
      matchupEdge: matchup.score,
      matchupTags: matchup.tags,
      metaStrength: meta.score,
      metaTierAvg: meta.avg,
      synergyBonus: synergyPair.score,
      synergyTags: synergyPair.tags,
      total: 50 + dmg.score + front.score + synergy + engage + cc.score + identity.score + phase + scaling.score + matchup.score + meta.score + synergyPair.score,
      apCount: dmg.ap,
      adCount: dmg.ad,
      frontCount: front.count,
      hardCcCount: cc.count,
      lateCount: scaling.lateCount,
      earlyCount: scaling.earlyCount,
      highMobCount: myMob.high,
      lowMobCount: myMob.low,
      identityLabel: identity.label
    };
  }
  var SIGMOID_K = 0.05;
  var SCALING_EDGE_K = 0.075;
  var BLUE_SIDE_BONUS = 0.025;
  var PROB_CLAMP_MIN = 0.03;
  var PROB_CLAMP_MAX = 0.97;
  function pregameBlueWinProb(diff, scalingEdge = 0, expectedDuration = 34) {
    const ramp = Math.max(0, (Math.min(50, Math.max(24, expectedDuration)) - 27) / 8);
    const logit = diff * SIGMOID_K + scalingEdge * SCALING_EDGE_K * ramp;
    const raw = 1 / (1 + Math.exp(-logit));
    return Math.min(PROB_CLAMP_MAX, Math.max(PROB_CLAMP_MIN, raw + BLUE_SIDE_BONUS));
  }
  function carrySpikeMinutes(picks) {
    const out = [];
    for (const c of picks) {
      if (!c) continue;
      const meta = metaFor2(c);
      const spike = getKeyPowerSpike(meta, c.alias);
      if (spike.isCarrySpike) out.push(spike.minute);
    }
    return out;
  }
  function onlineSpikeCount(spikes, time) {
    let n2 = 0;
    for (const m of spikes) if (time >= m) n2++;
    return n2;
  }
  function fightDominance(myFactor, oppFactor) {
    const ratio = myFactor / Math.max(0.5, oppFactor);
    const raw = (ratio - 1) * 0.8;
    return Math.max(0, Math.min(0.6, raw));
  }
  function itemBuildProgress(gameTime, phase) {
    let t = gameTime;
    if (phase === "late" || phase === "mid-late") {
      t = gameTime - 3;
    } else if (phase === "early") {
      t = gameTime + 2;
    }
    return 1 / (1 + Math.exp(-(t - 16) * 0.18));
  }
  function damageBaseFor(meta, isMarksman, gameTime) {
    if (meta.archetypes.includes("hyper-carry")) {
      return gameTime >= 25 ? 1.85 : gameTime >= 18 ? 1.6 : 1.5;
    }
    if (isMarksman) return gameTime >= 22 ? 1.45 : 1.3;
    if (meta.archetypes.includes("burst")) return 1.4;
    if (meta.archetypes.includes("assassin")) return 1.2;
    if (meta.archetypes.includes("poke")) return 1.1;
    if (meta.archetypes.includes("skirmish")) return 0.95;
    if (meta.archetypes.includes("dive")) return 0.9;
    if (meta.archetypes.includes("tank")) return 0.5;
    if (meta.archetypes.includes("enchanter")) return 0.4;
    if (meta.archetypes.includes("peel")) return 0.5;
    return 0.7;
  }
  var lowerRolesCache = /* @__PURE__ */ new WeakMap();
  function lowerRoles(c) {
    let r = lowerRolesCache.get(c);
    if (!r) {
      r = c.roles.map((s) => s.toLowerCase());
      lowerRolesCache.set(c, r);
    }
    return r;
  }
  function damageTypeSplit(c) {
    const roles = lowerRoles(c);
    const isMark = roles.includes("marksman");
    const isMage = roles.includes("mage");
    const isFighter = roles.includes("fighter");
    const TRUE_DAMAGE = /* @__PURE__ */ new Set([
      "Vayne",
      "Briar",
      "Camille",
      "Cho'Gath",
      "FiddleSticks"
    ]);
    const trueShare = TRUE_DAMAGE.has(c.alias) ? 0.15 : 0;
    if (isAP2(c) && !isAD2(c)) return { ad: 0, ap: 1 - trueShare, tr: trueShare };
    if (isAD2(c) && !isAP2(c)) return { ad: 1 - trueShare, ap: 0, tr: trueShare };
    if (isAP2(c) && isAD2(c)) return { ad: 0.45, ap: 0.45, tr: 0.1 };
    if (isFighter) return { ad: 0.85, ap: 0, tr: 0.15 };
    if (isMark) return { ad: 1 - trueShare, ap: 0, tr: trueShare };
    if (isMage) return { ad: 0, ap: 1 - trueShare, tr: trueShare };
    return { ad: 0.7, ap: 0.1, tr: 0.2 };
  }
  function burstFactorFor(meta) {
    if (meta.archetypes.includes("assassin")) return 0.8;
    if (meta.archetypes.includes("burst")) return 0.7;
    if (meta.archetypes.includes("pick")) return 0.55;
    if (meta.archetypes.includes("wombo")) return 0.5;
    if (meta.archetypes.includes("hyper-carry")) return 0.15;
    if (meta.archetypes.includes("poke")) return 0.4;
    if (meta.archetypes.includes("dive")) return 0.45;
    if (meta.archetypes.includes("skirmish")) return 0.35;
    if (meta.archetypes.includes("tank")) return 0.25;
    return 0.4;
  }
  function champDefenses(meta, gameTime) {
    const items = itemBuildProgress(gameTime, meta.phase);
    let armorBase = 30;
    let mrBase = 30;
    let hpBase = 1;
    let armorScale = 30;
    let mrScale = 30;
    let hpScale = 1;
    if (meta.archetypes.includes("tank")) {
      armorBase = 50;
      mrBase = 50;
      hpBase = 1.4;
      armorScale = 100;
      mrScale = 100;
      hpScale = 1.6;
    } else if (meta.archetypes.includes("dive") || meta.archetypes.includes("skirmish")) {
      armorBase = 40;
      mrBase = 35;
      hpBase = 1.1;
      armorScale = 50;
      mrScale = 40;
      hpScale = 1;
    } else if (meta.archetypes.includes("sustain") || meta.archetypes.includes("peel")) {
      armorBase = 35;
      mrBase = 35;
      hpBase = 1;
      armorScale = 50;
      mrScale = 50;
      hpScale = 0.8;
    }
    return {
      armor: armorBase + armorScale * items,
      mr: mrBase + mrScale * items,
      hp: hpBase * (0.6 + items * 1)
    };
  }
  function champCombatProfile(champ, lane, gameTime) {
    const meta = metaFor2(champ);
    const isMark = lowerRoles(champ).includes("marksman");
    const tier = lane ? getEffectiveTier(champ.alias, lane, champ.lanes) ?? "C" : "C";
    const tierMul = getMetaEnabled() ? 0.7 + TIER_VALUE[tier] * 0.08 : 1;
    const items = itemBuildProgress(gameTime, meta.phase);
    const dmgTotal = damageBaseFor(meta, isMark, gameTime) * tierMul * (0.4 + items * 1.3);
    const split = damageTypeSplit(champ);
    const buildStats = buildStatsAt(meta, gameTime);
    const itemAdContribution = buildStats.ad * 0.012;
    const itemApContribution = buildStats.ap * 0.012;
    const adDamage = dmgTotal * split.ad + itemAdContribution * split.ad;
    const apDamage = dmgTotal * split.ap + itemApContribution * split.ap;
    const trueDamage = dmgTotal * split.tr;
    const ability = getAbilityProfile(champ.alias);
    const burstFactor = ability.burstWindowSeconds > 0 && ability.burstWindowSeconds <= 6 ? (
      // Convert window (seconds) into a 0..1 factor: 2.5s → 0.75 burst,
      // 8s → 0.2 burst (sustained).
      Math.max(0.1, Math.min(0.85, 1 - ability.burstWindowSeconds / 8))
    ) : burstFactorFor(meta);
    const def = champDefenses(meta, gameTime);
    const armor = def.armor + buildStats.armor;
    const mr = def.mr + buildStats.mr;
    const hp = def.hp + buildStats.hp / 1e3;
    let sustain = 0;
    if (meta.archetypes.includes("enchanter") || meta.archetypes.includes("sustain"))
      sustain = 0.4;
    else if (meta.archetypes.includes("peel")) sustain = 0.2;
    sustain += (buildStats.lifesteal + buildStats.omnivamp) * 5e-3;
    let threat = 0;
    if (meta.archetypes.includes("assassin")) threat = 0.7;
    else if (meta.archetypes.includes("dive")) threat = 0.5;
    else if (meta.archetypes.includes("pick")) threat = 0.4;
    return {
      adDamage,
      apDamage,
      trueDamage,
      burstFactor,
      hp,
      armor,
      mr,
      sustain,
      threat
    };
  }
  function teamCombatProfile(picks, roles, gameTime) {
    let adDamage = 0;
    let apDamage = 0;
    let trueDamage = 0;
    let weightedBurst = 0;
    let hp = 0;
    let armorSum = 0;
    let mrSum = 0;
    let count = 0;
    let sustain = 0;
    let threat = 0;
    let womboCount = 0;
    let pickCount = 0;
    let diveCount = 0;
    let pokeCount = 0;
    let hyperCarryCount = 0;
    let peelCount = 0;
    for (let i = 0; i < picks.length; i++) {
      const c = picks[i];
      if (!c) continue;
      const p = champCombatProfile(c, roles[i] ?? null, gameTime);
      adDamage += p.adDamage;
      apDamage += p.apDamage;
      trueDamage += p.trueDamage;
      const dmg = p.adDamage + p.apDamage + p.trueDamage;
      weightedBurst += p.burstFactor * dmg;
      hp += p.hp;
      armorSum += p.armor;
      mrSum += p.mr;
      count++;
      sustain += p.sustain;
      threat += p.threat;
      const meta = metaFor2(c);
      if (meta.archetypes.includes("wombo")) womboCount++;
      if (meta.archetypes.includes("pick")) pickCount++;
      if (meta.archetypes.includes("dive")) diveCount++;
      if (meta.archetypes.includes("poke")) pokeCount++;
      if (meta.archetypes.includes("hyper-carry")) hyperCarryCount++;
      if (meta.archetypes.includes("peel") || meta.archetypes.includes("enchanter"))
        peelCount++;
    }
    const totalDmg = adDamage + apDamage + trueDamage;
    return {
      adDamage,
      apDamage,
      trueDamage,
      burstFactor: totalDmg > 0 ? weightedBurst / totalDmg : 0.4,
      hp,
      armor: count > 0 ? armorSum / count : 50,
      mr: count > 0 ? mrSum / count : 50,
      sustain,
      threat,
      womboCount,
      pickCount,
      diveCount,
      pokeCount,
      hyperCarryCount,
      peelCount
    };
  }
  var CARRY_GOLD_ARCHETYPES = /* @__PURE__ */ new Set([
    "hyper-carry",
    "burst",
    "assassin",
    "poke"
  ]);
  function carryGoldLeadBonus(bluePicks, redPicks, laneGold) {
    let blueBonus = 0;
    let redBonus = 0;
    for (let i = 0; i < POSITIONAL_LANES3.length; i++) {
      const lane = POSITIONAL_LANES3[i];
      const lead = laneGold[lane];
      const absLead = Math.abs(lead);
      if (absLead < 1500) continue;
      const baseBonus = Math.min(0.12, 0.03 + (absLead - 1500) / 5e4);
      if (lead > 0) {
        const champ = bluePicks[i];
        if (!champ) continue;
        const meta = metaFor2(champ);
        const isCarryArch = meta.archetypes.some(
          (a) => CARRY_GOLD_ARCHETYPES.has(a)
        );
        const isMarksman = lowerRoles(champ).includes("marksman");
        const weight = isCarryArch || isMarksman ? 1 : 0.5;
        blueBonus += baseBonus * weight;
      } else {
        const champ = redPicks[i];
        if (!champ) continue;
        const meta = metaFor2(champ);
        const isCarryArch = meta.archetypes.some(
          (a) => CARRY_GOLD_ARCHETYPES.has(a)
        );
        const isMarksman = lowerRoles(champ).includes("marksman");
        const weight = isCarryArch || isMarksman ? 1 : 0.5;
        redBonus += baseBonus * weight;
      }
    }
    return {
      blueDmgMul: 1 + Math.min(0.25, blueBonus),
      redDmgMul: 1 + Math.min(0.25, redBonus)
    };
  }
  function combatRatioBlue(bluePicks, blueRoles, redPicks, redRoles, gameTime, goldLead, laneGold) {
    const blue = teamCombatProfile(bluePicks, blueRoles, gameTime);
    const red = teamCombatProfile(redPicks, redRoles, gameTime);
    const blueItemBoost = 1 + Math.max(0, goldLead) / 1e4;
    const redItemBoost = 1 + Math.max(0, -goldLead) / 1e4;
    const carryBonus = laneGold ? carryGoldLeadBonus(bluePicks, redPicks, laneGold) : { blueDmgMul: 1, redDmgMul: 1 };
    function identityDamageMul(my, opp) {
      let m = 1;
      if (my.womboCount >= 2 && opp.peelCount < 2) m += 0.15;
      if (my.diveCount >= 2 && opp.peelCount < 2 && opp.hyperCarryCount >= 1)
        m += 0.18;
      if (my.pickCount >= 2 && opp.peelCount < 2) m += 0.12;
      if (my.hyperCarryCount >= 1 && my.peelCount >= 2) m += 0.18;
      return m;
    }
    function identityEhpMul(my, opp) {
      let m = 1;
      if (my.pokeCount >= 2 && opp.womboCount < 2) m += 0.1;
      return m;
    }
    const blueIdDmg = identityDamageMul(blue, red);
    const redIdDmg = identityDamageMul(red, blue);
    const blueIdEhp = identityEhpMul(blue, red);
    const redIdEhp = identityEhpMul(red, blue);
    const blueAdVsRed = blue.adDamage * blueItemBoost / (1 + red.armor / 100);
    const blueApVsRed = blue.apDamage * blueItemBoost / (1 + red.mr / 100);
    const blueTrueVsRed = blue.trueDamage * blueItemBoost;
    let blueDmg = (blueAdVsRed + blueApVsRed + blueTrueVsRed) * blueIdDmg * carryBonus.blueDmgMul;
    const redAdVsBlue = red.adDamage * redItemBoost / (1 + blue.armor / 100);
    const redApVsBlue = red.apDamage * redItemBoost / (1 + blue.mr / 100);
    const redTrueVsBlue = red.trueDamage * redItemBoost;
    let redDmg = (redAdVsBlue + redApVsBlue + redTrueVsBlue) * redIdDmg * carryBonus.redDmgMul;
    const blueSustainEff = blue.sustain * (red.threat >= 1 || red.adDamage > 1.5 ? 0.6 : 1);
    const redSustainEff = red.sustain * (blue.threat >= 1 || blue.adDamage > 1.5 ? 0.6 : 1);
    const blueEhp = blue.hp * blueItemBoost * blueIdEhp * (1 + blueSustainEff * 0.3);
    const redEhp = red.hp * redItemBoost * redIdEhp * (1 + redSustainEff * 0.3);
    if (blue.burstFactor >= 0.6 && red.peelCount < 2 && red.hyperCarryCount >= 1)
      blueDmg *= 1.15;
    if (red.burstFactor >= 0.6 && blue.peelCount < 2 && blue.hyperCarryCount >= 1)
      redDmg *= 1.15;
    if (blue.hyperCarryCount >= 1 && blue.peelCount >= 2 && blue.burstFactor < 0.35)
      blueDmg *= 1.1;
    if (red.hyperCarryCount >= 1 && red.peelCount >= 2 && red.burstFactor < 0.35)
      redDmg *= 1.1;
    const blueAliases = bluePicks.map((c) => c ? c.alias : null);
    const redAliases = redPicks.map((c) => c ? c.alias : null);
    const blueLockdown = teamLockdownTotal(blueAliases);
    const redLockdown = teamLockdownTotal(redAliases);
    const lockdownDelta = blueLockdown - redLockdown;
    if (lockdownDelta > 0.5) blueDmg *= 1 + Math.min(0.2, lockdownDelta * 0.05);
    if (lockdownDelta < -0.5)
      redDmg *= 1 + Math.min(0.2, -lockdownDelta * 0.05);
    const blueTtk = redEhp / Math.max(0.1, blueDmg);
    const redTtk = blueEhp / Math.max(0.1, redDmg);
    return redTtk / blueTtk;
  }
  function resolveCombat(bluePicks, blueRoles, redPicks, redRoles, gameTime, goldLead, laneGold, rng = Math.random) {
    const ratio = combatRatioBlue(
      bluePicks,
      blueRoles,
      redPicks,
      redRoles,
      gameTime,
      goldLead,
      laneGold
    );
    const winnerSide = ratio >= 1 ? "blue" : "red";
    const dom = ratio >= 1 ? Math.min(0.7, (ratio - 1) * 0.6) : Math.min(0.7, (1 / ratio - 1) * 0.6);
    const winnerKills = 3 + Math.floor(dom * 3) + rollInt(0, 1, rng);
    const loserKills = Math.max(
      0,
      2 - Math.floor(dom * 2) - rollInt(0, 1, rng)
    );
    return { winnerSide, winnerKills, loserKills, ratio };
  }
  var PHASE_VALUE = {
    early: 4,
    mid: 3,
    "mid-late": 2,
    late: 1
  };
  var MOBILITY_VALUE = {
    low: 0,
    medium: 1,
    high: 2
  };
  var MELEE_MAGES = /* @__PURE__ */ new Set([
    "Akali",
    "Diana",
    "Ekko",
    "Fizz",
    "Galio",
    "Kassadin",
    "Katarina",
    "Mordekaiser",
    "Rumble",
    "Sylas",
    "Vladimir"
  ]);
  var RANGED_BRUISERS = /* @__PURE__ */ new Set([
    "Gnar",
    "Heimerdinger",
    "Jayce",
    "Kayle",
    "Kennen",
    "Quinn",
    "Teemo",
    "Urgot"
  ]);
  var RANGED_SUPPORTS = /* @__PURE__ */ new Set([
    "Bard",
    "Brand",
    "Janna",
    "Karma",
    "Lulu",
    "Lux",
    "Mel",
    "Milio",
    "Morgana",
    "Nami",
    "Renata",
    "Senna",
    "Seraphine",
    "Sona",
    "Soraka",
    "Swain",
    "Velkoz",
    "Xerath",
    "Yuumi",
    "Zilean",
    "Zyra"
  ]);
  var MELEE_MARKSMEN = /* @__PURE__ */ new Set(["MasterYi", "Nilah"]);
  function isRanged(champ) {
    const r = new Set(lowerRoles(champ));
    if (r.has("marksman")) return !MELEE_MARKSMEN.has(champ.alias);
    if (r.has("mage")) return !MELEE_MAGES.has(champ.alias);
    if (RANGED_BRUISERS.has(champ.alias)) return true;
    if (RANGED_SUPPORTS.has(champ.alias)) return true;
    return false;
  }
  function rangeBonus(lane, blue, red) {
    if (lane === "jungle") return 0;
    const blueRanged = isRanged(blue);
    const redRanged = isRanged(red);
    if (blueRanged === redRanged) return 0;
    if (lane === "top") return blueRanged ? 30 : -30;
    if (lane === "middle") return blueRanged ? 12 : -12;
    if (lane === "bottom" || lane === "support") return blueRanged ? 8 : -8;
    return 0;
  }
  function laneArchetypeBonus(lane, blue, red) {
    const blueMeta = metaFor2(blue);
    const redMeta = metaFor2(red);
    let bonus = 0;
    if (lane === "support") {
      if (blueMeta.archetypes.includes("pick") && redMeta.archetypes.includes("enchanter")) bonus += 12;
      if (redMeta.archetypes.includes("pick") && blueMeta.archetypes.includes("enchanter")) bonus -= 12;
    }
    if (lane === "middle") {
      if (blueMeta.mobility === "high" && redMeta.mobility === "low") bonus += 8;
      if (redMeta.mobility === "high" && blueMeta.mobility === "low") bonus -= 8;
    }
    if (lane === "top") {
      if (blueMeta.archetypes.includes("splitpush") && redMeta.archetypes.includes("sustain") && !redMeta.archetypes.includes("splitpush")) bonus += 8;
      if (redMeta.archetypes.includes("splitpush") && blueMeta.archetypes.includes("sustain") && !blueMeta.archetypes.includes("splitpush")) bonus -= 8;
    }
    return bonus;
  }
  function detectWeakside(picks) {
    const top = picks[0];
    const bot = picks[3];
    const sup = picks[4];
    if (!top || !bot || !sup) return { weakLane: null, strongLane: null };
    const topMeta = metaFor2(top);
    const botMeta = metaFor2(bot);
    const supMeta = metaFor2(sup);
    const topPlaysWeakside = (topMeta.archetypes.includes("sustain") || topMeta.archetypes.includes("tank") || topMeta.archetypes.includes("splitpush")) && (topMeta.phase === "late" || topMeta.phase === "mid-late");
    const botIsInvest = botMeta.archetypes.includes("hyper-carry") && (supMeta.archetypes.includes("peel") || supMeta.archetypes.includes("enchanter"));
    if (topPlaysWeakside && botIsInvest) {
      return { weakLane: "top", strongLane: "bottom" };
    }
    const topIsInvest = (topMeta.archetypes.includes("dive") || topMeta.archetypes.includes("skirmish")) && (topMeta.phase === "early" || topMeta.phase === "mid");
    const botPlaysWeakside = botMeta.archetypes.includes("poke") || supMeta.archetypes.includes("tank") && botMeta.archetypes.includes("hyper-carry") === false;
    if (topIsInvest && botPlaysWeakside && topMeta.archetypes.includes("splitpush")) {
      return { weakLane: "bottom", strongLane: "top" };
    }
    return { weakLane: null, strongLane: null };
  }
  var PLAYER_LANE_BIAS_K = 8;
  function rosterMeanTierValue(roster) {
    if (!roster || roster.length === 0) return 0;
    return roster.reduce((s, p) => s + PLAYER_TIER_VALUE[p.tier], 0) / roster.length;
  }
  function playerLaneTierBias(bluePlayers, redPlayers, lane, k = PLAYER_LANE_BIAS_K) {
    const bp = playerForLane(bluePlayers, lane);
    const rp = playerForLane(redPlayers, lane);
    if (!bp || !rp) return 0;
    const blueDev = PLAYER_TIER_VALUE[bp.tier] - rosterMeanTierValue(bluePlayers);
    const redDev = PLAYER_TIER_VALUE[rp.tier] - rosterMeanTierValue(redPlayers);
    return (blueDev - redDev) * k;
  }
  var POOL_LANE_K = 15;
  function playerLanePoolBias(bluePlayers, redPlayers, blueChampId, redChampId, lane, k = POOL_LANE_K) {
    const bp = playerForLane(bluePlayers, lane);
    const rp = playerForLane(redPlayers, lane);
    return (poolBias(bp, blueChampId) - poolBias(rp, redChampId)) * k;
  }
  function playerLaneFormBias(blueForms, redForms, lane, k = PLAYER_LANE_BIAS_K) {
    if (!blueForms && !redForms) return 0;
    return (formTierBias(blueForms?.[lane] ?? 0) - formTierBias(redForms?.[lane] ?? 0)) * k;
  }
  var COHESION_LANE_K = 14;
  function playerLaneCohesionBias(bluePlayers, redPlayers, lane, k = COHESION_LANE_K) {
    const pen = (r) => {
      const p = playerForLane(r, lane);
      return p ? 1 - (p.acclimation ?? 1) : 0;
    };
    return (pen(redPlayers) - pen(bluePlayers)) * k;
  }
  var COMFORT_HIGHLIGHT_WEIGHT = 0.7;
  function highlightForms(players, picks, baseForms) {
    if (!players) return baseForms;
    const out = { ...baseForms ?? {} };
    for (let i = 0; i < POSITIONAL_LANES3.length; i++) {
      const lane = POSITIONAL_LANES3[i];
      const comfort = poolBias(playerForLane(players, lane), picks[i]?.id ?? null);
      const base = baseForms?.[lane] ?? 0;
      out[lane] = Math.max(-1, Math.min(1, base + comfort * COMFORT_HIGHLIGHT_WEIGHT));
    }
    return out;
  }
  function computeLaneAdvantages(bluePicks, redPicks, bluePlayers, redPlayers, blueForms, redForms) {
    const adv = {
      top: 0,
      jungle: 0,
      middle: 0,
      bottom: 0,
      support: 0
    };
    for (let i = 0; i < POSITIONAL_LANES3.length; i++) {
      const lane = POSITIONAL_LANES3[i];
      const blue = bluePicks[i];
      const red = redPicks[i];
      if (!blue || !red) continue;
      const blueMeta = metaFor2(blue);
      const redMeta = metaFor2(red);
      const phaseDiff = PHASE_VALUE[blueMeta.phase] - PHASE_VALUE[redMeta.phase];
      const ccDiff = (blueMeta.cc === "hard" ? 1 : 0) - (redMeta.cc === "hard" ? 1 : 0);
      const mobDiff = MOBILITY_VALUE[blueMeta.mobility] - MOBILITY_VALUE[redMeta.mobility];
      const archetypeBonus = laneArchetypeBonus(lane, blue, red);
      const rangeAdv = rangeBonus(lane, blue, red);
      const blueTier = getEffectiveTier(blue.alias, lane, blue.lanes) ?? "C";
      const redTier = getEffectiveTier(red.alias, lane, red.lanes) ?? "C";
      const tierDiff = TIER_VALUE[blueTier] - TIER_VALUE[redTier];
      const blueCounters = hardCounterValue(blue, red);
      const redCounters = hardCounterValue(red, blue);
      const counterNet = blueCounters - redCounters;
      const counterAbs = Math.abs(counterNet);
      let counterAdvantage = 0;
      if (counterAbs > 0) {
        const base = Math.min(3, counterAbs) * 8;
        const surcharge = counterAbs > 3 ? (counterAbs - 3) * 18 : 0;
        counterAdvantage = (counterNet > 0 ? 1 : -1) * (base + surcharge);
      }
      const playerBias = playerLaneTierBias(bluePlayers, redPlayers, lane);
      const poolLaneBias = playerLanePoolBias(
        bluePlayers,
        redPlayers,
        blue.id,
        red.id,
        lane
      );
      const formLaneBias = playerLaneFormBias(blueForms, redForms, lane);
      const cohesionLaneBias = playerLaneCohesionBias(bluePlayers, redPlayers, lane);
      const chemistryLaneBias = laneChemistryBias(bluePlayers, redPlayers, lane);
      adv[lane] = phaseDiff * 50 + ccDiff * 5 + mobDiff * 5 + tierDiff * 12 + archetypeBonus + rangeAdv + counterAdvantage + playerBias + poolLaneBias + formLaneBias + cohesionLaneBias + chemistryLaneBias;
    }
    const blueWS = detectWeakside(bluePicks);
    if (blueWS.weakLane && blueWS.strongLane) {
      adv[blueWS.weakLane] -= 25;
      adv[blueWS.strongLane] += 15;
    }
    const redWS = detectWeakside(redPicks);
    if (redWS.weakLane && redWS.strongLane) {
      adv[redWS.weakLane] += 25;
      adv[redWS.strongLane] -= 15;
    }
    applyCarryFunnel(adv, bluePicks, redPicks, blueForms, 1);
    applyCarryFunnel(adv, bluePicks, redPicks, redForms, -1);
    return adv;
  }
  var CARRY_FUNNEL_K = 12;
  var CARRY_FUNNEL_MIN_FORM = 0.25;
  function applyCarryFunnel(adv, bluePicks, redPicks, forms, sign) {
    if (!forms) return;
    let hot = null;
    let cold = null;
    let hi = -Infinity;
    let lo = Infinity;
    for (let i = 0; i < POSITIONAL_LANES3.length; i++) {
      if (!bluePicks[i] || !redPicks[i]) continue;
      const lane = POSITIONAL_LANES3[i];
      const f = forms[lane] ?? 0;
      if (f > hi) {
        hi = f;
        hot = lane;
      }
      if (f < lo) {
        lo = f;
        cold = lane;
      }
    }
    if (!hot || !cold || hot === cold) return;
    if (hi < CARRY_FUNNEL_MIN_FORM) return;
    const amount = Math.min(1, hi - Math.max(0, lo)) * CARRY_FUNNEL_K;
    if (amount <= 0) return;
    adv[hot] += sign * amount;
    adv[cold] -= sign * amount;
  }
  function applyLaneNoise(adv, bluePicks, redPicks, rng) {
    const out = { ...adv };
    for (let i = 0; i < POSITIONAL_LANES3.length; i++) {
      if (!bluePicks[i] || !redPicks[i]) continue;
      out[POSITIONAL_LANES3[i]] += (rng() - 0.5) * 20;
    }
    return out;
  }
  function computeDuration(ctx, rng = Math.random) {
    const blueLate = lateScalingCount(ctx.bluePicks);
    const redLate = lateScalingCount(ctx.redPicks);
    const blueEarly = earlyCount(ctx.bluePicks);
    const redEarly = earlyCount(ctx.redPicks);
    let duration = 34 + (blueLate + redLate) * 1.3 - (blueEarly + redEarly) * 0.6;
    const absDiff = Math.abs(ctx.diff);
    if (absDiff > 25) duration -= 4;
    else if (absDiff > 15) duration -= 2;
    const leadingEarly = ctx.diff > 0 ? blueEarly : ctx.diff < 0 ? redEarly : 0;
    if (leadingEarly >= 2 && absDiff > 8) {
      duration -= leadingEarly * 1.2;
    }
    duration += strategyTimelineModifiers(
      ctx.blueStrategy,
      ctx.redStrategy
    ).durationDelta;
    duration += Math.floor(rng() * 6) - 2;
    return Math.max(24, Math.min(50, duration));
  }
  function generateTimeline(ctx, duration, rng = Math.random) {
    const state = {
      goldLead: 0,
      momentum: 0,
      drakes: { blue: 0, red: 0 },
      soulSide: null,
      soulType: null,
      laneLead: { ...ctx.laneAdvantages },
      lastGankSide: null,
      jungleBehind: null,
      baronExpiresAt: null,
      baronSide: null,
      elderSide: null,
      pickAdvantage: null,
      cooldownEdge: null,
      towerPressure: { blue: 0, red: 0 },
      mapControl: { blue: 0, red: 0 },
      grubCount: { blue: 0, red: 0 },
      atakhanVariant: null,
      atakhanSide: null,
      ruinousActive: false,
      recentSides: []
    };
    const events = [];
    const laneBias = (() => {
      let total = 0;
      for (const lane of POSITIONAL_LANES3) total += ctx.laneAdvantages[lane];
      return total / 1e3;
    })();
    const mods = strategyTimelineModifiers(
      ctx.blueStrategy,
      ctx.redStrategy
    );
    const blueSpikes = carrySpikeMinutes(ctx.bluePicks);
    const redSpikes = carrySpikeMinutes(ctx.redPicks);
    const spikeBias = (time) => Math.max(
      -0.4,
      Math.min(
        0.4,
        (onlineSpikeCount(blueSpikes, time) - onlineSpikeCount(redSpikes, time)) * 0.13
      )
    );
    const tasks = [];
    let taskSeq = 0;
    const tl = {
      ctx,
      duration,
      rng,
      state,
      events,
      schedule: (time, resolve) => {
        tasks.push({ time, seq: taskSeq++, resolve });
      },
      laneBias,
      mods,
      spikeBias,
      combatRatioBlue: (bp, rp, time, goldLead) => combatRatioBlue(
        bp,
        [...POSITIONAL_LANES3],
        rp,
        [...POSITIONAL_LANES3],
        time,
        goldLead,
        null
      ),
      fightDominance
    };
    phaseLevelOneInvade(tl);
    phaseCheese(tl);
    phaseFirstScuttle(tl);
    phaseSoloKills(tl);
    phaseFirstBlood(tl);
    phaseGrubs(tl);
    phaseFirstDrake(tl);
    phaseGank(tl);
    phaseCounterGank(tl);
    phaseLevelSpikeGank(tl);
    phaseCounterJungle(tl);
    phaseBuffSteal(tl);
    phasePlates(tl);
    phaseMidRoam(tl);
    phaseSupportRoam(tl);
    phaseWaveCrash(tl);
    phaseTowerDive(tl);
    phaseFirstTower(tl);
    phaseAtakhanOrHerald(tl);
    phasePowerSpikes(tl);
    phaseSecondDrake(tl);
    phaseMidPickOrSkirmish(tl);
    phaseThirdDrake(tl);
    phasePitSkirmish(tl);
    phaseMidTeamfight(tl);
    phaseShutdown(tl);
    phaseVisionPick(tl);
    phaseVisionSweep(tl);
    phaseTeleportFlank(tl);
    phaseOutplay(tl);
    phaseObjectiveTrade(tl);
    phasePokeSiege(tl);
    phaseBaronDance(tl);
    phaseComebackStand(tl);
    phaseDisengage(tl);
    phaseThrownLead(tl);
    phaseBackdoorAttempt(tl);
    phaseFourthDrakeSoul(tl);
    phaseFirstBaron(tl);
    phaseMidTower(tl);
    phaseElder(tl);
    tasks.sort((a, b) => a.time - b.time || a.seq - b.seq);
    for (const task of tasks) task.resolve();
    const positionalRoles = [...POSITIONAL_LANES3];
    const finalLaneGold = computeFinalLaneGold(tl);
    const combat = resolveCombat(
      ctx.bluePicks,
      positionalRoles,
      ctx.redPicks,
      positionalRoles,
      duration,
      state.goldLead,
      finalLaneGold,
      rng
    );
    const finalWinner = decideClosingWinner(tl, combat);
    phaseInhibitorCascade(tl, finalWinner);
    phaseLastStand(tl, finalWinner);
    phaseClosingFight(tl, finalWinner, combat);
    phaseNexus(tl, finalWinner);
    const laningEndMinute = finalizeTimeline(tl);
    return { events, finalWinner, laningEndMinute };
  }
  function simulateMatch(game, champions, options) {
    const byId = new Map(champions.map((c) => [c.id, c]));
    const bluePicks = game.bluePicks.map(
      (id) => id != null ? byId.get(id) ?? null : null
    );
    const redPicks = game.redPicks.map(
      (id) => id != null ? byId.get(id) ?? null : null
    );
    const blueScore = teamScore(bluePicks, game.blueRoles, redPicks, game.redRoles);
    const redScore = teamScore(redPicks, game.redRoles, bluePicks, game.blueRoles);
    const blueStrategy = options?.blueStrategy ?? game.blueStrategy ?? DEFAULT_STRATEGY;
    const redStrategy = options?.redStrategy ?? game.redStrategy ?? DEFAULT_STRATEGY;
    const scoreBias = options?.scoreBias ?? 0;
    const rng = options?.rng ?? Math.random;
    const strategyBias = strategyFit(blueStrategy, bluePicks) - strategyFit(redStrategy, redPicks);
    const diff = blueScore.total - redScore.total + scoreBias + strategyBias;
    const blueLatePre = lateScalingCount(bluePicks);
    const redLatePre = lateScalingCount(redPicks);
    const blueEarlyPre = earlyCount(bluePicks);
    const redEarlyPre = earlyCount(redPicks);
    const scalingEdgePre = blueLatePre - redLatePre + (redEarlyPre - blueEarlyPre) * 0.5;
    const expectedDuration = 34 + (blueLatePre + redLatePre) * 1.3 - (blueEarlyPre + redEarlyPre) * 0.6;
    const baseLaneAdvantages = computeLaneAdvantages(
      bluePicks,
      redPicks,
      options?.bluePlayers,
      options?.redPlayers,
      options?.playerForms?.blue,
      options?.playerForms?.red
    );
    function runOutcome(r) {
      let la = applyLaneNoise(baseLaneAdvantages, bluePicks, redPicks, r);
      la = applyWeaksideToLaneAdv(la, blueStrategy, redStrategy);
      la = applyCarryFocusToLaneAdv(la, blueStrategy, redStrategy);
      la = applyPickTargetToLaneAdv(la, blueStrategy, redStrategy);
      la = applyLaneSwapToLaneAdv(la, blueStrategy, redStrategy);
      const ctx = {
        diff,
        blueScore,
        redScore,
        bluePicks,
        redPicks,
        blueName: game.blueTeam,
        redName: game.redTeam,
        laneAdvantages: la,
        blueStrategy,
        redStrategy,
        adaptiveMidgame: options?.adaptiveMidgame,
        // Highlight-play propensity = form merged with champion-pool comfort.
        blueForms: highlightForms(
          options?.bluePlayers,
          bluePicks,
          options?.playerForms?.blue
        ),
        redForms: highlightForms(
          options?.redPlayers,
          redPicks,
          options?.playerForms?.red
        )
      };
      const duration = computeDuration(ctx, r);
      const out = generateTimeline(ctx, duration, r);
      return { ...out, laneAdvantages: la, duration };
    }
    const main = runOutcome(rng);
    const samples = options?.forecastSamples ?? 0;
    let blueProb;
    if (samples > 0) {
      let blueWins = 0;
      for (let i = 0; i < samples; i++) {
        if (runOutcome(rng).finalWinner === "blue") blueWins++;
      }
      blueProb = Math.min(
        PROB_CLAMP_MAX,
        Math.max(PROB_CLAMP_MIN, blueWins / samples)
      );
    } else {
      blueProb = pregameBlueWinProb(diff, scalingEdgePre, expectedDuration);
    }
    const redProb = 1 - blueProb;
    const timeline = {
      durationMinutes: main.duration,
      laningEndMinute: main.laningEndMinute,
      durationLabel: formatTime(main.duration),
      events: main.events
    };
    return {
      blueProb,
      redProb,
      winner: main.finalWinner,
      blueScore,
      redScore,
      timeline,
      laneAdvantages: main.laneAdvantages
    };
  }
  var RATING_BASE = 5;
  var RATING_KDA_SCALE = 2.4;
  var RATING_KDA_DIVISOR = 7;
  var RATING_INVOLVEMENT_SCALE = 1.2;
  var RATING_GOLD_SATURATION = 2e3;
  var RATING_RESULT_BONUS = 0.45;
  var ROLE_RATING = {
    top: { invCenter: 0.42, assistWeight: 0.72, goldWeight: 1.05 },
    jungle: { invCenter: 0.62, assistWeight: 0.48, goldWeight: 0.75 },
    middle: { invCenter: 0.52, assistWeight: 0.65, goldWeight: 0.95 },
    bottom: { invCenter: 0.48, assistWeight: 0.72, goldWeight: 1.12 },
    support: { invCenter: 0.58, assistWeight: 0.48, goldWeight: 0.72 }
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
  function buildGameRecap(game, champions, result, bluePlayers, redPlayers) {
    const byId = new Map(champions.map((c) => [c.id, c]));
    const events = result.timeline.events;
    const positionalLanes = [
      "top",
      "jungle",
      "middle",
      "bottom",
      "support"
    ];
    const blueKDA = {
      top: { k: 0, d: 0, a: 0 },
      jungle: { k: 0, d: 0, a: 0 },
      middle: { k: 0, d: 0, a: 0 },
      bottom: { k: 0, d: 0, a: 0 },
      support: { k: 0, d: 0, a: 0 }
    };
    const redKDA = {
      top: { k: 0, d: 0, a: 0 },
      jungle: { k: 0, d: 0, a: 0 },
      middle: { k: 0, d: 0, a: 0 },
      bottom: { k: 0, d: 0, a: 0 },
      support: { k: 0, d: 0, a: 0 }
    };
    const laneGoldEvent = {
      top: 0,
      jungle: 0,
      middle: 0,
      bottom: 0,
      support: 0
    };
    const pentakills = [];
    for (const e of events) {
      for (const lane of positionalLanes) {
        const b = e.kdaDelta.blue[lane];
        if (b) {
          blueKDA[lane].k += b.k;
          blueKDA[lane].d += b.d;
          blueKDA[lane].a += b.a;
        }
        const r = e.kdaDelta.red[lane];
        if (r) {
          redKDA[lane].k += r.k;
          redKDA[lane].d += r.d;
          redKDA[lane].a += r.a;
        }
        laneGoldEvent[lane] += e.laneGoldDelta[lane] ?? 0;
      }
      if (e.pentakill) {
        const laneIdx = positionalLanes.indexOf(e.pentakill.lane);
        const picks = e.side === "blue" ? game.bluePicks : game.redPicks;
        pentakills.push({
          minute: e.minutes,
          side: e.side,
          championId: picks[laneIdx] ?? -1,
          championName: e.pentakill.championName,
          teamName: e.side === "blue" ? game.blueTeam : game.redTeam,
          lane: e.pentakill.lane
        });
      }
    }
    const lanePhaseTime = Math.min(
      result.timeline.durationMinutes,
      result.timeline.laningEndMinute
    );
    const finalLaneGold = {
      top: 0,
      jungle: 0,
      middle: 0,
      bottom: 0,
      support: 0
    };
    for (const lane of positionalLanes) {
      finalLaneGold[lane] = result.laneAdvantages[lane] * lanePhaseTime + laneGoldEvent[lane];
    }
    const candidates = [];
    for (let i = 0; i < positionalLanes.length; i++) {
      const lane = positionalLanes[i];
      if (result.winner === "blue") {
        const blueId = game.bluePicks[i];
        if (blueId != null && byId.has(blueId)) {
          const kda = blueKDA[lane];
          const diff = finalLaneGold[lane];
          candidates.push({
            side: "blue",
            lane,
            championId: blueId,
            kda,
            laneGoldDiff: diff,
            score: kda.k + kda.a * 0.7 - kda.d * 0.5 + diff / 1e3
          });
        }
      } else {
        const redId = game.redPicks[i];
        if (redId != null && byId.has(redId)) {
          const kda = redKDA[lane];
          const diff = -finalLaneGold[lane];
          candidates.push({
            side: "red",
            lane,
            championId: redId,
            kda,
            laneGoldDiff: diff,
            score: kda.k + kda.a * 0.7 - kda.d * 0.5 + diff / 1e3
          });
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const mvpRoster = (side) => side === "blue" ? bluePlayers : redPlayers;
    const mvp = candidates[0] ? {
      side: candidates[0].side,
      lane: candidates[0].lane,
      championId: candidates[0].championId,
      kills: candidates[0].kda.k,
      deaths: candidates[0].kda.d,
      assists: candidates[0].kda.a,
      laneGoldDiff: candidates[0].laneGoldDiff,
      ...(() => {
        const slot = mvpRoster(candidates[0].side)?.[positionalLanes.indexOf(candidates[0].lane)];
        return {
          ...slot?.name ? { playerName: slot.name } : {},
          ...slot?.id ? { playerId: slot.id } : {}
        };
      })()
    } : null;
    let biggestSwing = null;
    let prev = 0.5;
    for (const e of events) {
      const delta = e.winProbAfter - prev;
      if (biggestSwing == null || Math.abs(delta) > Math.abs(biggestSwing.probDelta)) {
        biggestSwing = {
          minute: e.minutes,
          side: e.side,
          type: e.type,
          description: e.description,
          probDelta: delta
        };
      }
      prev = e.winProbAfter;
    }
    const laneGoldDiff = {};
    for (const lane of positionalLanes) {
      const v = finalLaneGold[lane];
      laneGoldDiff[lane] = Number.isFinite(v) ? Math.round(v) : 0;
    }
    const winProbTimeline = events.map((e) => ({
      minute: Math.round(e.minutes * 10) / 10,
      blueProb: e.winProbAfter
    }));
    const goldLeadTimeline = events.map((e) => ({
      minute: Math.round(e.minutes * 10) / 10,
      goldLead: Math.round(e.goldLeadAfter)
    }));
    const eventsRanked = events.map((e, idx) => ({
      idx,
      minute: e.minutes,
      side: e.side,
      type: e.type,
      description: e.description,
      probDelta: e.winProbAfter - (idx === 0 ? 0.5 : events[idx - 1].winProbAfter)
    })).sort((a, b) => Math.abs(b.probDelta) - Math.abs(a.probDelta));
    const notableEvents = eventsRanked.slice(0, 12).sort((a, b) => a.minute - b.minute).map((e) => ({
      minute: Math.round(e.minute * 10) / 10,
      side: e.side,
      type: e.type,
      description: e.description,
      probDelta: e.probDelta
    }));
    const perPickKDA = {
      blue: positionalLanes.map((lane) => ({
        k: blueKDA[lane].k,
        d: blueKDA[lane].d,
        a: blueKDA[lane].a
      })),
      red: positionalLanes.map((lane) => ({
        k: redKDA[lane].k,
        d: redKDA[lane].d,
        a: redKDA[lane].a
      }))
    };
    const perPickNames = bluePlayers || redPlayers ? {
      blue: positionalLanes.map((_, i) => bluePlayers?.[i]?.name ?? null),
      red: positionalLanes.map((_, i) => redPlayers?.[i]?.name ?? null)
    } : void 0;
    const perPickIds = bluePlayers || redPlayers ? {
      blue: positionalLanes.map((_, i) => bluePlayers?.[i]?.id ?? null),
      red: positionalLanes.map((_, i) => redPlayers?.[i]?.id ?? null)
    } : void 0;
    const hasNames = perPickNames && (perPickNames.blue.some(Boolean) || perPickNames.red.some(Boolean));
    const hasIds = perPickIds && (perPickIds.blue.some(Boolean) || perPickIds.red.some(Boolean));
    const ratings = computeGameRatings(
      { durationMinutes: result.timeline.durationMinutes, laneGoldDiff, perPickKDA },
      result.winner
    ) ?? void 0;
    return {
      durationMinutes: result.timeline.durationMinutes,
      mvp,
      laneGoldDiff,
      biggestSwing,
      winProbTimeline,
      goldLeadTimeline,
      notableEvents,
      perPickKDA,
      ratings,
      ...hasNames ? { perPickNames } : {},
      ...hasIds ? { perPickIds } : {},
      pentakills: pentakills.length ? pentakills : void 0
    };
  }

  // lib/tournament.ts
  function formatHasPlayoffs(format) {
    return format === "swiss-playoffs" || format === "swiss-playoffs-de" || format === "swiss-playoffs-te" || format === "groups-playoffs" || format === "groups-playoffs-de" || format === "groups-playoffs-te" || format === "round-robin-playoffs" || format === "round-robin-playoffs-te" || format === "round-robin-playoffs-step";
  }
  function isTriplePlayoffsFormat(format) {
    return format === "round-robin-playoffs-te" || format === "swiss-playoffs-te" || format === "groups-playoffs-te";
  }
  function teamStarRating(team) {
    if (!team) return 3;
    if (Array.isArray(team.players) && team.players.length > 0) {
      return deriveStar(team.players);
    }
    const r = team.starRating;
    if (typeof r !== "number" || !Number.isFinite(r)) return 3;
    return Math.max(1, Math.min(5, Math.round(r)));
  }
  function bracketChronoRank(bracket) {
    switch (bracket) {
      case "winners":
        return 1;
      case "losers":
        return 2;
      case "grand-final":
        return 3;
      case "grand-final-reset":
        return 4;
      default:
        return 0;
    }
  }
  function compareMatchChronology(a, b) {
    return bracketChronoRank(a.bracket) - bracketChronoRank(b.bracket) || a.round - b.round || a.id.localeCompare(b.id);
  }
  function teamStreak(tournament, teamId, excludeMatchId) {
    const seed = tournament.streakSeeds?.[teamId] ?? 0;
    const played = tournament.matches.filter((m) => m.id !== excludeMatchId && !m.isBye).filter(
      (m) => m.winner != null && (m.blueTeamId === teamId || m.redTeamId === teamId)
    ).sort(compareMatchChronology);
    if (played.length === 0) return seed;
    const lastWon = played[played.length - 1].winner.teamId === teamId;
    let count = 0;
    let unbroken = true;
    for (let i = played.length - 1; i >= 0; i--) {
      if (played[i].winner.teamId === teamId === lastWon) {
        count++;
      } else {
        unbroken = false;
        break;
      }
    }
    if (unbroken && (lastWon ? seed > 0 : seed < 0)) {
      count += Math.abs(seed);
    }
    return lastWon ? count : -count;
  }
  function tournamentRoundDepth(tournament, matchId) {
    const match = tournament.matches.find((m) => m.id === matchId);
    if (!match) return "early";
    const isStageMatch = !match.bracket && // double-elim matches always have a bracket tag
    (tournament.format === "round-robin" || tournament.format === "swiss" || // For *-playoffs formats, stage matches are identified by
    // groupId presence (groups) or by being in the early matches
    // pool before any bracket matches were generated. The simplest
    // heuristic: stage matches lack `feedsInto` (they don't advance
    // anywhere within a bracket).
    formatHasPlayoffs(tournament.format) && !match.feedsInto && !match.bracket);
    if (isStageMatch) return "early";
    const fedIntoIds = /* @__PURE__ */ new Set();
    for (const m of tournament.matches) {
      if (m.feedsInto?.matchId) fedIntoIds.add(m.feedsInto.matchId);
    }
    const isBracketMatch = (m) => m.feedsInto != null || fedIntoIds.has(m.id) || m.bracket != null;
    const peers = tournament.matches.filter((m) => {
      if (match.bracket) {
        return m.bracket === match.bracket;
      }
      return !m.bracket && isBracketMatch(m);
    });
    const maxRound = peers.reduce((acc, m) => Math.max(acc, m.round), 0);
    if (maxRound === 0) return "early";
    if (match.bracket === "grand-final" || match.bracket === "grand-final-reset") {
      return "final";
    }
    if (match.round === maxRound) return "final";
    if (match.round === maxRound - 1) return "semifinal";
    if (match.round === maxRound - 2) return "quarterfinal";
    return "early";
  }
  function tournamentSeriesContext(tournament, matchId) {
    const match = tournament.matches.find((m) => m.id === matchId);
    if (!match || match.blueTeamId == null || match.redTeamId == null) {
      return null;
    }
    const blueTeam = tournament.teams.find((t) => t.id === match.blueTeamId);
    const redTeam = tournament.teams.find((t) => t.id === match.redTeamId);
    return {
      blueStarRating: teamStarRating(blueTeam ?? null),
      redStarRating: teamStarRating(redTeam ?? null),
      blueWinStreak: teamStreak(tournament, match.blueTeamId, matchId),
      redWinStreak: teamStreak(tournament, match.redTeamId, matchId),
      roundDepth: tournamentRoundDepth(tournament, matchId),
      blueForm: blueTeam?.form,
      redForm: redTeam?.form,
      blueClutch: blueTeam?.clutch,
      redClutch: redTeam?.clutch,
      variancePreset: tournament.variancePreset
    };
  }
  function pickFormat(defaults, overrides, ...keys) {
    if (!overrides) return defaults.format;
    for (const k of keys) {
      const v = overrides[k];
      if (v) return v;
    }
    return defaults.format;
  }
  var _matchCounter = 0;
  function makeMatchId() {
    _matchCounter++;
    return `m-${Date.now().toString(36)}-${_matchCounter.toString(36)}`;
  }
  var TRIPLE_ELIM_LIVES = 3;
  function tripleElimLosses(matches) {
    const losses = /* @__PURE__ */ new Map();
    for (const m of matches) {
      if (!m.winner || m.isBye) continue;
      if (m.blueTeamId == null || m.redTeamId == null) continue;
      const loserId = m.winner.teamId === m.blueTeamId ? m.redTeamId : m.blueTeamId;
      losses.set(loserId, (losses.get(loserId) ?? 0) + 1);
    }
    return losses;
  }
  function tripleElimTierBracket(loss) {
    return loss <= 0 ? "winners" : loss === 1 ? "losers" : "elimination";
  }
  function tripleElimEliminated(matches) {
    const losses = tripleElimLosses(matches);
    const out = /* @__PURE__ */ new Set();
    for (const [id, n2] of losses) if (n2 >= TRIPLE_ELIM_LIVES) out.add(id);
    for (const m of matches) {
      if (m.bracket !== "consolation" && m.bracket !== "grand-final" || !m.winner) {
        continue;
      }
      if (m.blueTeamId == null || m.redTeamId == null) continue;
      out.add(m.winner.teamId === m.blueTeamId ? m.redTeamId : m.blueTeamId);
    }
    return out;
  }
  function generateTripleElimRound(teams, existingMatches, roundNumber, defaults, formatOverrides, keyPrefix = "") {
    const losses = tripleElimLosses(existingMatches);
    const lossOf = (id) => losses.get(id) ?? 0;
    const eliminated = tripleElimEliminated(existingMatches);
    const alive = teams.filter((t) => !eliminated.has(t.id));
    if (alive.length <= 1) return [];
    const playoff = keyPrefix === "po:";
    const makeMatch = (a, b, bracket) => {
      const isFinal = bracket === "consolation" || bracket === "grand-final";
      const format = isFinal ? playoff ? pickFormat(defaults, formatOverrides, "po:te:final", "po:final", "po:gf", "main") : pickFormat(defaults, formatOverrides, "te:final", "final", "gf", "main") : playoff ? pickFormat(defaults, formatOverrides, `po:te:${bracket}`, "po:wb:1", "main") : pickFormat(defaults, formatOverrides, `te:${bracket}`, "main");
      return {
        id: makeMatchId(),
        round: roundNumber,
        blueTeamId: a.id,
        redTeamId: b.id,
        format,
        fearless: defaults.fearless,
        mode: defaults.mode,
        aiSide: defaults.aiSide,
        aiDifficulty: defaults.aiDifficulty,
        series: null,
        winner: null,
        feedsInto: null,
        bracket
      };
    };
    const prevOpp = /* @__PURE__ */ new Map();
    for (const m of existingMatches) {
      if (m.isBye || m.blueTeamId == null || m.redTeamId == null) continue;
      (prevOpp.get(m.blueTeamId) ?? prevOpp.set(m.blueTeamId, /* @__PURE__ */ new Set()).get(m.blueTeamId)).add(m.redTeamId);
      (prevOpp.get(m.redTeamId) ?? prevOpp.set(m.redTeamId, /* @__PURE__ */ new Set()).get(m.redTeamId)).add(m.blueTeamId);
    }
    const haveMet = (a, b) => prevOpp.get(a)?.has(b) ?? false;
    const pairGroup = (group) => {
      const remaining = [...group].sort((a, b) => a.seed - b.seed);
      const pairs = [];
      while (remaining.length >= 2) {
        const a = remaining.shift();
        let idx = -1;
        for (let j = remaining.length - 1; j >= 0; j--) {
          if (!haveMet(a.id, remaining[j].id)) {
            idx = j;
            break;
          }
        }
        if (idx === -1) idx = remaining.length - 1;
        const b = remaining.splice(idx, 1)[0];
        pairs.push([a, b]);
      }
      return { pairs, leftover: remaining[0] ?? null };
    };
    const tiers = [...new Set(alive.map((t) => lossOf(t.id)))].sort(
      (a, b) => a - b
    );
    for (const tier of tiers) {
      const group = alive.filter((t) => lossOf(t.id) === tier);
      if (group.length < 2) continue;
      const { pairs } = pairGroup(group);
      if (pairs.length === 0) continue;
      return pairs.map(([a, b]) => makeMatch(a, b, tripleElimTierBracket(tier)));
    }
    const champs = [...alive].sort(
      (a, b) => lossOf(a.id) - lossOf(b.id) || a.seed - b.seed
    );
    if (champs.length >= 3) {
      return [makeMatch(champs[1], champs[2], "consolation")];
    }
    if (champs.length === 2) {
      return [makeMatch(champs[0], champs[1], "grand-final")];
    }
    return [];
  }
  function makeBye(team, round, defaults, formatOverrides) {
    return {
      id: makeMatchId(),
      round,
      blueTeamId: team.id,
      redTeamId: null,
      format: pickFormat(defaults, formatOverrides, `main:${round}`, "main"),
      fearless: defaults.fearless,
      mode: defaults.mode,
      aiSide: defaults.aiSide,
      aiDifficulty: defaults.aiDifficulty,
      series: null,
      winner: { teamId: team.id, blueWins: 1, redWins: 0 },
      feedsInto: null,
      isBye: true
    };
  }
  function computeSwissStandings(tournament) {
    const wins = /* @__PURE__ */ new Map();
    const losses = /* @__PURE__ */ new Map();
    const gamesWon = /* @__PURE__ */ new Map();
    const gamesLost = /* @__PURE__ */ new Map();
    const opponents = /* @__PURE__ */ new Map();
    for (const team of tournament.teams) {
      wins.set(team.id, 0);
      losses.set(team.id, 0);
      gamesWon.set(team.id, 0);
      gamesLost.set(team.id, 0);
      opponents.set(team.id, []);
    }
    for (const m of tournament.matches) {
      if (!m.winner) continue;
      if (m.isBye) {
        const byeId = m.winner.teamId;
        wins.set(byeId, (wins.get(byeId) ?? 0) + 1);
        opponents.get(byeId).push("");
        continue;
      }
      if (!m.blueTeamId || !m.redTeamId) continue;
      const blueId = m.blueTeamId;
      const redId = m.redTeamId;
      opponents.get(blueId).push(redId);
      opponents.get(redId).push(blueId);
      gamesWon.set(blueId, (gamesWon.get(blueId) ?? 0) + m.winner.blueWins);
      gamesWon.set(redId, (gamesWon.get(redId) ?? 0) + m.winner.redWins);
      gamesLost.set(blueId, (gamesLost.get(blueId) ?? 0) + m.winner.redWins);
      gamesLost.set(redId, (gamesLost.get(redId) ?? 0) + m.winner.blueWins);
      if (m.winner.teamId === blueId) {
        wins.set(blueId, (wins.get(blueId) ?? 0) + 1);
        losses.set(redId, (losses.get(redId) ?? 0) + 1);
      } else {
        wins.set(redId, (wins.get(redId) ?? 0) + 1);
        losses.set(blueId, (losses.get(blueId) ?? 0) + 1);
      }
    }
    const byeIds = new Set(tournament.swissByeTeamIds ?? []);
    const out = tournament.teams.filter((team) => !byeIds.has(team.id)).map((team) => {
      const oppList = opponents.get(team.id) ?? [];
      const oppWins = oppList.map((oid) => wins.get(oid) ?? 0);
      const buchholz = oppWins.reduce((a, b) => a + b, 0);
      let medianBuchholz = buchholz;
      if (oppWins.length >= 3) {
        const sorted = [...oppWins].sort((a, b) => a - b);
        medianBuchholz = buchholz - sorted[0] - sorted[sorted.length - 1];
      }
      return {
        team,
        played: oppList.length,
        wins: wins.get(team.id) ?? 0,
        losses: losses.get(team.id) ?? 0,
        gamesWon: gamesWon.get(team.id) ?? 0,
        gamesLost: gamesLost.get(team.id) ?? 0,
        buchholz,
        medianBuchholz,
        sos: buchholz,
        rank: 0
      };
    });
    out.sort((a, b) => {
      if (a.wins !== b.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      if (a.medianBuchholz !== b.medianBuchholz)
        return b.medianBuchholz - a.medianBuchholz;
      if (a.buchholz !== b.buchholz) return b.buchholz - a.buchholz;
      const aDiff = a.gamesWon - a.gamesLost;
      const bDiff = b.gamesWon - b.gamesLost;
      if (aDiff !== bDiff) return bDiff - aDiff;
      if (a.gamesWon !== b.gamesWon) return b.gamesWon - a.gamesWon;
      return a.team.seed - b.team.seed;
    });
    out.forEach((s, i) => s.rank = i + 1);
    return out;
  }
  function nextSeriesUp(f) {
    return f === "bo1" ? "bo3" : f === "bo3" ? "bo5" : "bo5";
  }
  function generateNextSwissRound(tournament, currentRound) {
    if (tournament.swissTotalRounds == null || currentRound >= tournament.swissTotalRounds) {
      return [];
    }
    const fullStandings = computeSwissStandings(tournament);
    const winTarget = tournament.swissWinTarget ?? null;
    const active = winTarget != null ? fullStandings.filter((s) => s.wins < winTarget && s.losses < winTarget) : fullStandings;
    if (winTarget != null && active.length < 2) {
      return [];
    }
    const prevOpponents = /* @__PURE__ */ new Map();
    for (const team of tournament.teams) prevOpponents.set(team.id, /* @__PURE__ */ new Set());
    for (const m of tournament.matches) {
      if (!m.blueTeamId || !m.redTeamId) continue;
      prevOpponents.get(m.blueTeamId).add(m.redTeamId);
      prevOpponents.get(m.redTeamId).add(m.blueTeamId);
    }
    const round = currentRound + 1;
    const byeRecipients = /* @__PURE__ */ new Set();
    for (const m of tournament.matches) {
      if (m.isBye && m.winner) byeRecipients.add(m.winner.teamId);
    }
    const recordOf = /* @__PURE__ */ new Map();
    for (const s of active) recordOf.set(s.team.id, { wins: s.wins, losses: s.losses });
    let byeTeam = null;
    let pool = active.map((s) => s.team);
    if (pool.length % 2 === 1) {
      for (let i = pool.length - 1; i >= 0; i--) {
        if (!byeRecipients.has(pool[i].id)) {
          byeTeam = pool[i];
          break;
        }
      }
      if (!byeTeam) byeTeam = pool[pool.length - 1];
      pool = pool.filter((t) => t.id !== byeTeam.id);
    }
    const groups = [];
    let prevKey = "";
    for (const t of pool) {
      const rec = recordOf.get(t.id);
      const key = `${rec.wins}-${rec.losses}`;
      if (key !== prevKey) {
        groups.push([]);
        prevKey = key;
      }
      groups[groups.length - 1].push(t);
    }
    const result = [];
    let sideFlip = round;
    let floater = null;
    for (const group of groups) {
      const tier = floater ? [floater, ...group] : [...group];
      floater = null;
      const paired = /* @__PURE__ */ new Set();
      for (let i = 0; i < tier.length; i++) {
        const a = tier[i];
        if (paired.has(a.id)) continue;
        let b = null;
        for (let j = i + 1; j < tier.length; j++) {
          const cand = tier[j];
          if (paired.has(cand.id)) continue;
          if (prevOpponents.get(a.id).has(cand.id)) continue;
          b = cand;
          break;
        }
        if (!b) {
          for (let j = i + 1; j < tier.length; j++) {
            const cand = tier[j];
            if (paired.has(cand.id)) continue;
            b = cand;
            break;
          }
        }
        if (!b) continue;
        paired.add(a.id);
        paired.add(b.id);
        const aRec = recordOf.get(a.id);
        const bRec = recordOf.get(b.id);
        const isDecider = winTarget != null && (aRec.wins === winTarget - 1 || bRec.wins === winTarget - 1 || aRec.losses === winTarget - 1 || bRec.losses === winTarget - 1);
        const baseFormat = pickFormat(
          tournament.defaults,
          tournament.formatOverrides,
          `main:${round}`,
          "main"
        );
        const aIsBlue = sideFlip % 2 === 0;
        sideFlip++;
        const blue = aIsBlue ? a : b;
        const red = aIsBlue ? b : a;
        result.push({
          id: makeMatchId(),
          round,
          blueTeamId: blue.id,
          redTeamId: red.id,
          format: isDecider ? nextSeriesUp(baseFormat) : baseFormat,
          fearless: tournament.defaults.fearless,
          mode: tournament.defaults.mode,
          aiSide: tournament.defaults.aiSide,
          aiDifficulty: tournament.defaults.aiDifficulty,
          series: null,
          winner: null,
          feedsInto: null
        });
      }
      const leftover = tier.find(
        (t) => !paired.has(t.id)
      );
      if (leftover) floater = leftover;
    }
    if (floater && !byeTeam) {
      byeTeam = floater;
    }
    if (byeTeam) {
      result.push(
        makeBye(byeTeam, round, tournament.defaults, tournament.formatOverrides)
      );
    }
    return result;
  }
  function recordMatchWinner(tournament, matchId, winner) {
    const matches = tournament.matches.map((m) => {
      if (m.id !== matchId) return m;
      return { ...m, winner };
    });
    const finishedMatch = matches.find((m) => m.id === matchId);
    if (!finishedMatch) return tournament;
    if (finishedMatch.feedsInto) {
      const destIdx = matches.findIndex(
        (m) => m.id === finishedMatch.feedsInto.matchId
      );
      if (destIdx >= 0) {
        const dest = matches[destIdx];
        const slotKey = finishedMatch.feedsInto.slot === "blue" ? "blueTeamId" : "redTeamId";
        matches[destIdx] = { ...dest, [slotKey]: winner.teamId };
      }
    }
    if (finishedMatch.losersFeedsInto) {
      const blueId = finishedMatch.blueTeamId;
      const redId = finishedMatch.redTeamId;
      if (blueId != null && redId != null) {
        const loserId = winner.teamId === blueId ? redId : blueId;
        const destIdx = matches.findIndex(
          (m) => m.id === finishedMatch.losersFeedsInto.matchId
        );
        if (destIdx >= 0) {
          const dest = matches[destIdx];
          const slotKey = finishedMatch.losersFeedsInto.slot === "blue" ? "blueTeamId" : "redTeamId";
          matches[destIdx] = { ...dest, [slotKey]: loserId };
        }
      }
    }
    let status = tournament.status;
    const isSEPlayoffsFinal = (tournament.format === "groups-playoffs" || tournament.format === "swiss-playoffs" || // Stepladder is a single-elim-shaped chain — its final is the only
    // winners match with no feedsInto, same completion shape.
    tournament.format === "round-robin-playoffs-step") && finishedMatch.bracket === "winners" && !finishedMatch.feedsInto;
    const isDEPlayoffsContext = tournament.format === "double-elim" || tournament.format === "swiss-playoffs-de" || tournament.format === "groups-playoffs-de" || tournament.format === "round-robin-playoffs";
    if (tournament.format === "single-elim" && !finishedMatch.feedsInto) {
      status = "complete";
    } else if (tournament.format === "round-robin") {
      if (matches.every((m) => m.winner != null)) {
        status = "complete";
      }
    } else if (isSEPlayoffsFinal) {
      status = "complete";
    } else if (tournament.format === "swiss" || (tournament.format === "swiss-playoffs" || tournament.format === "swiss-playoffs-de" || tournament.format === "swiss-playoffs-te") && finishedMatch.bracket === void 0) {
      const round = finishedMatch.round;
      const sameRound = matches.filter(
        (m) => m.round === round && m.bracket === void 0
      );
      if (sameRound.every((m) => m.winner != null)) {
        const nextMatches = generateNextSwissRound(
          { ...tournament, matches },
          round
        );
        if (nextMatches.length > 0) {
          matches.push(...nextMatches);
        } else if (tournament.format === "swiss") {
          status = "complete";
        }
      }
    } else if (tournament.format === "triple-elim") {
      const round = finishedMatch.round;
      const sameRound = matches.filter((m) => m.round === round);
      if (sameRound.every((m) => m.winner != null)) {
        const next = generateTripleElimRound(
          tournament.teams,
          matches,
          round + 1,
          tournament.defaults,
          tournament.formatOverrides
        );
        if (next.length === 0) status = "complete";
        else matches.push(...next);
      }
    } else if (isTriplePlayoffsFormat(tournament.format) && finishedMatch.bracket !== void 0) {
      const playoffMatches = matches.filter((m) => m.bracket !== void 0);
      const round = finishedMatch.round;
      const sameRound = playoffMatches.filter((m) => m.round === round);
      if (sameRound.every((m) => m.winner != null)) {
        {
          const ids = /* @__PURE__ */ new Set();
          for (const m of playoffMatches) {
            if (m.blueTeamId) ids.add(m.blueTeamId);
            if (m.redTeamId) ids.add(m.redTeamId);
          }
          const teTeams = tournament.teams.filter((t) => ids.has(t.id));
          const next = generateTripleElimRound(
            teTeams,
            playoffMatches,
            round + 1,
            tournament.defaults,
            tournament.formatOverrides,
            "po:"
          );
          if (next.length === 0) status = "complete";
          else matches.push(...next);
        }
      }
    } else if (isDEPlayoffsContext && (finishedMatch.bracket === "grand-final" || finishedMatch.bracket === "grand-final-reset")) {
      if (finishedMatch.bracket === "grand-final-reset") {
        status = "complete";
      } else if (tournament.trueGrandFinal) {
        status = "complete";
      } else {
        const wSideTeamId = finishedMatch.blueTeamId;
        if (wSideTeamId && winner.teamId === wSideTeamId) {
          status = "complete";
        } else {
          const reset = {
            id: makeMatchId(),
            round: finishedMatch.round + 1,
            blueTeamId: finishedMatch.blueTeamId,
            redTeamId: finishedMatch.redTeamId,
            format: finishedMatch.format,
            fearless: finishedMatch.fearless,
            mode: finishedMatch.mode,
            aiSide: finishedMatch.aiSide,
            aiDifficulty: finishedMatch.aiDifficulty,
            series: null,
            winner: null,
            feedsInto: null,
            bracket: "grand-final-reset",
            losersFeedsInto: void 0
          };
          matches.push(reset);
        }
      }
    }
    let finalMatches = matches;
    if (tournament.format === "single-elim" && tournament.reseedBetweenRounds && finishedMatch.feedsInto) {
      const round = finishedMatch.round;
      const sameRound = matches.filter(
        (m) => m.round === round && m.bracket === void 0
      );
      const allDone = sameRound.every((m) => m.winner != null);
      if (allDone) {
        finalMatches = applySingleElimReseed(tournament, matches, round);
      }
    }
    return {
      ...tournament,
      matches: finalMatches,
      status,
      updatedAt: Date.now(),
      activeMatchId: null
    };
  }
  function applySingleElimReseed(tournament, matches, round) {
    const sameRound = matches.filter(
      (m) => m.round === round && m.bracket === void 0 && m.winner != null
    );
    if (sameRound.length === 0) return matches;
    const survivors = [];
    for (const m of sameRound) {
      const winId = m.winner.teamId;
      const team = tournament.teams.find((t) => t.id === winId);
      if (team) survivors.push(team);
    }
    survivors.sort((a, b) => a.seed - b.seed);
    const nextRound = matches.filter(
      (m) => m.round === round + 1 && m.bracket === void 0
    );
    if (nextRound.length === 0) return matches;
    if (survivors.length !== nextRound.length * 2) return matches;
    const updated = matches.map((m) => ({ ...m }));
    for (let i = 0; i < nextRound.length; i++) {
      const blueTeam = survivors[i];
      const redTeam = survivors[survivors.length - 1 - i];
      const targetIdx = updated.findIndex((m) => m.id === nextRound[i].id);
      if (targetIdx >= 0) {
        updated[targetIdx] = {
          ...updated[targetIdx],
          blueTeamId: blueTeam.id,
          redTeamId: redTeam.id
        };
      }
    }
    return updated;
  }
  function crossMatchFearlessLocked(tournament, matchId) {
    const out = /* @__PURE__ */ new Set();
    const cfg = tournament.fearlessConfig;
    if (!cfg.perTeam && !cfg.global) return out;
    const match = tournament.matches.find((m) => m.id === matchId);
    if (!match) return out;
    if (cfg.global) {
      for (const id of tournament.globalPickHistory) out.add(id);
    }
    if (cfg.perTeam) {
      if (match.blueTeamId) {
        for (const id of tournament.teamPickHistory[match.blueTeamId] ?? []) {
          out.add(id);
        }
      }
      if (match.redTeamId) {
        for (const id of tournament.teamPickHistory[match.redTeamId] ?? []) {
          out.add(id);
        }
      }
    }
    return out;
  }
  function appendMatchPicks(tournament, matchId, series) {
    const match = tournament.matches.find((m) => m.id === matchId);
    if (!match) return tournament;
    const teamPickHistory = { ...tournament.teamPickHistory };
    const globalPickHistory = [...tournament.globalPickHistory];
    for (const game of series.games) {
      if (match.blueTeamId) {
        const arr = teamPickHistory[match.blueTeamId] ?? [];
        const next = arr.slice();
        for (const id of game.bluePicks) {
          if (id != null && !next.includes(id)) next.push(id);
        }
        teamPickHistory[match.blueTeamId] = next;
      }
      if (match.redTeamId) {
        const arr = teamPickHistory[match.redTeamId] ?? [];
        const next = arr.slice();
        for (const id of game.redPicks) {
          if (id != null && !next.includes(id)) next.push(id);
        }
        teamPickHistory[match.redTeamId] = next;
      }
      for (const id of game.bluePicks) {
        if (id != null && !globalPickHistory.includes(id)) {
          globalPickHistory.push(id);
        }
      }
      for (const id of game.redPicks) {
        if (id != null && !globalPickHistory.includes(id)) {
          globalPickHistory.push(id);
        }
      }
    }
    return { ...tournament, teamPickHistory, globalPickHistory };
  }
  var RECENCY_DECAY = 0.8;
  function recencyWeightedWR(seq) {
    let weightSum = 0;
    let winSum = 0;
    for (let i = 0; i < seq.length; i++) {
      const w = Math.pow(RECENCY_DECAY, seq.length - 1 - i);
      weightSum += w;
      if (seq[i]) winSum += w;
    }
    return weightSum > 0 ? winSum / weightSum : 0;
  }
  function computeTournamentChampionWR(tournament) {
    const out = /* @__PURE__ */ new Map();
    function bumpGame(id, won) {
      const cur = out.get(id) ?? { games: 0, wins: 0, winRate: 0 };
      cur.games++;
      if (won) cur.wins++;
      cur.winRate = cur.wins / cur.games;
      out.set(id, cur);
    }
    for (const match of tournament.matches) {
      if (!match.series) continue;
      for (const game of match.series.games) {
        if (game.winner == null) continue;
        const blueWon = game.winner === "blue";
        for (const id of game.bluePicks) {
          if (id != null) bumpGame(id, blueWon);
        }
        for (const id of game.redPicks) {
          if (id != null) bumpGame(id, !blueWon);
        }
      }
    }
    return out;
  }
  function computeTeamChampionWR(tournament) {
    const out = /* @__PURE__ */ new Map();
    const seq = /* @__PURE__ */ new Map();
    function bump(team, id, won) {
      let byChamp = out.get(team);
      if (!byChamp) {
        byChamp = /* @__PURE__ */ new Map();
        out.set(team, byChamp);
      }
      const cur = byChamp.get(id) ?? { games: 0, wins: 0, winRate: 0 };
      cur.games++;
      if (won) cur.wins++;
      cur.winRate = cur.wins / cur.games;
      byChamp.set(id, cur);
      let s = seq.get(team);
      if (!s) seq.set(team, s = /* @__PURE__ */ new Map());
      const arr = s.get(id) ?? [];
      arr.push(won);
      s.set(id, arr);
    }
    for (const match of tournament.matches) {
      if (!match.series) continue;
      for (const game of match.series.games) {
        if (game.winner == null) continue;
        const blueWon = game.winner === "blue";
        for (const id of game.bluePicks) {
          if (id != null) bump(game.blueTeam, id, blueWon);
        }
        for (const id of game.redPicks) {
          if (id != null) bump(game.redTeam, id, !blueWon);
        }
      }
    }
    for (const [team, byChamp] of out) {
      const s = seq.get(team);
      for (const [id, entry] of byChamp) {
        const arr = s?.get(id);
        if (arr) entry.recentWinRate = recencyWeightedWR(arr);
      }
    }
    return out;
  }

  // lib/sim/autoPlayMatch.ts
  function allChampionIds(champs) {
    return champs.map((c) => c.id);
  }
  function buildPriorGamesForTeam(series, teamName2, opponentName) {
    const result = [];
    const completedGames = series.games.slice(0, -1);
    for (const game of completedGames) {
      if (game.winner == null) continue;
      const teamIsBlue = game.blueTeam === teamName2;
      const teamSide = teamIsBlue ? "blue" : "red";
      const won = game.winner === teamSide;
      const strategy = teamIsBlue ? game.blueStrategy : game.redStrategy;
      const oppStrategy = teamIsBlue ? game.redStrategy : game.blueStrategy;
      if (!strategy) continue;
      const goldTimeline = game.recap?.goldLeadTimeline;
      const finalGoldBlue = goldTimeline?.at(-1)?.goldLead ?? null;
      const goldDiff = finalGoldBlue != null ? teamIsBlue ? finalGoldBlue : -finalGoldBlue : void 0;
      const stomp = goldDiff != null ? Math.abs(goldDiff) >= 7e3 : void 0;
      result.push({
        strategy,
        won,
        goldDiff: goldDiff ?? void 0,
        stomp,
        durationMinutes: game.recap?.durationMinutes,
        opponentStrategy: oppStrategy,
        opponentName
      });
    }
    return result;
  }
  function autoPlayMatch(workingTournament, matchId, champions, playerForms = {}) {
    const match = workingTournament.matches.find((m) => m.id === matchId);
    if (!match) return [workingTournament, playerForms];
    if (match.winner) return [workingTournament, playerForms];
    if (match.blueTeamId == null || match.redTeamId == null) {
      return [workingTournament, playerForms];
    }
    const blueTeam = workingTournament.teams.find((t) => t.id === match.blueTeamId);
    const redTeam = workingTournament.teams.find((t) => t.id === match.redTeamId);
    if (!blueTeam || !redTeam) return [workingTournament, playerForms];
    const allIds = allChampionIds(champions);
    const tctx = tournamentSeriesContext(workingTournament, matchId);
    let series = createSeries({
      format: match.format,
      fearless: match.fearless,
      timerEnabled: false,
      blueTeam: blueTeam.name,
      redTeam: redTeam.name,
      mode: "aivai",
      aiSide: null,
      aiDifficulty: match.aiDifficulty,
      blueAiDifficulty: blueTeam.aiDifficulty,
      redAiDifficulty: redTeam.aiDifficulty,
      blueStarRating: tctx?.blueStarRating ?? teamStarRating(blueTeam),
      redStarRating: tctx?.redStarRating ?? teamStarRating(redTeam),
      blueWinStreak: tctx?.blueWinStreak,
      redWinStreak: tctx?.redWinStreak,
      tournamentRound: tctx?.roundDepth,
      blueForm: tctx?.blueForm,
      redForm: tctx?.redForm,
      blueClutch: tctx?.blueClutch,
      redClutch: tctx?.redClutch,
      variancePreset: tctx?.variancePreset,
      bluePlayers: blueTeam.players,
      redPlayers: redTeam.players,
      bluePersonalityId: blueTeam.personalityId,
      redPersonalityId: redTeam.personalityId,
      sideRule: workingTournament.sideRule
    });
    let currentForms = playerForms;
    while (series.status !== "complete") {
      const crossLocked = crossMatchFearlessLocked(workingTournament, matchId);
      const perSeriesLocked = fearlessLockedSet(series);
      const locked = /* @__PURE__ */ new Set([...perSeriesLocked, ...crossLocked]);
      const tournamentWR = computeTournamentChampionWR(workingTournament);
      const teamWR = computeTeamChampionWR(workingTournament);
      let game = currentGame(series);
      while (currentAction(game)) {
        const action = currentAction(game);
        const personality = getPersonality(
          action.side === "blue" ? series.bluePersonalityId : series.redPersonalityId
        );
        const championId = chooseAIAction(
          game,
          champions,
          locked,
          seriesAIContextFrom(
            series,
            action.side,
            champions,
            tournamentWR,
            {
              map: currentForms,
              keyFor: (n2) => workingTournament.teams.find((t) => t.name === n2)?.id ?? n2
            },
            teamWR
          ),
          Math.random,
          personality
        );
        if (championId == null) {
          game = applyTimeout(game, allIds, locked);
        } else {
          game = applyLock(game, championId);
          locked.add(championId);
        }
      }
      game = finalizeRoles(game, champions, series);
      {
        const byId = new Map(champions.map((c) => [c.id, c]));
        const toChamps = (ids) => ids.map((id) => id != null ? byId.get(id) ?? null : null);
        const blueChamps = toChamps(game.bluePicks);
        const redChamps = toChamps(game.redPicks);
        const wins2 = winsByTeamName(series);
        const blueWins2 = wins2.get(game.blueTeam) ?? 0;
        const redWins2 = wins2.get(game.redTeam) ?? 0;
        const gamesToWin = requiredWins(series.format);
        const bluePrior = buildPriorGamesForTeam(series, game.blueTeam, game.redTeam);
        const redPrior = buildPriorGamesForTeam(series, game.redTeam, game.blueTeam);
        game = {
          ...game,
          blueStrategy: chooseAIStrategyForGame({
            picks: blueChamps,
            context: {
              enemyPicks: redChamps,
              roster: series.bluePlayers,
              enemyRoster: series.redPlayers,
              selfWins: blueWins2,
              oppWins: redWins2,
              gamesToWin,
              rng: Math.random
            },
            priorGames: bluePrior,
            opponentName: game.redTeam,
            rng: Math.random
          }),
          redStrategy: chooseAIStrategyForGame({
            picks: redChamps,
            context: {
              enemyPicks: blueChamps,
              roster: series.redPlayers,
              enemyRoster: series.bluePlayers,
              selfWins: redWins2,
              oppWins: blueWins2,
              gamesToWin,
              rng: Math.random
            },
            priorGames: redPrior,
            opponentName: game.blueTeam,
            rng: Math.random
          })
        };
      }
      series = {
        ...series,
        games: [...series.games.slice(0, -1), game]
      };
      const blueKey = blueTeam.id;
      const redKey = redTeam.id;
      const result = simulateMatch(game, champions, {
        scoreBias: starRatingBias(series),
        bluePlayers: series.bluePlayers,
        redPlayers: series.redPlayers,
        playerForms: {
          blue: sideFormsFor(currentForms, blueKey),
          red: sideFormsFor(currentForms, redKey)
        },
        adaptiveMidgame: true
      });
      const recap = buildGameRecap(
        game,
        champions,
        result,
        series.bluePlayers,
        series.redPlayers
      );
      if (recap.ratings) {
        currentForms = applyRatingsToForms(currentForms, blueKey, recap.ratings.blue);
        currentForms = applyRatingsToForms(currentForms, redKey, recap.ratings.red);
      } else {
        const derived = computeGameRatings(recap, result.winner);
        if (derived) {
          currentForms = applyRatingsToForms(currentForms, blueKey, derived.blue);
          currentForms = applyRatingsToForms(currentForms, redKey, derived.red);
        }
      }
      series = recordWinner(series, result.winner, recap);
      if (series.status === "between-games") {
        const rule = effectiveSideRule(series);
        if (rule === "loser-picks") {
          const chooser = series.sideChooser;
          if (chooser) {
            const chooserTeam = chooser === blueTeam.name ? blueTeam : redTeam;
            const teamPicks = [];
            for (const g of series.games) {
              const picksArr = g.blueTeam === chooser ? g.bluePicks : g.redPicks;
              for (const id of picksArr) if (id != null) teamPicks.push(id);
            }
            const chosenSide = chooseSideAI(
              { players: chooserTeam.players, pickHistory: teamPicks },
              Math.random
            );
            series = applySideChoice(series, chosenSide);
          }
        } else {
          const sides = nextGameSides(series);
          if (sides) {
            series = startNextGame(series, sides.blueTeam, sides.redTeam);
          } else {
            const lastGame = series.games[series.games.length - 1];
            const swap = lastGame?.winner === "blue";
            const newBlue = swap ? series.redTeam : series.blueTeam;
            const newRed = swap ? series.blueTeam : series.redTeam;
            series = startNextGame(series, newBlue, newRed);
          }
        }
      }
    }
    const wins = winsByTeamName(series);
    const blueWins = wins.get(blueTeam.name) ?? 0;
    const redWins = wins.get(redTeam.name) ?? 0;
    const winningTeamId = (() => {
      if (series.winner) {
        const winningName = series.winner === "blue" ? series.blueTeam : series.redTeam;
        if (winningName === blueTeam.name) return blueTeam.id;
        if (winningName === redTeam.name) return redTeam.id;
      }
      return blueWins > redWins ? blueTeam.id : redTeam.id;
    })();
    const matchesWithSeries = workingTournament.matches.map(
      (m) => m.id === matchId ? { ...m, series } : m
    );
    const tournamentWithSeries = {
      ...workingTournament,
      matches: matchesWithSeries
    };
    const withPicks = appendMatchPicks(tournamentWithSeries, matchId, series);
    const finalTournament = recordMatchWinner(withPicks, matchId, {
      teamId: winningTeamId,
      blueWins,
      redWins
    });
    return [finalTournament, currentForms];
  }

  // lib/sim/bulkSim.worker.ts
  var _neuralReady = null;
  function ensureNeuralReady(champions) {
    if (!_neuralReady) {
      _neuralReady = isNeuralPolicyDisabled() ? Promise.resolve() : initNeuralDraftPolicyAsync(champions).then(() => void 0);
    }
    return _neuralReady;
  }
  self.onmessage = async (event) => {
    const msg = event.data;
    if (msg.type !== "autoPlayMatch") return;
    try {
      await ensureNeuralReady(msg.champions);
      const [tournament, playerForms] = autoPlayMatch(
        msg.tournament,
        msg.matchId,
        msg.champions,
        msg.playerForms
      );
      const out = {
        id: msg.id,
        tournament,
        playerForms
      };
      self.postMessage(out);
    } catch (err) {
      const out = {
        id: msg.id,
        error: err instanceof Error ? err.message : "Bulk sim failed"
      };
      self.postMessage(out);
    }
  };
})();
