import { createSeason } from "./season/engine";
import { generateSeasonTeams } from "./season/teamGen";
import { LEAGUE_IDS,type SeasonConfig } from "./season/types";
export function makeAuditSeason(name = "Audit") {
  const config: SeasonConfig = {
    name, sharedLeagueConfig: true,
    leagueConfigs: Object.fromEntries(LEAGUE_IDS.map(id => [id, {
      format: "round-robin-playoffs", playoffTeams: 4, regularSeries: "bo1", playoffSeries: "bo5",
    }])) as SeasonConfig["leagueConfigs"],
    liveMeta: false, patchShift: false, fearless: false, aiDifficulty: "normal", controlledTeamId: null,
  };
  const season = createSeason({
    config, teams: generateSeasonTeams([]),
    activeMeta: { metaOverride: null, metaEnabled: true, synergyOverride: null, counterOverride: null },
  });
  return { ...season, franchise: { id: name, name, year: 1, aging: true } };
}
