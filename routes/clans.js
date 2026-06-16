//routes/clans.js
const express = require("express");
const router = express.Router();

const { getAllClanInfo, getClanByKey } = require("../services/clanService");

const { getPreviousWars } = require("../services/clashKingApi");
const { getCurrentWar } = require("../services/clashApi");

const {
  summarizeWarPlayerStats,
  combinePlayerStats,
  getCurrentMonthRegularWars,
} = require("../services/warService");

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

    const previousWarData = await getPreviousWars(clan.tag, 20);
    const currentWar = await getCurrentWar(clan.tag);

    const allWars = [
      ...(currentWar?.state === "warEnded" ? [currentWar] : []),
      ...previousWarData.items,
    ];

    const regularWars = getCurrentMonthRegularWars(allWars);

    const perWarPlayerStats = regularWars.flatMap((war) =>
      summarizeWarPlayerStats(war, clan.tag, clan.key)
    );

    const combinedWarStats = combinePlayerStats(perWarPlayerStats);

    const currentMemberTags = new Set(clan.members.map((member) => member.tag));

    const currentMonthWarStats = combinedWarStats.filter((player) =>
      currentMemberTags.has(player.playerTag)
    );

    const warStatsByTag = new Map(
      currentMonthWarStats.map((player) => [player.playerTag, player])
    );

    clan.members = clan.members.map((member) => ({
      ...member,
      warStats: warStatsByTag.get(member.tag) || null,
    }));

    if (rankBy === "avgStars") {
      clan.members.sort((a, b) => {
        const aStars = a.warStats?.avgStars || 0;
        const bStars = b.warStats?.avgStars || 0;

        if (bStars !== aStars) {
          return bStars - aStars;
        }

        return (
          (b.warStats?.avgDestruction || 0) - (a.warStats?.avgDestruction || 0)
        );
      });

      clan.members = clan.members.map((member, index) => ({
        ...member,
        displayRank: index + 1,
      }));
    }

    res.render("clanDetails", {
      title: `${clan.clanInfo.name} Dashboard`,
      clan,
      rankBy,
      regularWars,
      combinedWarStats: currentMonthWarStats,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
