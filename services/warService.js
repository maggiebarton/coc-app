// services/warService.js
function normalizeTag(tag) {
    return tag?.replace("#", "").toUpperCase();
}

function createMemberLookup(members = []) {
    return new Map(
        members.map(member => [member.tag, member])
    );
}

function getWarSides(war, clanTag) {
    const targetTag = normalizeTag(clanTag);

    const isClanSide =
        normalizeTag(war.clan?.tag) === targetTag;

    return {
        clanSide: isClanSide ? war.clan : war.opponent,
        opponentSide: isClanSide ? war.opponent : war.clan
    };
}

function parseClashDate(dateString) {
    if (!dateString) return null;

    // Converts 20260614T132726.000Z
    // to      2026-06-14T13:27:26.000Z
    const formatted = dateString.replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
        "$1-$2-$3T$4:$5:$6"
    );

    return new Date(formatted);
}

function isWithinRollingDays(war, days = 30) {
    const warDate = parseClashDate(war.endTime);
    const now = new Date();

    if (!warDate || Number.isNaN(warDate.getTime())) {
        return false;
    }

    const cutoffDate = new Date(now);
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - days);

    return warDate >= cutoffDate && warDate <= now;
}

function getRollingRegularWars(wars = [], days = 30) {
    return wars.filter(war =>
        war.attacksPerMember === 2 &&
        isWithinRollingDays(war, days)
    );
}

function getRegularWars(wars = []) {
    return wars.filter(war => war.attacksPerMember === 2);
}

function getCurrentMonthRegularWars(wars = []) {
    return wars.filter(war =>
        war.attacksPerMember === 2 &&
        isCurrentMonthWar(war)
    );
}

function mapWarToAttackRows(war, clanTag, clanKey = null) {
    const { clanSide, opponentSide } = getWarSides(war, clanTag);

    const clanMembers = clanSide?.members || [];
    const opponentMembers = opponentSide?.members || [];
    const opponentLookup = createMemberLookup(opponentMembers);

    const rows = [];

    for (const attacker of clanMembers) {
        const attacks = attacker.attacks || [];

        for (const attack of attacks) {
            const defender = opponentLookup.get(attack.defenderTag);

            rows.push({
                clanKey,

                warEndTime: war.endTime,
                warState: war.state,
                teamSize: war.teamSize,
                attacksPerMember: war.attacksPerMember,

                warType: war.attacksPerMember === 2
                    ? "regular"
                    : "cwl",

                clanName: clanSide?.name,
                clanTag: clanSide?.tag,
                opponentClanName: opponentSide?.name,
                opponentClanTag: opponentSide?.tag,

                attackerTag: attacker.tag,
                attackerName: attacker.name,
                attackerTownhallLevel: attacker.townhallLevel,
                attackerMapPosition: attacker.mapPosition,

                defenderTag: attack.defenderTag,
                defenderName: defender?.name || null,
                defenderTownhallLevel: defender?.townhallLevel || null,
                defenderMapPosition: defender?.mapPosition || null,

                attackOrder: attack.order,
                stars: attack.stars,
                destructionPercentage: attack.destructionPercentage,
                duration: attack.duration,

                // Positive = attacking up. Negative = attacking down.
                townhallDifference: defender
                    ? defender.townhallLevel - attacker.townhallLevel
                    : null,

                mapPositionDifference: defender
                    ? defender.mapPosition - attacker.mapPosition
                    : null
            });
        }
    }

    return rows;
}

function mapWarsToAttackRows(wars = [], clanTag, clanKey = null) {
    return wars.flatMap(war =>
        mapWarToAttackRows(war, clanTag, clanKey)
    );
}

