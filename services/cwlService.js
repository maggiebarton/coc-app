//services/cwlService.js
function normalizeTag(tag) {
    return tag?.replace("#", "").toUpperCase();
}

function formatSeasonMonth(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");

    return `${year}-${month}`;
}

function getRecentCwlSeasonCandidates(referenceDate = new Date(), count = 4) {
    const candidates = [];
    const start = new Date(Date.UTC(
        referenceDate.getUTCFullYear(),
        referenceDate.getUTCMonth(),
        16
    ));

    for (let offset = 0; offset > -count; offset -= 1) {
        const seasonDate = new Date(Date.UTC(
            start.getUTCFullYear(),
            start.getUTCMonth() + offset,
            16
        ));

        const season = formatSeasonMonth(seasonDate);

        if (season === "2026-06") {
            candidates.push("2026-06-16");
        }

        candidates.push(season);
    }

    return candidates;
}

function isValidCwlSeason(season) {
    return /^\d{4}-\d{2}(-16)?$/.test(season || "");
}

function formatSeasonLabel(season) {
    if (!season) return "";

    const [year, month, day] = season.split("-");
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    const label = date.toLocaleString("en-US", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC"
    });

    return day ? `${label} #2` : label;
}

const CWL_LEAGUE_LADDER = [
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

function normalizeLeagueName(leagueName) {
    return (leagueName || "")
        .replace(/\s+League\s+/i, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getLeagueIndex(leagueName) {
    const normalizedLeagueName = normalizeLeagueName(leagueName);

    return CWL_LEAGUE_LADDER.findIndex(league => {
        return league.toLowerCase() === normalizedLeagueName.toLowerCase();
    });
}

function getPromotionCountForLeagueIndex(leagueIndex) {
    const league = CWL_LEAGUE_LADDER[leagueIndex] || "";
    const family = league.split(" ")[0];

    return ["Champion", "Titan"].includes(family) ? 1 : 2;
}

function getPreviousLeagueIndex(currentLeagueIndex, place, groupSize = 8) {
    const lowerLeagueIndex = currentLeagueIndex - 1;
    const higherLeagueIndex = currentLeagueIndex + 1;

    if (
        lowerLeagueIndex >= 0 &&
        place <= getPromotionCountForLeagueIndex(lowerLeagueIndex)
    ) {
        return lowerLeagueIndex;
    }

    if (
        higherLeagueIndex < CWL_LEAGUE_LADDER.length &&
        place > Math.max(groupSize - 2, 0)
    ) {
        return higherLeagueIndex;
    }

    return currentLeagueIndex;
}

function getLeagueTransition(previousLeagueIndex, currentLeagueIndex) {
    if (currentLeagueIndex > previousLeagueIndex) {
        return "Promoted";
    }

    if (currentLeagueIndex < previousLeagueIndex) {
        return "Demoted";
    }

    return "Stayed";
}

function getCwlWarSides(war, clanTag) {
    const targetTag = normalizeTag(clanTag);
    const clanTagA = normalizeTag(war.clan?.tag);
    const clanTagB = normalizeTag(war.opponent?.tag);

    if (clanTagA === targetTag) {
        return {
            clanSide: war.clan,
            opponentSide: war.opponent
        };
    }

    if (clanTagB === targetTag) {
        return {
            clanSide: war.opponent,
            opponentSide: war.clan
        };
    }

    return null;
}

function createMemberLookup(members = []) {
    return new Map(members.map(member => [member.tag, member]));
}

function getAttacksUsed(members = []) {
    return members.reduce(
        (total, member) => total + (member.attacks?.length || 0),
        0
    );
}

function sumAttackValue(members = [], property) {
    return members.reduce((total, member) => {
        return total + (member.attacks || []).reduce(
            (attackTotal, attack) => attackTotal + (attack[property] || 0),
            0
        );
    }, 0);
}

function getSideStars(side) {
    return side?.stars ?? sumAttackValue(side?.members || [], "stars");
}

function getSideDestruction(side) {
    return side?.destructionPercentage ?? 0;
}

function getWarResult(clanStars, clanDestruction, opponentStars, opponentDestruction, warState) {
    if (warState !== "warEnded") {
        return "Pending";
    }

    if (
        clanStars > opponentStars ||
        (clanStars === opponentStars && clanDestruction > opponentDestruction)
    ) {
        return "Win";
    }

    if (
        clanStars < opponentStars ||
        (clanStars === opponentStars && clanDestruction < opponentDestruction)
    ) {
        return "Loss";
    }

    return "Tie";
}

function normalizeWarState(state) {
    switch (state) {
        case "preparation":
            return "Prep";

        case "inWar":
            return "In War";

        case "warEnded":
            return "Ended";

        default:
            return state || "Unknown";
    }
}

function mapClanCwlRounds(cwlData, clanTag) {
    return (cwlData.rounds || []).map((round, index) => {
        const wars = round.warTags || round.wars || [];
        const war = wars.find(candidate => {
            return typeof candidate === "object" && getCwlWarSides(candidate, clanTag);
        });

        if (!war) {
            return {
                round: index + 1,
                hasWar: false,
                state: "Unknown",
                result: "Pending",
                opponentClanName: "TBD",
                clanStars: 0,
                opponentStars: 0,
                clanDestruction: 0,
                opponentDestruction: 0,
                attacksUsed: 0,
                possibleAttacks: 0,
                missedAttacks: 0
            };
        }

        const { clanSide, opponentSide } = getCwlWarSides(war, clanTag);
        const possibleAttacks = clanSide?.members?.length || 0;
        const attacksUsed = getAttacksUsed(clanSide?.members || []);
        const missedAttacks = war.state === "warEnded"
            ? Math.max(possibleAttacks - attacksUsed, 0)
            : 0;
        const clanStars = getSideStars(clanSide);
        const opponentStars = getSideStars(opponentSide);
        const clanDestruction = getSideDestruction(clanSide);
        const opponentDestruction = getSideDestruction(opponentSide);

        return {
            round: index + 1,
            hasWar: true,
            state: normalizeWarState(war.state),
            rawState: war.state,
            result: getWarResult(
                clanStars,
                clanDestruction,
                opponentStars,
                opponentDestruction,
                war.state
            ),
            warTag: war.tag,
            startTime: war.startTime,
            endTime: war.endTime,
            teamSize: war.teamSize,
            attacksPerMember: war.attacksPerMember,
            opponentClanName: opponentSide?.name || "Unknown",
            opponentClanTag: opponentSide?.tag,
            clanStars,
            opponentStars,
            clanDestruction,
            opponentDestruction,
            attacksUsed,
            possibleAttacks,
            missedAttacks
        };
    });
}

function getCwlWars(cwlData) {
    return (cwlData.rounds || []).flatMap(round => {
        return (round.warTags || round.wars || []).filter(war => {
            return typeof war === "object";
        });
    });
}

function createStandingRow(clan) {
    return {
        clanTag: clan.tag,
        clanName: clan.name,
        wins: 0,
        losses: 0,
        ties: 0,
        stars: 0,
        bonusStars: 0,
        cwlStars: 0,
        destructionTotal: 0,
        destructionWars: 0,
        attacksUsed: 0,
        possibleAttacks: 0,
        missedAttacks: 0
    };
}

function addWarToStanding(standing, side, opponentSide, war) {
    const sideStars = getSideStars(side);
    const opponentStars = getSideStars(opponentSide);
    const sideDestruction = getSideDestruction(side);
    const opponentDestruction = getSideDestruction(opponentSide);
    const result = getWarResult(
        sideStars,
        sideDestruction,
        opponentStars,
        opponentDestruction,
        war.state
    );
    const attacksUsed = getAttacksUsed(side?.members || []);
    const possibleAttacks = side?.members?.length || 0;

    standing.stars += sideStars;
    standing.cwlStars += sideStars;
    standing.attacksUsed += attacksUsed;
    standing.possibleAttacks += possibleAttacks;

    if (war.state === "warEnded") {
        standing.destructionTotal += sideDestruction;
        standing.destructionWars += 1;
        standing.missedAttacks += Math.max(possibleAttacks - attacksUsed, 0);

        if (result === "Win") {
            standing.wins += 1;
            standing.bonusStars += 10;
            standing.cwlStars += 10;
        } else if (result === "Loss") {
            standing.losses += 1;
        } else if (result === "Tie") {
            standing.ties += 1;
        }
    }
}

function buildCwlStandings(cwlData, clanTag) {
    const standingsByTag = new Map();

    for (const war of getCwlWars(cwlData)) {
        for (const [side, opponentSide] of [
            [war.clan, war.opponent],
            [war.opponent, war.clan]
        ]) {
            if (!side?.tag) continue;

            const normalizedTag = normalizeTag(side.tag);

            if (!standingsByTag.has(normalizedTag)) {
                standingsByTag.set(normalizedTag, createStandingRow(side));
            }

            addWarToStanding(
                standingsByTag.get(normalizedTag),
                side,
                opponentSide,
                war
            );
        }
    }

    const targetTag = normalizeTag(clanTag);

    return [...standingsByTag.values()]
        .map(standing => ({
            ...standing,
            averageDestruction: standing.destructionWars > 0
                ? (standing.destructionTotal / standing.destructionWars).toFixed(1)
                : "0.0",
            isCurrentClan: normalizeTag(standing.clanTag) === targetTag
        }))
        .sort((a, b) => {
            return (
                b.cwlStars - a.cwlStars ||
                parseFloat(b.averageDestruction) - parseFloat(a.averageDestruction) ||
                b.stars - a.stars ||
                a.clanName.localeCompare(b.clanName)
            );
        })
        .map((standing, index) => ({
            ...standing,
            place: index + 1
        }));
}

function buildClanCwlSummary(cwlData, clanTag) {
    if (!cwlData) {
        return null;
    }

    const rounds = mapClanCwlRounds(cwlData, clanTag);
    const standings = buildCwlStandings(cwlData, clanTag);
    const currentClanStanding = standings.find(standing => standing.isCurrentClan) || null;
    const playedRounds = rounds.filter(round => round.hasWar);
    const endedRounds = playedRounds.filter(round => round.rawState === "warEnded");
    const totalDestruction = playedRounds.reduce(
        (sum, round) => sum + (round.clanDestruction || 0),
        0
    );

    return {
        season: cwlData.season,
        state: cwlData.state || null,
        rounds,
        standings,
        currentClanStanding,
        groupSize: standings.length,
        overview: {
            roundsPlayed: playedRounds.length,
            completedRounds: endedRounds.length,
            wins: endedRounds.filter(round => round.result === "Win").length,
            losses: endedRounds.filter(round => round.result === "Loss").length,
            ties: endedRounds.filter(round => round.result === "Tie").length,
            stars: playedRounds.reduce((sum, round) => sum + round.clanStars, 0),
            attacksUsed: playedRounds.reduce((sum, round) => sum + round.attacksUsed, 0),
            possibleAttacks: playedRounds.reduce((sum, round) => sum + round.possibleAttacks, 0),
            missedAttacks: playedRounds.reduce((sum, round) => sum + round.missedAttacks, 0),
            averageDestruction: playedRounds.length > 0
                ? (totalDestruction / playedRounds.length).toFixed(1)
                : "0.0"
        }
    };
}

function buildCwlHistory(seasonSummaries = [], leagueHistory = null) {
    const promotedSeasonSet = new Set(
        (leagueHistory?.points || [])
            .filter(point => point.transition === "Promoted")
            .map(point => point.season)
    );
    const history = seasonSummaries
        .filter(summary => summary?.currentClanStanding)
        .map(summary => ({
            season: summary.season,
            label: formatSeasonLabel(summary.season),
            place: summary.currentClanStanding.place,
            cwlStars: summary.currentClanStanding.cwlStars,
            warStars: summary.currentClanStanding.stars,
            record: [
                summary.currentClanStanding.wins,
                summary.currentClanStanding.losses,
                summary.currentClanStanding.ties
            ].join("-"),
            averageDestruction: summary.currentClanStanding.averageDestruction,
            isPromotionFinish: promotedSeasonSet.has(summary.season)
        }))
        .reverse();

    if (history.length === 0) {
        return {
            seasons: [],
            points: [],
            promotionFinishes: []
        };
    }

    const chartWidth = 640;
    const chartHeight = 220;
    const paddingX = 42;
    const paddingTop = 26;
    const paddingBottom = 42;
    const plotWidth = chartWidth - (paddingX * 2);
    const plotHeight = chartHeight - paddingTop - paddingBottom;
    const maxPlace = Math.max(8, ...history.map(item => item.place));
    const denominator = Math.max(history.length - 1, 1);

    const points = history.map((item, index) => {
        const x = paddingX + ((plotWidth / denominator) * index);
        const y = paddingTop + ((item.place - 1) / (maxPlace - 1)) * plotHeight;

        return {
            ...item,
            x: x.toFixed(1),
            y: y.toFixed(1)
        };
    });

    return {
        chartWidth,
        chartHeight,
        maxPlace,
        seasons: history,
        points,
        pointList: points.map(point => `${point.x},${point.y}`).join(" "),
        promotionFinishes: points.filter(point => point.isPromotionFinish)
    };
}

function buildCwlLeagueHistory(seasonSummaries = [], currentLeagueName) {
    let currentLeagueIndex = getLeagueIndex(currentLeagueName);

    if (currentLeagueIndex < 0) {
        return {
            currentLeagueName,
            points: [],
            transitions: []
        };
    }

    const newestToOldest = seasonSummaries.filter(summary => {
        return summary?.currentClanStanding;
    });

    const inferredHistory = newestToOldest.map(summary => {
        const place = summary.currentClanStanding.place;
        const groupSize = summary.groupSize || summary.standings?.length || 8;
        const previousLeagueIndex = getPreviousLeagueIndex(
            currentLeagueIndex,
            place,
            groupSize
        );
        const transition = getLeagueTransition(previousLeagueIndex, currentLeagueIndex);
        const point = {
            season: summary.season,
            label: formatSeasonLabel(summary.season),
            leagueName: CWL_LEAGUE_LADDER[currentLeagueIndex],
            leagueIndex: currentLeagueIndex,
            place,
            transition
        };

        currentLeagueIndex = previousLeagueIndex;

        return point;
    }).reverse();

    if (inferredHistory.length === 0) {
        return {
            currentLeagueName,
            points: [],
            transitions: []
        };
    }

    const chartWidth = 640;
    const chartHeight = 240;
    const paddingX = 42;
    const paddingTop = 28;
    const paddingBottom = 48;
    const plotWidth = chartWidth - (paddingX * 2);
    const plotHeight = chartHeight - paddingTop - paddingBottom;
    const minLeagueIndex = Math.max(
        0,
        Math.min(...inferredHistory.map(item => item.leagueIndex)) - 1
    );
    const maxLeagueIndex = Math.min(
        CWL_LEAGUE_LADDER.length - 1,
        Math.max(...inferredHistory.map(item => item.leagueIndex)) + 1
    );
    const denominator = Math.max(inferredHistory.length - 1, 1);
    const leagueRange = Math.max(maxLeagueIndex - minLeagueIndex, 1);

    let promotionCalloutIndex = 0;
    const points = inferredHistory.map((item, index) => {
        const x = paddingX + ((plotWidth / denominator) * index);
        const y = paddingTop + ((maxLeagueIndex - item.leagueIndex) / leagueRange) * plotHeight;
        const isPromoted = item.transition === "Promoted";
        const calloutDirection = isPromoted && promotionCalloutIndex % 2 === 1
            ? "below"
            : "above";
        const calloutY = calloutDirection === "below"
            ? Math.min(y + 34, chartHeight - 18)
            : Math.max(y - 30, 12);
        const calloutLineY = calloutDirection === "below"
            ? Math.min(y + 24, chartHeight - 28)
            : Math.max(y - 24, 16);

        if (isPromoted) {
            promotionCalloutIndex += 1;
        }

        return {
            ...item,
            x: x.toFixed(1),
            y: y.toFixed(1),
            calloutY: calloutY.toFixed(1),
            calloutLineY: calloutLineY.toFixed(1)
        };
    });
    const middleLeagueIndex = Math.round((minLeagueIndex + maxLeagueIndex) / 2);

    return {
        chartWidth,
        chartHeight,
        minLeagueName: CWL_LEAGUE_LADDER[minLeagueIndex],
        middleLeagueName: CWL_LEAGUE_LADDER[middleLeagueIndex],
        maxLeagueName: CWL_LEAGUE_LADDER[maxLeagueIndex],
        points,
        pointList: points.map(point => `${point.x},${point.y}`).join(" "),
        transitions: points.filter(point => point.transition !== "Stayed")
    };
}

function mapCwlToAttackRows(cwlData, clanTag, clanKey = null) {
    const rows = [];

    for (const round of cwlData.rounds || []) {
        for (const war of round.warTags || []) {
            if (typeof war !== "object") continue;

            const sides = getCwlWarSides(war, clanTag);

            if (!sides) continue;

            const { clanSide, opponentSide } = sides;
            const opponentLookup = createMemberLookup(opponentSide?.members || []);

            for (const attacker of clanSide?.members || []) {
                for (const attack of attacker.attacks || []) {
                    const defender = opponentLookup.get(attack.defenderTag);

                    rows.push({
                        clanKey,
                        season: cwlData.season,
                        warTag: war.tag,
                        warEndTime: war.endTime,

                        clanTag: clanSide.tag,
                        clanName: clanSide.name,
                        opponentClanTag: opponentSide?.tag,
                        opponentClanName: opponentSide?.name,

                        attackerTag: attacker.tag,
                        attackerName: attacker.name,
                        attackerTownhallLevel: attacker.townhallLevel,
                        attackerMapPosition: attacker.mapPosition,

                        defenderTag: attack.defenderTag,
                        defenderName: defender?.name || null,
                        defenderTownhallLevel: defender?.townhallLevel || null,
                        defenderMapPosition: defender?.mapPosition || null,

                        stars: attack.stars,
                        destructionPercentage: attack.destructionPercentage,
                        duration: attack.duration,
                        attackOrder: attack.order,

                        townhallDifference: defender
                            ? defender.townhallLevel - attacker.townhallLevel
                            : null,

                        mapPositionDifference: defender
                            ? defender.mapPosition - attacker.mapPosition
                            : null
                    });
                }
            }
        }
    }

    return rows;
}

module.exports = {
    buildClanCwlSummary,
    buildCwlHistory,
    buildCwlLeagueHistory,
    getRecentCwlSeasonCandidates,
    isValidCwlSeason,
    mapCwlToAttackRows
};
