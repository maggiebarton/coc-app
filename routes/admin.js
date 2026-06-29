//routes/admin.js
const express = require("express");
const router = express.Router();

const clansConfig = require("../config/clans");
const cwlOverflowClan = require("../config/cwlOverflowClan");
const { getAllClansWithMembers } = require("../services/clanService");
const { getPreviousWars, getCwl } = require("../services/clashKingApi");
const { getCurrentWar } = require("../services/clashApi");
const {
  combinePlayerStats,
  getRollingRegularWars,
  summarizeWarPlayerStats,
} = require("../services/warService");
const { getRecentCwlSeasonCandidates } = require("../services/cwlService");
const {
  clearCwlLineupOverrides,
  readCwlLineupOverrides,
  saveCwlLineupOverride,
} = require("../services/cwlLineupOverrideService");
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

async function getMostRecentFamilyCwlStats() {
  const allCwlStats = [];
  const seasonCandidates = getRecentCwlSeasonCandidates(new Date(), 4);

  for (const clanConfig of clansConfig) {
    for (const season of seasonCandidates) {
      try {
        const cwlData = await getCwl(clanConfig.tag, season);
        const clanTag = clanConfig.tag?.replace("#", "").toUpperCase();
        const completedWars = (cwlData.rounds || []).flatMap((round) => {
          const expandedWarTags = (round.warTags || []).filter((war) => {
            return typeof war === "object";
          });
          const wars = expandedWarTags.length > 0
            ? expandedWarTags
            : (round.wars || []);

          return wars.filter((war) => {
            if (typeof war !== "object" || war.state !== "warEnded") {
              return false;
            }

            const warClanTag = war.clan?.tag?.replace("#", "").toUpperCase();
            const opponentTag = war.opponent?.tag?.replace("#", "").toUpperCase();

            return warClanTag === clanTag || opponentTag === clanTag;
          });
        });
        const seasonStats = completedWars.flatMap((war) => {
          return summarizeWarPlayerStats(
            { ...war, attacksPerMember: 1 },
            clanConfig.tag,
            clanConfig.key
          );
        });

        if (seasonStats.length > 0) {
          allCwlStats.push(...seasonStats);
          break;
        }
      } catch (error) {
        // Try the previous season when this season is unavailable.
      }
    }
  }

  return combinePlayerStats(allCwlStats);
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
    const [combinedWarStats, combinedCwlStats, lineupOverrides] = await Promise.all([
      getRecentFamilyWarStats(60),
      getMostRecentFamilyCwlStats(),
      readCwlLineupOverrides(),
    ]);
    const lineupHelper = buildCwlLineupHelper(
      clans,
      combinedWarStats,
      formats,
      combinedCwlStats,
      lineupOverrides,
      cwlOverflowClan
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

router.post("/overrides", async (req, res, next) => {
  try {
    const destination = String(req.body.destination || "automatic");
    const validDestinations = new Set([
      "automatic",
      "removed",
      ...clansConfig.map((clan) => clan.key),
      cwlOverflowClan.key,
    ]);

    if (!validDestinations.has(destination)) {
      return res.status(400).send("Invalid lineup destination");
    }

    await saveCwlLineupOverride(req.body.playerTag, destination);

    const formatParams = new URLSearchParams();
    for (const clan of clansConfig) {
      const format = req.body[`${clan.key}Format`];
      if (format === "15" || format === "30") {
        formatParams.set(`${clan.key}Format`, format);
      }
    }

    const query = formatParams.toString();
    return res.redirect(query ? `/admin?${query}` : "/admin");
  } catch (error) {
    next(error);
  }
});

router.post("/overrides/reset", async (req, res, next) => {
  try {
    await clearCwlLineupOverrides();

    const formatParams = new URLSearchParams();
    for (const clan of clansConfig) {
      const format = req.body[`${clan.key}Format`];
      if (format === "15" || format === "30") {
        formatParams.set(`${clan.key}Format`, format);
      }
    }

    const query = formatParams.toString();
    return res.redirect(query ? `/admin?${query}` : "/admin");
  } catch (error) {
    next(error);
  }
});

module.exports = router;