function summarizeWarPlayerStats(war, clanTag, clanKey = null) {
    const { clanSide, opponentSide } = getWarSides(war, clanTag);

    const attackRows = mapWarToAttackRows(war, clanTag, clanKey);
    const attacksByPlayer = new Map();

    for (const row of attackRows) {
        if (!attacksByPlayer.has(row.attackerTag)) {
            attacksByPlayer.set(row.attackerTag, []);
        }

        attacksByPlayer.get(row.attackerTag).push(row);
    }

    const clanMembers = clanSide?.members || [];
    const attacksPerMember = war.attacksPerMember || 2;

    return clanMembers.map(member => {
        const attacks = attacksByPlayer.get(member.tag) || [];

        const totalStars = attacks.reduce((sum, attack) => sum + (attack.stars || 0), 0);
        const totalDestruction = attacks.reduce((sum, attack) => sum + (attack.destructionPercentage || 0), 0);
        const totalThDifference = attacks.reduce((sum, attack) => sum + (attack.townhallDifference || 0), 0);

        return {
            clanKey,
            warEndTime: war.endTime,
            warType: war.attacksPerMember === 1 ? "cwl" : "regular",
            attacksPerMember,
            clanName: clanSide?.name,
            opponentClanName: opponentSide?.name,

            playerTag: member.tag,
            playerName: member.name,
            townhallLevel: member.townhallLevel,
            mapPosition: member.mapPosition,

            attacksUsed: attacks.length,
            missedAttacks: Math.max(attacksPerMember - attacks.length, 0),

            totalStars,
            totalDestruction,

            threeStars: attacks.filter(a => a.stars === 3).length,
            twoStars: attacks.filter(a => a.stars === 2).length,
            oneStars: attacks.filter(a => a.stars === 1).length,
            zeroStars: attacks.filter(a => a.stars === 0).length,

            avgStars: attacks.length
                ? +(totalStars / attacks.length).toFixed(2)
                : 0,

            avgDestruction: attacks.length
                ? +(totalDestruction / attacks.length).toFixed(1)
                : 0,

            avgThDifference: attacks.length
                ? +(totalThDifference / attacks.length).toFixed(2)
                : 0
        };
    });
}

function combinePlayerStats(playerStats = []) {
    const players = new Map();

    for (const row of playerStats) {
        if (!players.has(row.playerTag)) {
            players.set(row.playerTag, {
                clanKey: row.clanKey,

                playerTag: row.playerTag,
                playerName: row.playerName,
                townhallLevel: row.townhallLevel,

                warsParticipated: 0,
                possibleAttacks: 0,
                attacksUsed: 0,
                missedAttacks: 0,

                totalStars: 0,
                totalDestruction: 0,

                threeStars: 0,
                twoStars: 0,
                oneStars: 0,
                zeroStars: 0,

                totalThDifference: 0,
                thDifferenceAttackCount: 0
            });
        }

        const player = players.get(row.playerTag);

        player.warsParticipated += 1;
        player.possibleAttacks += row.attacksUsed + row.missedAttacks;
        player.attacksUsed += row.attacksUsed;
        player.missedAttacks += row.missedAttacks;

        player.totalStars += row.totalStars;
        player.totalDestruction += row.totalDestruction;

        player.threeStars += row.threeStars;
        player.twoStars += row.twoStars;
        player.oneStars += row.oneStars;
        player.zeroStars += row.zeroStars;

        if (row.attacksUsed > 0) {
            player.totalThDifference += row.avgThDifference * row.attacksUsed;
            player.thDifferenceAttackCount += row.attacksUsed;
        }

        player.townhallLevel = Math.max(
            player.townhallLevel || 0,
            row.townhallLevel || 0
        );
    }

    return [...players.values()].map(player => ({
        ...player,

        attackUsagePct: player.possibleAttacks > 0
            ? +((player.attacksUsed / player.possibleAttacks) * 100).toFixed(1)
            : 0,

        avgStars: player.attacksUsed > 0
            ? +(player.totalStars / player.attacksUsed).toFixed(2)
            : 0,

        avgDestruction: player.attacksUsed > 0
            ? +(player.totalDestruction / player.attacksUsed).toFixed(1)
            : 0,

        avgThDifference: player.thDifferenceAttackCount > 0
            ? +(player.totalThDifference / player.thDifferenceAttackCount).toFixed(2)
            : 0
    }));
}

