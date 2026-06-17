//routes/clans.js
const express = require("express");
const router = express.Router();

const { getAllClanInfo, getClanByKey } = require("../services/clanService");

const { getPreviousWars } = require("../services/clashKingApi");
const { getCurrentWar } = require("../services/clashApi");

const {
  summarizeWarPlayerStats,
  combinePlayerStats,
  getRollingRegularWars,
} = require("../services/warService");

const clansConfig = require("../config/clans");

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

    res.render("clanDetails", {
      title: `${clan.clanInfo.name} Dashboard`,
      clan,
      rankBy,
      regularWars: allRegularWars,
      combinedWarStats: currentMemberWarStats,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
