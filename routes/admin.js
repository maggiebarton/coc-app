//routes/admin.js
const express = require("express");
const router = express.Router();

const clansConfig = require("../config/clans");
const { getAllClansWithMembers } = require("../services/clanService");
const { getPreviousWars } = require("../services/clashKingApi");
const { getCurrentWar } = require("../services/clashApi");
const {
  combinePlayerStats,
  getRollingRegularWars,
  summarizeWarPlayerStats,
} = require("../services/warService");
const {
  buildCwlLineupHelper,
  toDisplayPercent,
} = require("../services/cwlLineupService");

async function getRecentFamilyWarStats(days = 60) {
  const allWarStats = [];

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
    const regularWars = getRollingRegularWars(allWars, days);
    const perWarPlayerStats = regularWars.flatMap((war) => {
      return summarizeWarPlayerStats(war, clanConfig.tag, clanConfig.key);
    });

    allWarStats.push(...perWarPlayerStats);
  }

  return combinePlayerStats(allWarStats);
}

router.get("/", async (req, res, next) => {
  try {
    const clans = await getAllClansWithMembers();
    const formats = Object.fromEntries(
      clans.map((clan) => [
        clan.key,
        req.query[`${clan.key}Format`] || "15",
      ])
    );
    const combinedWarStats = await getRecentFamilyWarStats(60);
    const lineupHelper = buildCwlLineupHelper(
      clans,
      combinedWarStats,
      formats
    );

    res.render("admin", {
      title: "Admin",
      clans,
      formats,
      lineupHelper,
      toDisplayPercent,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
