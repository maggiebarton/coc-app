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

function isCurrentMonthWar(war) {
    const warDate = parseClashDate(war.endTime);
    const now = new Date();

    if (!warDate || Number.isNaN(warDate.getTime())) {
        return false;
    }

    return (
        warDate.getUTCFullYear() === now.getUTCFullYear() &&
        warDate.getUTCMonth() === now.getUTCMonth()
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
    const { clanSide } = getWarSides(war, clanTag);

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

module.exports = {
    mapWarToAttackRows,
    mapWarsToAttackRows,
    summarizeWarPlayerStats,
    combinePlayerStats,
    getRegularWars,
    getCurrentMonthRegularWars
};