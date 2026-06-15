// scripts/testClashKingWars.js
require("dotenv").config();

const clans = require("../config/clans");
const { getPreviousWars } = require("../services/clashKingApi");
const {
    mapWarsToAttackRows,
    summarizeWarPlayerStats,
    combinePlayerStats
} = require("../services/warService");

async function main() {
    try {
        for (const clan of clans) {
            console.log("\n==============================");
            console.log(`Previous wars for ${clan.key} - ${clan.tag}`);
            console.log("==============================\n");

            const data = await getPreviousWars(clan.tag, 10);

            const regularWars = data.items.filter(
                war => war.attacksPerMember === 2
            );

            const attackRows = mapWarsToAttackRows(
                regularWars,
                clan.tag,
                clan.key
            );

            console.table(
                attackRows.map(row => ({
                    player: row.attackerName,
                    playerTH: row.attackerTownhallLevel,
                    defender: row.defenderName,
                    defenderTH: row.defenderTownhallLevel,
                    stars: row.stars,
                    destruction: row.destructionPercentage,
                    thDiff: row.townhallDifference,
                    mapDiff: row.mapPositionDifference
                }))
            );

            const perWarPlayerStats = regularWars.flatMap(war =>
                summarizeWarPlayerStats(war, clan.tag, clan.key)
            );
            
            const combinedPlayerStats = combinePlayerStats(perWarPlayerStats);
            
            console.table(
                combinedPlayerStats.map(player => ({
                    player: player.playerName,
                    th: player.townhallLevel,
                    wars: player.warsParticipated,
                    possibleAttacks: player.possibleAttacks,
                    attacksUsed: player.attacksUsed,
                    missed: player.missedAttacks,
                    usage: `${player.attackUsagePct}%`,
                    stars: player.totalStars,
                    avgStars: player.avgStars,
                    totalDest: player.totalDestruction,
                    avgDest: player.avgDestruction,
                    threeStars: player.threeStars,
                    twoStars: player.twoStars,
                    oneStars: player.oneStars,
                    zeroStars: player.zeroStars,
                    avgThDiff: player.avgThDifference
                }))
            );
        }
    } catch (error) {
        console.error("Clash King war test failed.");

        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
        } else {
            console.error(error.message);
        }

        process.exit(1);
    }
}

main();