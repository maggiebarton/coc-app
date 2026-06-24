const CWL_LEAGUE_ORDER = [
    "Bronze III",
    "Bronze II",
    "Bronze I",
    "Silver III",
    "Silver II",
    "Silver I",
    "Gold III",
    "Gold II",
    "Gold I",
    "Crystal III",
    "Crystal II",
    "Crystal I",
    "Master III",
    "Master II",
    "Master I",
    "Champion III",
    "Champion II",
    "Champion I",
    "Titan III",
    "Titan II",
    "Titan I"
];

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function safeDivide(numerator, denominator, fallback = 0) {
    return denominator ? numerator / denominator : fallback;
}

function normalize(value, min, max) {
    if (max === min) return 1;

    return clamp((value - min) / (max - min), 0, 1);
}

function normalizeLeagueName(leagueName) {
    return (leagueName || "")
        .replace(/\s+League\s+/i, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getCwlLeagueRank(leagueName) {
    const normalizedLeagueName = normalizeLeagueName(leagueName);
    const index = CWL_LEAGUE_ORDER.findIndex(league => {
        return league.toLowerCase() === normalizedLeagueName.toLowerCase();
    });

    return index >= 0 ? index : -1;
}

function getRosterTarget(format) {
    return String(format) === "30" ? 35 : 20;
}

function getScoreComponents(player, minTh, maxTh) {
    const possibleAttacks = player.warsParticipated * 2;
    const thLevelScore = normalize(player.townHallLevel || 0, minTh, maxTh);
    const activityScore = clamp(safeDivide(player.warsParticipated, 5), 0, 1);
    const attackUsageRate = clamp(
        safeDivide(player.numberOfAttacks, possibleAttacks),
        0,
        1
    );
    const avgStarsScore = clamp(safeDivide(player.avgStars, 3), 0, 1);
    const avgDestructionScore = clamp(
        safeDivide(player.avgDestructionPercent, 100),
        0,
        1
    );
    const missPenalty = clamp(
        1 - safeDivide(player.missedAttacks, possibleAttacks),
        0,
        1
    );
    const thDistanceScore = player.townHallLevel >= 18
        ? player.avgThDistance >= 0
            ? 1
            : clamp(1 + (player.avgThDistance / 2), 0, 1)
        : clamp((player.avgThDistance + 2) / 4, 0, 1);

    return {
        thLevelScore,
        activityScore,
        attackUsageRate,
        avgStarsScore,
        avgDestructionScore,
        missPenalty,
        thDistanceScore
    };
}

function getFinalScores(components) {
    const mainScore =
        (0.20 * components.thLevelScore) +
        (0.15 * components.activityScore) +
        (0.20 * components.attackUsageRate) +
        (0.20 * components.avgStarsScore) +
        (0.10 * components.avgDestructionScore) +
        (0.10 * components.missPenalty) +
        (0.05 * components.thDistanceScore);

    const noThDifficultyScore =
        (0.20 * components.thLevelScore) +
        (0.15 * components.activityScore) +
        (0.20 * components.attackUsageRate) +
        (0.225 * components.avgStarsScore) +
        (0.125 * components.avgDestructionScore) +
        (0.10 * components.missPenalty);

    const offenseOnlyScore =
        (0.25 * components.activityScore) +
        (0.50 * components.avgStarsScore) +
        (0.25 * components.avgDestructionScore);

    return {
        mainScore,
        noThDifficultyScore,
        offenseOnlyScore
    };
}

function getPlayerSummary(player, components) {
    const strengths = [];
    const weaknesses = [];

    if (player.townHallLevel >= 17) strengths.push("high TH");
    if (components.activityScore >= 1) strengths.push("active");
    if (player.avgStars >= 2.4) strengths.push("strong stars");
    if (player.avgDestructionPercent >= 85) strengths.push("high destruction");
    if (player.missedAttacks === 0 && player.warsParticipated > 0) {
        strengths.push("no misses");
    }
    if (player.warsParticipated < 3) weaknesses.push("limited sample");
    if (player.missedAttacks > 0) weaknesses.push("missed attacks");
    if (player.avgStars < 2 && player.numberOfAttacks > 0) {
        weaknesses.push("low stars");
    }
    if (components.thDistanceScore < 0.5) weaknesses.push("tough TH matchups");

    return {
        strengths,
        weaknesses,
        summary: [
            strengths.length ? `Strengths: ${strengths.join(", ")}` : null,
            weaknesses.length ? `Watch: ${weaknesses.join(", ")}` : null
        ].filter(Boolean).join(". ") || "Needs more war data."
    };
}

function buildScoredPlayers(clansWithMembers = [], combinedWarStats = []) {
    const warStatsByTag = new Map(
        combinedWarStats.map(stats => [stats.playerTag, stats])
    );
    const rawPlayers = clansWithMembers.flatMap(clan => {
        return clan.members.map(member => {
            const warStats = warStatsByTag.get(member.tag) || {};

            return {
                name: member.name,
                tag: member.tag,
                townHallLevel: member.townHallLevel || warStats.townhallLevel || 0,
                warsParticipated: warStats.warsParticipated || 0,
                numberOfAttacks: warStats.attacksUsed || 0,
                avgStars: warStats.avgStars || 0,
                avgDestructionPercent: warStats.avgDestruction || 0,
                missedAttacks: warStats.missedAttacks || 0,
                avgThDistance: warStats.avgThDifference || 0,
                homeClan: clan.name,
                homeClanKey: clan.key,
                assignedCwlClan: null
            };
        });
    });
    const townHallLevels = rawPlayers.map(player => player.townHallLevel || 0);
    const minTh = Math.min(...townHallLevels);
    const maxTh = Math.max(...townHallLevels);

    return rawPlayers
        .map(player => {
            const componentScores = getScoreComponents(player, minTh, maxTh);
            const finalScores = getFinalScores(componentScores);
            const summary = getPlayerSummary(player, componentScores);

            return {
                ...player,
                componentScores,
                ...finalScores,
                strengths: summary.strengths,
                weaknesses: summary.weaknesses,
                summary: summary.summary
            };
        })
        .sort(comparePlayers)
        .map((player, index) => ({
            ...player,
            rank: index + 1
        }));
}

function comparePlayers(a, b) {
    return (
        b.mainScore - a.mainScore ||
        b.noThDifficultyScore - a.noThDifficultyScore ||
        b.offenseOnlyScore - a.offenseOnlyScore ||
        a.missedAttacks - b.missedAttacks ||
        b.warsParticipated - a.warsParticipated ||
        b.avgStars - a.avgStars ||
        b.avgDestructionPercent - a.avgDestructionPercent
    );
}

function buildClanTargets(clans = [], formats = {}) {
    return clans
        .map(clan => ({
            key: clan.key,
            name: clan.name,
            leagueName: clan.clanInfo?.warLeague?.name || "Unranked",
            leagueRank: getCwlLeagueRank(clan.clanInfo?.warLeague?.name),
            format: String(formats[clan.key] || "15") === "30" ? "30" : "15",
            targetSize: getRosterTarget(formats[clan.key] || "15"),
            members: []
        }))
        .sort((a, b) => {
            return (
                b.leagueRank - a.leagueRank ||
                a.name.localeCompare(b.name)
            );
        });
}

function assignPlayersToCwlClans(players = [], clanTargets = []) {
    const assignedPlayers = players.map(player => ({ ...player }));
    let playerIndex = 0;
    const groups = [];

    for (const clan of clanTargets) {
        const lastGroup = groups[groups.length - 1];

        if (lastGroup && lastGroup[0].leagueRank === clan.leagueRank) {
            lastGroup.push(clan);
        } else {
            groups.push([clan]);
        }
    }

    for (const group of groups) {
        let groupHasRoom = true;

        while (playerIndex < assignedPlayers.length && groupHasRoom) {
            groupHasRoom = false;

            for (const clan of group) {
                if (playerIndex >= assignedPlayers.length) break;
                if (clan.members.length >= clan.targetSize) continue;

                const player = assignedPlayers[playerIndex];

                player.assignedCwlClan = clan.name;
                clan.members.push(player);
                playerIndex += 1;
                groupHasRoom = true;
            }
        }
    }

    return {
        players: assignedPlayers,
        clans: clanTargets
    };
}

function buildCwlLineupHelper(clansWithMembers = [], combinedWarStats = [], formats = {}) {
    const scoredPlayers = buildScoredPlayers(clansWithMembers, combinedWarStats);
    const clanTargets = buildClanTargets(clansWithMembers, formats);
    const assignments = assignPlayersToCwlClans(scoredPlayers, clanTargets);

    return {
        players: assignments.players,
        clans: assignments.clans,
        unassignedPlayers: assignments.players.filter(player => !player.assignedCwlClan)
    };
}

function toDisplayPercent(score) {
    return `${(score * 100).toFixed(2)}%`;
}

module.exports = {
    buildCwlLineupHelper,
    clamp,
    safeDivide,
    normalize,
    toDisplayPercent
};
