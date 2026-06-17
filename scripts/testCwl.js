//scripts/testCwl.js
require("dotenv").config();

const clans = require("../config/clans");
const { getCwl } = require("../services/clashKingApi");
const { mapCwlToAttackRows } = require("../services/cwlService");

async function main() {
  const season = "2026-06";

  for (const clan of clans) {
    const cwlData = await getCwl(clan.tag, season);
    const attackRows = mapCwlToAttackRows(cwlData, clan.tag, clan.key);

    console.log(`\n${clan.name} - ${season}`);

    console.table(
      attackRows.map(row => ({
        player: row.attackerName,
        th: row.attackerTownhallLevel,
        opponent: row.opponentClanName,
        defender: row.defenderName,
        defenderTH: row.defenderTownhallLevel,
        stars: row.stars,
        destruction: row.destructionPercentage,
        thDiff: row.townhallDifference
      }))
    );
  }
}

main();