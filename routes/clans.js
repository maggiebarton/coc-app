//routes/clans.js
const express = require("express");
const router = express.Router();

const { getAllClanInfo, getClanByKey } = require("../services/clanService");

const { getPreviousWars, getCwl } = require("../services/clashKingApi");
const { getCurrentWar } = require("../services/clashApi");

const {
  summarizeWarPlayerStats,
  combinePlayerStats,
  getRollingRegularWars,
} = require("../services/warService");

const {
  buildCwlHistory,
  buildCwlLeagueHistory,
  buildClanCwlSummary,
  getRecentCwlSeasonCandidates,
  isValidCwlSeason,
} = require("../services/cwlService");

const clansConfig = require("../config/clans");

async function getCwlSummaryForSeason(clan, season) {
  try {
    const cwlData = await getCwl(clan.tag, season);
    const cwlSummary = buildClanCwlSummary(cwlData, clan.tag);

    if (cwlSummary?.overview?.roundsPlayed > 0) {
      return cwlSummary;
    }
  } catch (error) {
    return null;
  }

  return null;
}

async function getMostRecentCwlSummary(clan, seasonCandidates) {
  for (const season of seasonCandidates) {
    try {
      const cwlSummary = await getCwlSummaryForSeason(clan, season);

      if (cwlSummary) {
        return cwlSummary;
      }
    } catch (error) {
      // Try the previous season when the current one is not available yet.
    }
  }

  return null;
}

async function getCwlSummariesForSeasons(clan, seasons) {
  const summaries = await Promise.all(
    seasons.map((season) => getCwlSummaryForSeason(clan, season))
  );

  return summaries.filter(Boolean);
}

router.get("/", async (req, res, next) => {
  try {
    const clans = await getAllClanInfo();

    res.render("clan", {
      title: "Clan Overview",
      clans,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:clanKey", async (req, res, next) => {
  try {
    const rankBy = req.query.rankBy || "league";
    const selectedCwlSeason = isValidCwlSeason(req.query.cwlSeason)
      ? req.query.cwlSeason
      : null;
    const cwlSeasonOptions = getRecentCwlSeasonCandidates(new Date(), 12);

    if (
      selectedCwlSeason &&
      !cwlSeasonOptions.includes(selectedCwlSeason)
    ) {
      cwlSeasonOptions.unshift(selectedCwlSeason);
    }

    const clan = await getClanByKey(req.params.clanKey, rankBy);

    if (!clan) {
      return res.status(404).send("Clan not found");
    }

    const allWarStats = [];
    const allRegularWars = [];

    for (const clanConfig of clansConfig) {
      const previousWarData = await getPreviousWars(clanConfig.tag, 50);

      let currentWar = null;

      try {
        currentWar = await getCurrentWar(clanConfig.tag);
      } catch (error) {
        currentWar = null;
      }

      const allWars = [
        ...(currentWar?.state === "warEnded" ? [currentWar] : []),
        ...(previousWarData.items || []),
      ];

      const regularWars = getRollingRegularWars(allWars, 30);

      allRegularWars.push(
        ...regularWars.map((war) => ({
          ...war,
          sourceClanKey: clanConfig.key,
          sourceClanName: clanConfig.name,
          sourceClanTag: clanConfig.tag,
        }))
      );

      const perWarPlayerStats = regularWars.flatMap((war) =>
        summarizeWarPlayerStats(war, clanConfig.tag, clanConfig.key)
      );

      allWarStats.push(...perWarPlayerStats);
    }

    const combinedWarStats = combinePlayerStats(allWarStats);

    const currentMemberTags = new Set(
      clan.members.map((member) => member.tag)
    );

    const currentMemberWarStats = combinedWarStats.filter((player) =>
      currentMemberTags.has(player.playerTag)
    );

    const warStatsByTag = new Map(
      currentMemberWarStats.map((player) => [player.playerTag, player])
    );

    clan.members = clan.members.map((member) => ({
      ...member,
      warStats: warStatsByTag.get(member.tag) || null,
    }));

    if (rankBy === "avgStars") {
      clan.members.sort((a, b) => {
        const aStats = a.warStats || {};
        const bStats = b.warStats || {};

        return (
          (bStats.avgStars || 0) - (aStats.avgStars || 0) ||
          (bStats.avgDestruction || 0) - (aStats.avgDestruction || 0) ||
          (b.townHallLevel || 0) - (a.townHallLevel || 0)
        );
      });

      let currentRank = 0;
      let previousKey = null;

      clan.members = clan.members.map((member, index) => {
        const stats = member.warStats || {};

        const rankKey = [
          stats.avgStars || 0,
          stats.avgDestruction || 0,
          member.townHallLevel || 0,
        ].join("|");

        if (rankKey !== previousKey) {
          currentRank = index + 1;
          previousKey = rankKey;
        }

        return {
          ...member,
          displayRank: currentRank,
        };
      });
    }

    const cwlSummaries = await getCwlSummariesForSeasons(
      clan,
      cwlSeasonOptions
    );
    const cwlSummary = selectedCwlSeason
      ? cwlSummaries.find((summary) => summary.season === selectedCwlSeason) || null
      : cwlSummaries[0] || await getMostRecentCwlSummary(clan, cwlSeasonOptions);
    const cwlLeagueHistory = buildCwlLeagueHistory(
      cwlSummaries,
      clan.clanInfo.warLeague?.name
    );
    const cwlHistory = buildCwlHistory(cwlSummaries, cwlLeagueHistory);

    res.render("clanDetails", {
      title: `${clan.clanInfo.name} Dashboard`,
      clan,
      rankBy,
      regularWars: allRegularWars,
      combinedWarStats: currentMemberWarStats,
      cwlSummary,
      cwlHistory,
      cwlLeagueHistory,
      cwlSeasonOptions,
      selectedCwlSeason: selectedCwlSeason || cwlSummary?.season || cwlSeasonOptions[0],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
