function normalizeTag(tag) {
  return String(tag || "").replace("#", "").trim().toUpperCase();
}

function warKey(attack) {
  return [attack.clanKey, attack.warEndTime, attack.opponentClanTag].join(":");
}

function buildProbationReport(players = []) {
  const reviews = [];

  for (const player of players) {
    if (!player.isCurrentFamilyMember) continue;

    const incidents = [];
    const attacksByWar = new Map();

    for (const attack of player.attacks || []) {
      const key = warKey(attack);
      if (!attacksByWar.has(key)) attacksByWar.set(key, []);
      attacksByWar.get(key).push(attack);

      if (attack.townhallDifference < 0 && attack.stars < 3) {
        incidents.push({
          level: "probation",
          code: "failed-hit-down",
          title: "Failed hit-down",
          detail: `Scored ${attack.stars}★ (${attack.destructionPercentage}%) attacking TH${attack.defenderTownhallLevel} from TH${attack.attackerTownhallLevel}.`,
          attack,
        });
      } else if (attack.townhallDifference > 0 && attack.stars < 3) {
        incidents.push({
          level: "warning",
          code: "failed-hit-up",
          title: "Hit-up coaching warning",
          detail: `Scored ${attack.stars}★ (${attack.destructionPercentage}%) attacking TH${attack.defenderTownhallLevel} from TH${attack.attackerTownhallLevel}.`,
          attack,
        });
      }
    }

    for (const warAttacks of attacksByWar.values()) {
      const equalAttacks = warAttacks.filter((attack) => attack.townhallDifference === 0);
      const equalStars = equalAttacks.reduce((sum, attack) => sum + (attack.stars || 0), 0);

      // The score rule applies only when both normal-war attacks were used on equal THs.
      if (equalAttacks.length === 2 && equalStars <= 4) {
        const attack = equalAttacks[0];
        incidents.push({
          level: "probation",
          code: "low-equal-total",
          title: "4★ or less on equal THs",
          detail: `Scored ${equalStars}★ total across both equal-TH attacks (${equalAttacks.map((item) => `${item.stars}★`).join(" + ")}).`,
          attack,
        });
      }
    }

    if (!incidents.length) continue;

    incidents.sort((left, right) => (
      (right.level === "probation") - (left.level === "probation") ||
      String(right.attack?.warEndTime || "").localeCompare(String(left.attack?.warEndTime || ""))
    ));
    const probationIncidents = incidents.filter((incident) => incident.level === "probation");
    const warningIncidents = incidents.filter((incident) => incident.level === "warning");

    reviews.push({
      playerTag: player.playerTag,
      playerName: player.playerName,
      townhallLevel: player.townhallLevel,
      currentClanKey: player.currentClanKey,
      currentClanName: player.currentClanName,
      status: probationIncidents.length ? "probation" : "warning",
      incidents,
      probationCount: probationIncidents.length,
      warningCount: warningIncidents.length,
      mostRecentWarEndTime: incidents.reduce((latest, incident) => (
        String(incident.attack?.warEndTime || "") > latest
          ? String(incident.attack.warEndTime)
          : latest
      ), ""),
    });
  }

  reviews.sort((left, right) => (
    (right.status === "probation") - (left.status === "probation") ||
    right.mostRecentWarEndTime.localeCompare(left.mostRecentWarEndTime) ||
    left.playerName.localeCompare(right.playerName)
  ));

  const clans = [...new Map(reviews.map((review) => [
    review.currentClanKey,
    { key: review.currentClanKey, name: review.currentClanName },
  ])).values()].filter((clan) => clan.key).sort((left, right) => (
    left.name.localeCompare(right.name)
  ));

  return {
    probationCount: reviews.filter((review) => review.status === "probation").length,
    warningCount: reviews.filter((review) => review.status === "warning").length,
    clans,
    reviews,
  };
}

module.exports = { buildProbationReport, normalizeTag };
