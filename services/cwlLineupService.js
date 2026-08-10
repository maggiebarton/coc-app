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

function getScoreComponents(player, minTh, maxTh, activityTarget = 5) {
    const possibleAttacks = player.possibleAttacks ?? (player.warsParticipated * 2);
    const thLevelScore = normalize(player.townHallLevel || 0, minTh, maxTh);
    const activityScore = clamp(
        safeDivide(player.warsParticipated, activityTarget),
        0,
        1
    );
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
    // Lineups should reward proven offense and reliability more than the defensive
    // value of a single Town Hall level. In particular, a strong, dependable TH17
    // should be able to rank ahead of an underperforming TH18.
    const mainScore =
        (0.05 * components.thLevelScore) +
        (0.15 * components.activityScore) +
        (0.20 * components.attackUsageRate) +
        (0.30 * components.avgStarsScore) +
        (0.15 * components.avgDestructionScore) +
        (0.10 * components.missPenalty) +
        (0.05 * components.thDistanceScore);

    const noThDifficultyScore =
        (0.05 * components.thLevelScore) +
        (0.15 * components.activityScore) +
        (0.20 * components.attackUsageRate) +
        (0.325 * components.avgStarsScore) +
        (0.175 * components.avgDestructionScore) +
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

function buildScoredPlayers(
    clansWithMembers = [],
    combinedWarStats = [],
    activityTarget = 5
) {
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
                possibleAttacks: warStats.possibleAttacks ?? (
                    (warStats.warsParticipated || 0) * 2
                ),
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
            const componentScores = getScoreComponents(
                player,
                minTh,
                maxTh,
                activityTarget
            );
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

function buildClanTargets(clans = [], formats = {}, rosterSizes = {}) {
    return clans
        .map(clan => {
            const customTarget = Number.parseInt(rosterSizes[clan.key], 10);

            return {
                key: clan.key,
                name: clan.name,
                leagueName: clan.clanInfo?.warLeague?.name || "Unranked",
                leagueRank: getCwlLeagueRank(clan.clanInfo?.warLeague?.name),
                format: String(formats[clan.key] || "15") === "30" ? "30" : "15",
                targetSize: Number.isInteger(customTarget) && customTarget >= 1
                    ? customTarget
                    : getRosterTarget(formats[clan.key] || "15"),
                customTargetSize: Number.isInteger(customTarget) && customTarget >= 1
                    ? customTarget
                    : null,
                members: []
            };
        })
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

function getAssignmentMap(players = [], clanTargets = []) {
    const assignments = assignPlayersToCwlClans(
        players,
        clanTargets.map(clan => ({ ...clan, members: [] }))
    );

    return new Map(
        assignments.players.map(player => [player.tag, player.assignedCwlClan])
    );
}

function getModeConfidence(player, targetWars) {
    return clamp(safeDivide(player.warsParticipated, targetWars), 0, 1);
}

function buildConsensusPlayers(regularPlayers, cwlPlayers, regularAssignments, cwlAssignments) {
    const cwlByTag = new Map(cwlPlayers.map(player => [player.tag, player]));

    return regularPlayers.map(regularPlayer => {
        const cwlPlayer = cwlByTag.get(regularPlayer.tag);
        const hasRegularData = regularPlayer.warsParticipated > 0;
        const hasCwlData = cwlPlayer?.warsParticipated > 0;
        const regularConfidence = hasRegularData
            ? getModeConfidence(regularPlayer, 5)
            : 0;
        const cwlConfidence = hasCwlData
            ? getModeConfidence(cwlPlayer, 3)
            : 0;
        const totalConfidence = regularConfidence + cwlConfidence;
        const mainScore = totalConfidence > 0
            ? (
                (regularPlayer.mainScore * regularConfidence) +
                (cwlPlayer.mainScore * cwlConfidence)
            ) / totalConfidence
            : regularPlayer.mainScore;
        const regularClan = regularAssignments.get(regularPlayer.tag);
        const cwlClan = hasCwlData ? cwlAssignments.get(regularPlayer.tag) : null;
        const lineupAgreement = Boolean(cwlClan && regularClan === cwlClan);

        return {
            ...regularPlayer,
            mainScore,
            regularRank: regularPlayer.rank,
            regularMainScore: regularPlayer.mainScore,
            regularWarsParticipated: regularPlayer.warsParticipated,
            regularAttacksUsed: regularPlayer.numberOfAttacks,
            cwlRank: hasCwlData ? cwlPlayer.rank : null,
            cwlMainScore: hasCwlData ? cwlPlayer.mainScore : null,
            cwlWarsParticipated: cwlPlayer?.warsParticipated || 0,
            cwlAttacksUsed: cwlPlayer?.numberOfAttacks || 0,
            cwlAvgStars: hasCwlData ? cwlPlayer.avgStars : null,
            cwlAvgDestructionPercent: hasCwlData
                ? cwlPlayer.avgDestructionPercent
                : null,
            cwlMissedAttacks: hasCwlData ? cwlPlayer.missedAttacks : null,
            cwlAvgThDistance: hasCwlData ? cwlPlayer.avgThDistance : null,
            regularProposedClan: regularClan,
            cwlProposedClan: cwlClan,
            lineupAgreement,
            assignmentReason: lineupAgreement
                ? "Regular and CWL lineups agree"
                : hasCwlData
                    ? "Blended regular and CWL ranking"
                    : "Regular wars (no recent CWL sample)"
        };
    }).sort(comparePlayers).map((player, index) => ({
        ...player,
        rank: index + 1,
        assignedCwlClan: null
    }));
}

function assignConsensusPlayers(players, clanTargets) {
    const assignedTags = new Set();
    const clanByName = new Map(clanTargets.map(clan => [clan.name, clan]));

    for (const player of players) {
        if (!player.lineupAgreement) continue;

        const clan = clanByName.get(player.regularProposedClan);

        if (!clan || clan.members.length >= clan.targetSize) continue;

        player.assignedCwlClan = clan.name;
        clan.members.push(player);
        assignedTags.add(player.tag);
    }

    const remainingPlayers = players.filter(player => !assignedTags.has(player.tag));
    let playerIndex = 0;
    const leagueGroups = [];

    for (const clan of clanTargets) {
        const lastGroup = leagueGroups[leagueGroups.length - 1];

        if (lastGroup && lastGroup[0].leagueRank === clan.leagueRank) {
            lastGroup.push(clan);
        } else {
            leagueGroups.push([clan]);
        }
    }

    for (const group of leagueGroups) {
        let groupHasRoom = true;

        while (playerIndex < remainingPlayers.length && groupHasRoom) {
            groupHasRoom = false;

            for (const clan of group) {
                if (playerIndex >= remainingPlayers.length) break;
                if (clan.members.length >= clan.targetSize) continue;

                const player = remainingPlayers[playerIndex++];
                player.assignedCwlClan = clan.name;
                clan.members.push(player);
                groupHasRoom = true;
            }
        }
    }

    return { players, clans: clanTargets };
}

function applyLineupOverrides(assignments, overrides = {}) {
    const clans = assignments.clans.map(clan => ({ ...clan, members: [] }));
    const clanByKey = new Map(clans.map(clan => [clan.key, clan]));
    const automaticPlayers = [];
    const hasActiveOverrides = assignments.players.some(player => {
        const override = overrides[player.tag?.toUpperCase()];
        return override === "removed" || clanByKey.has(override);
    });

    if (!hasActiveOverrides) {
        return {
            clans: assignments.clans,
            players: assignments.players.map(player => ({
                ...player,
                modelAssignedCwlClan: player.assignedCwlClan,
                lineupOverride: null
            }))
        };
    }

    for (const player of assignments.players) {
        const normalizedTag = player.tag?.toUpperCase();
        const override = overrides[normalizedTag] || null;
        const modelAssignedCwlClan = player.assignedCwlClan;
        const updatedPlayer = {
            ...player,
            modelAssignedCwlClan,
            lineupOverride: override,
            assignedCwlClan: null
        };

        if (override === "removed") {
            updatedPlayer.assignmentReason = "Manually removed from CWL lineups";
            continue;
        }

        const forcedClan = clanByKey.get(override);

        if (forcedClan) {
            updatedPlayer.assignedCwlClan = forcedClan.name;
            updatedPlayer.assignmentReason = `Manually assigned to ${forcedClan.name}`;
            forcedClan.members.push(updatedPlayer);
            continue;
        }

        if (updatedPlayer.automaticExclusionReason) {
            updatedPlayer.assignmentReason = updatedPlayer.automaticExclusionReason;
            continue;
        }

        automaticPlayers.push(updatedPlayer);
    }

    let playerIndex = 0;
    const leagueGroups = [];

    for (const clan of clans) {
        const lastGroup = leagueGroups[leagueGroups.length - 1];

        if (lastGroup && lastGroup[0].leagueRank === clan.leagueRank) {
            lastGroup.push(clan);
        } else {
            leagueGroups.push([clan]);
        }
    }

    for (const group of leagueGroups) {
        let groupHasRoom = true;

        while (playerIndex < automaticPlayers.length && groupHasRoom) {
            groupHasRoom = false;

            for (const clan of group) {
                if (playerIndex >= automaticPlayers.length) break;
                if (clan.members.length >= clan.targetSize) continue;

                const player = automaticPlayers[playerIndex++];
                player.assignedCwlClan = clan.name;

                if (player.modelAssignedCwlClan !== clan.name) {
                    player.assignmentReason = "League-aware placement after manual overrides";
                }

                clan.members.push(player);
                groupHasRoom = true;
            }
        }
    }

    const playersByTag = new Map(
        clans.flatMap(clan => clan.members).map(player => [player.tag, player])
    );

    return {
        clans,
        players: assignments.players.map(original => {
            const assigned = playersByTag.get(original.tag);

            if (assigned) return assigned;

            const override = overrides[original.tag?.toUpperCase()] || null;

            return {
                ...original,
                modelAssignedCwlClan: original.assignedCwlClan,
                lineupOverride: override,
                assignedCwlClan: null,
                assignmentReason: override === "removed"
                    ? "Manually removed from CWL lineups"
                    : original.assignmentReason
            };
        })
    };
}

function addOverflowClan(assignments, overflowClan, requestedTargetSize = null) {
    if (!overflowClan) return assignments;

    const customTarget = Number.parseInt(requestedTargetSize, 10);
    const overflowTarget = {
        ...overflowClan,
        leagueName: "Overflow CWL clan",
        leagueRank: -1,
        format: null,
        targetSize: Number.isInteger(customTarget) && customTarget >= 1
            ? customTarget
            : 35,
        customTargetSize: Number.isInteger(customTarget) && customTarget >= 1
            ? customTarget
            : null,
        isOverflow: true,
        members: []
    };

    for (const player of assignments.players) {
        if (player.assignedCwlClan || player.automaticExclusionReason) continue;
        if (overflowTarget.members.length >= overflowTarget.targetSize) break;

        player.assignedCwlClan = overflowTarget.name;
        player.assignmentReason = "Assigned to the overflow CWL clan";
        overflowTarget.members.push(player);
    }

    return {
        players: assignments.players,
        clans: [...assignments.clans, overflowTarget]
    };
}

function buildCwlLineupHelper(
    clansWithMembers = [],
    regularWarStats = [],
    formats = {},
    cwlWarStats = [],
    overrides = {},
    overflowClan = null,
    options = {}
) {
    const clanTargets = buildClanTargets(
        clansWithMembers,
        formats,
        options.rosterSizes || {}
    );
    const regularPlayers = buildScoredPlayers(clansWithMembers, regularWarStats, 5);
    const cwlPlayers = buildScoredPlayers(clansWithMembers, cwlWarStats, 3);
    const regularAssignments = getAssignmentMap(regularPlayers, clanTargets);
    const cwlAssignments = getAssignmentMap(cwlPlayers, clanTargets);
    const consensusPlayers = buildConsensusPlayers(
        regularPlayers,
        cwlPlayers,
        regularAssignments,
        cwlAssignments
    );
    const eligiblePlayers = consensusPlayers.filter(player => {
        const hasMissedAttacks = player.missedAttacks > 0 ||
            (player.cwlMissedAttacks || 0) > 0;

        if (options.excludeMissedAttacks && hasMissedAttacks) {
            player.automaticExclusionReason =
                "Automatically excluded by the no-missed-attacks preset";
            player.assignmentReason = player.automaticExclusionReason;
            return false;
        }

        return true;
    });
    const consensusAssignments = assignConsensusPlayers(eligiblePlayers, clanTargets);
    consensusAssignments.players = consensusPlayers;
    const assignmentsWithOverflow = addOverflowClan(
        consensusAssignments,
        overflowClan,
        options.rosterSizes?.[overflowClan?.key]
    );
    const assignments = applyLineupOverrides(assignmentsWithOverflow, overrides);

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
