//services/dashboardService.js
function buildFamilyStats(clans = []) {
    const totalMembers = clans.reduce(
        (sum, clan) => sum + (clan.clanInfo.members || 0),
        0
    );

    const totalTrophies = clans.reduce(
        (sum, clan) => sum + (clan.clanInfo.clanPoints || 0),
        0
    );

    const totalWins = clans.reduce(
        (sum, clan) => sum + (clan.clanInfo.warWins || 0),
        0
    );

    const totalWars = clans.reduce(
        (sum, clan) => sum + (clan.clanInfo.totalWars || 0),
        0
    );

    const familyWinRate =
        totalWars > 0
            ? ((totalWins / totalWars) * 100).toFixed(1)
            : "0.0";

    return {
        totalMembers,
        totalTrophies,
        familyWinRate
    };
}

function buildActiveWarStats(currentWars = []) {
    const activeStates = ["preparation", "inWar"];

    const activeWars = currentWars.filter(
        war => activeStates.includes(war?.state)
    );

    return {
        activeWarCount: activeWars.length,
        totalClanCount: currentWars.length,
        activeWarDisplay: `${activeWars.length}/${currentWars.length}`
    };
}

function buildActiveCwlStats(cwlGroups = []) {
    const activeStates = ["preparation", "inWar"];

    const activeCwlGroups = cwlGroups.filter(group =>
        activeStates.includes(group?.state)
    );

    return {
        activeCwlCount: activeCwlGroups.length,
        totalClanCount: cwlGroups.length,
        activeCwlDisplay: `${activeCwlGroups.length}/${cwlGroups.length}`
    };
}

module.exports = {
    buildFamilyStats,
    buildActiveWarStats,
    buildActiveCwlStats
  };