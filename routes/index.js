var express = require('express');
var router = express.Router();

const { getAllClanInfo } = require("../services/clanService");
const { getSeasonCountdown } = require("../services/seasonService");

const clansConfig = require("../config/clans");

const {
  getCurrentWar,
  getCurrentCwlLeagueGroup
} = require("../services/clashApi");

const {
  buildFamilyStats,
  buildActiveWarStats,
  buildActiveCwlStats
} = require("../services/dashboardService");

router.get("/", async (req, res, next) => {
  try {
    const clans = await getAllClanInfo();

    const seasonCountdown = await getSeasonCountdown();
    const familyStats = buildFamilyStats(clans);

    const currentWars = await Promise.all(
      clansConfig.map(async clan => {
        try {
          return await getCurrentWar(clan.tag);
        } catch (error) {
          return { state: "notInWar" };
        }
      })
    );

    const activeWarStats = buildActiveWarStats(currentWars);

    const currentCwlGroups = await Promise.all(
      clansConfig.map(async clan => {
        try {
          return await getCurrentCwlLeagueGroup(clan.tag);
        } catch (error) {
          return { state: "notInWar" };
        }
      })
    );

    const activeCwlStats = buildActiveCwlStats(currentCwlGroups);

    res.render("index", {
      title: "Filthy Witches",
      seasonCountdown,
      familyStats,
      activeWarStats,
      activeCwlStats,
      clans
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