function buildMissedAttacksReport(playerStats = [], days = 30, currentMemberTags = null) {
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - days);
    const players = new Map();
    const normalizedCurrentMemberTags = currentMemberTags
        ? new Set([...currentMemberTags].map(normalizeTag))
        : null;

    for (const row of playerStats) {
        const warDate = parseClashDate(row.warEndTime);
        if (
            (normalizedCurrentMemberTags && !normalizedCurrentMemberTags.has(normalizeTag(row.playerTag))) ||
            !row.missedAttacks ||
            !warDate ||
            Number.isNaN(warDate.getTime()) ||
            (row.warType !== "cwl" && warDate < cutoffDate)
        ) {
            continue;
        }

        if (!players.has(row.playerTag)) {
            players.set(row.playerTag, {
                playerTag: row.playerTag,
                playerName: row.playerName,
                townhallLevel: row.townhallLevel,
                missedAttacks: 0,
                wars: []
            });
        }

        const player = players.get(row.playerTag);
        player.missedAttacks += row.missedAttacks;
        player.townhallLevel = Math.max(player.townhallLevel || 0, row.townhallLevel || 0);
        player.wars.push({
            warEndTime: row.warEndTime,
            clanKey: row.clanKey,
            clanName: row.clanName,
            opponentClanName: row.opponentClanName,
            warType: row.warType,
            cwlSeason: row.cwlSeason || null,
            attacksPerMember: row.attacksPerMember,
            attacksUsed: row.attacksUsed,
            missedAttacks: row.missedAttacks
        });
    }

    const reportPlayers = [...players.values()]
        .map(player => ({
            ...player,
            wars: player.wars.sort((a, b) => (
                (parseClashDate(b.warEndTime)?.getTime() || 0) -
                (parseClashDate(a.warEndTime)?.getTime() || 0)
            ))
        }))
        .sort((a, b) => (
            b.missedAttacks - a.missedAttacks ||
            b.wars.length - a.wars.length ||
            a.playerName.localeCompare(b.playerName)
        ));

    return {
        days,
        players: reportPlayers,
        totalMissedAttacks: reportPlayers.reduce((sum, player) => sum + player.missedAttacks, 0),
        affectedPlayers: reportPlayers.length
    };
}

function buildWarParticipationReport(clans = [], playerStats = [], inactiveDays = 14) {
    const latestParticipationByTag = new Map();

    for (const row of playerStats) {
        const tag = normalizeTag(row.playerTag);
        const warDate = parseClashDate(row.warEndTime);
        if (!tag || !warDate || Number.isNaN(warDate.getTime())) continue;

        const currentLatest = latestParticipationByTag.get(tag);
        if (!currentLatest || warDate > currentLatest.warDate) {
            latestParticipationByTag.set(tag, {
                warDate,
                warEndTime: row.warEndTime,
                warType: row.warType,
                cwlSeason: row.cwlSeason || null,
                clanName: row.clanName,
                opponentClanName: row.opponentClanName
            });
        }
    }

    const now = new Date();
    const players = clans.flatMap(clan => (clan.members || []).map(member => {
        const latest = latestParticipationByTag.get(normalizeTag(member.tag)) || null;
        const daysSince = latest
            ? Math.max(0, Math.floor((now.getTime() - latest.warDate.getTime()) / 86400000))
            : null;

        return {
            playerTag: member.tag,
            playerName: member.name,
            townhallLevel: member.townHallLevel || member.townhallLevel || 0,
            currentClanName: clan.name,
            lastParticipation: latest,
            daysSince
        };
    }))
        .filter(player => player.daysSince === null || player.daysSince >= inactiveDays)
        .sort((a, b) => {
            if (a.daysSince === null && b.daysSince !== null) return -1;
            if (a.daysSince !== null && b.daysSince === null) return 1;
            return (b.daysSince || 0) - (a.daysSince || 0) ||
                a.playerName.localeCompare(b.playerName);
        });

    return {
        inactiveDays,
        players,
        neverSeenCount: players.filter(player => player.daysSince === null).length
    };
}

module.exports = {
    mapWarToAttackRows,
    mapWarsToAttackRows,
    summarizeWarPlayerStats,
    combinePlayerStats,
    buildMissedAttacksReport,
    buildWarParticipationReport,
    getRegularWars,
    getCurrentMonthRegularWars,
    getRollingRegularWars
};
