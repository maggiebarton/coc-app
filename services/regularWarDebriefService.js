const { mapWarToAttackRows } = require("./warService");

function parseClashDate(value) {
  if (!value) return null;
  const formatted = value.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
    "$1-$2-$3T$4:$5:$6"
  );
  const date = new Date(formatted);
  return Number.isNaN(date.getTime()) ? null : date;
}

function round(value, digits = 1) {
  return Number(Number(value || 0).toFixed(digits));
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function summarizeAttacks(attacks) {
  const used = attacks.length;
  const totalStars = attacks.reduce((sum, attack) => sum + (attack.stars || 0), 0);
  const totalDestruction = attacks.reduce(
    (sum, attack) => sum + (attack.destructionPercentage || 0),
    0
  );
  const triples = attacks.filter((attack) => attack.stars === 3).length;
  const twoPlus = attacks.filter((attack) => attack.stars >= 2).length;
  const hitUps = attacks.filter((attack) => attack.townhallDifference > 0).length;
  const mirrors = attacks.filter((attack) => attack.townhallDifference === 0).length;
  const hitDowns = attacks.filter((attack) => attack.townhallDifference < 0).length;

  return {
    attacksUsed: used,
    totalStars,
    avgStars: used ? round(totalStars / used, 2) : 0,
    avgDestruction: used ? round(totalDestruction / used) : 0,
    triples,
    tripleRate: used ? round((triples / used) * 100) : 0,
    twoPlusRate: used ? round((twoPlus / used) * 100) : 0,
    hitUps,
    mirrors,
    hitDowns,
  };
}

function buildRegularWarDebrief(clanWars = [], warsRequested = 10, currentClans = []) {
  const clans = [];
  const allAttacks = [];
  const playerMap = new Map();
  const currentMembership = new Map();

  for (const clan of currentClans) {
    for (const member of clan.members || []) {
      currentMembership.set(String(member.tag || "").replace("#", "").toUpperCase(), {
        clanKey: clan.key,
        clanName: clan.name,
      });
    }
  }

  for (const { clan, wars = [] } of clanWars) {
    const clanAttacks = [];
    const detailsUnavailableWars = wars.filter((war) => war.detailsUnavailable).length;
    let wins = 0;
    let losses = 0;
    let ties = 0;

    wars.forEach((war, warIndex) => {
      const clanIsPrimary = String(war.clan?.tag || "").replace("#", "").toUpperCase() ===
        String(clan.tag || "").replace("#", "").toUpperCase();
      const ourSide = clanIsPrimary ? war.clan : war.opponent;
      const theirSide = clanIsPrimary ? war.opponent : war.clan;
      const ourStars = ourSide?.stars || 0;
      const theirStars = theirSide?.stars || 0;
      const ourDestruction = ourSide?.destructionPercentage || 0;
      const theirDestruction = theirSide?.destructionPercentage || 0;
      const won = ourStars > theirStars || (ourStars === theirStars && ourDestruction > theirDestruction);
      const tied = ourStars === theirStars && ourDestruction === theirDestruction;
      if (tied) ties += 1;
      else if (won) wins += 1;
      else losses += 1;

      const warDate = parseClashDate(war.endTime);
      const warLabel = warDate
        ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(warDate)
        : "Unknown date";
      const rows = mapWarToAttackRows(war, clan.tag, clan.key).map((attack) => ({
        ...attack,
        id: `${clan.key}-${warIndex}-${attack.attackOrder || 0}-${String(attack.attackerTag).replace("#", "")}`,
        warLabel,
        result: tied ? "Tie" : won ? "Win" : "Loss",
        score: `${ourStars}-${theirStars}`,
        durationLabel: formatDuration(attack.duration),
      }));
      clanAttacks.push(...rows);
      allAttacks.push(...rows);
    });

    clans.push({
      key: clan.key,
      name: clan.name,
      wars: wars.length,
      wins,
      losses,
      ties,
      detailsUnavailableWars,
      ...summarizeAttacks(clanAttacks),
    });
  }

  for (const attack of allAttacks) {
    if (!playerMap.has(attack.attackerTag)) {
      playerMap.set(attack.attackerTag, {
        playerTag: attack.attackerTag,
        playerName: attack.attackerName,
        townhallLevel: attack.attackerTownhallLevel,
        clanKeys: new Set(),
        clanNames: new Set(),
        warKeys: new Set(),
        attacks: [],
      });
    }
    const player = playerMap.get(attack.attackerTag);
    player.playerName = attack.attackerName || player.playerName;
    player.townhallLevel = Math.max(player.townhallLevel || 0, attack.attackerTownhallLevel || 0);
    player.clanKeys.add(attack.clanKey);
    player.clanNames.add(attack.clanName);
    player.warKeys.add(`${attack.clanKey}:${attack.warEndTime}`);
    player.attacks.push(attack);
  }

  const players = [...playerMap.values()].map((player) => {
    const membership = currentMembership.get(
      String(player.playerTag || "").replace("#", "").toUpperCase()
    ) || null;

    return {
      ...player,
      clanKeys: [...player.clanKeys],
      clanNames: [...player.clanNames],
      isCurrentFamilyMember: Boolean(membership),
      currentClanKey: membership?.clanKey || null,
      currentClanName: membership?.clanName || null,
      wars: player.warKeys.size,
      ...summarizeAttacks(player.attacks),
      attacks: player.attacks.sort((a, b) =>
      (parseClashDate(b.warEndTime)?.getTime() || 0) -
      (parseClashDate(a.warEndTime)?.getTime() || 0) ||
      (a.attackOrder || 0) - (b.attackOrder || 0)
      ),
    };
  }).sort((a, b) =>
    b.avgStars - a.avgStars || b.avgDestruction - a.avgDestruction ||
    b.attacksUsed - a.attacksUsed || a.playerName.localeCompare(b.playerName)
  );

  return {
    warsRequested,
    overview: {
      clans: clans.length,
      wars: clans.reduce((sum, clan) => sum + clan.wars, 0),
      detailsUnavailableWars: clans.reduce(
        (sum, clan) => sum + clan.detailsUnavailableWars,
        0
      ),
      players: players.length,
      ...summarizeAttacks(allAttacks),
    },
    clans,
    players,
  };
}

module.exports = { buildRegularWarDebrief };
