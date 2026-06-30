//routes/admin.js
const express = require("express");
const router = express.Router();

const clansConfig = require("../config/clans");
const cwlOverflowClan = require("../config/cwlOverflowClan");
const {
  clearAdminCookie,
  getAdminUser,
  requireAdmin,
  setAdminCookie,
} = require("../middleware/adminAuth");
const { getAllClansWithMembers } = require("../services/clanService");
const { getPreviousWars, getCwl } = require("../services/clashKingApi");
const { getCurrentWar, verifyPlayerToken } = require("../services/clashApi");
const {
  buildMissedAttacksReport,
  buildWarParticipationReport,
  combinePlayerStats,
  getRegularWars,
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
  const allHistoricalWarStats = [];

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
    const uniqueWars = [...new Map(
      allWars.map((war) => [
        war.tag || [
          war.preparationStartTime || war.startTime || war.endTime || "unknown",
          ...[war.clan?.tag || "", war.opponent?.tag || ""].sort(),
        ].join(":"),
        war,
      ])
    ).values()];
    const regularWars = getRollingRegularWars(uniqueWars, days);
    const historicalRegularWars = getRegularWars(uniqueWars).filter((war) => war.state === "warEnded");
    const perWarPlayerStats = regularWars.flatMap((war) => {
      return summarizeWarPlayerStats(war, clanConfig.tag, clanConfig.key);
    });
    const historicalPlayerStats = historicalRegularWars.flatMap((war) => {
      return summarizeWarPlayerStats(war, clanConfig.tag, clanConfig.key);
    });

    allWarStats.push(...perWarPlayerStats);
    allHistoricalWarStats.push(...historicalPlayerStats);
  }

  return {
    combined: combinePlayerStats(allWarStats),
    perWar: allWarStats,
    allPerWar: allHistoricalWarStats,
  };
}

async function getMostRecentFamilyCwlStats() {
  const latestCwlStats = [];
  const reportCwlStats = [];
  const seasonCandidates = getRecentCwlSeasonCandidates(new Date(), 6);

  for (const clanConfig of clansConfig) {
    let seasonsFound = 0;

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
          ).map((row) => ({ ...row, cwlSeason: season }));
        });

        if (seasonStats.length > 0) {
          if (seasonsFound === 0) {
            latestCwlStats.push(...seasonStats);
          }
          reportCwlStats.push(...seasonStats);
          seasonsFound += 1;

          if (seasonsFound >= 2) break;
        }
      } catch (error) {
        // Try the previous season when this season is unavailable.
      }
    }
  }

  return {
    combined: combinePlayerStats(latestCwlStats),
    perWar: reportCwlStats,
  };
}

function normalizeTag(tag) {
  return String(tag || "").replace("#", "").trim().toUpperCase();
}

function safeAdminReturnTo(value) {
  const returnTo = String(value || "");
  return returnTo.startsWith("/admin") && !returnTo.startsWith("//")
    ? returnTo
    : "/admin";
}

function getAdminCandidates(clans = []) {
  const allowedRoles = new Set(["leader", "coLeader"]);
  const roleRank = { leader: 0, coLeader: 1 };

  return clans.flatMap((clan) => (clan.members || [])
    .filter((member) => allowedRoles.has(member.role))
    .map((member) => ({
      playerTag: member.tag,
      playerName: member.name,
      role: member.role,
      clanName: clan.name,
    })))
    .sort((a, b) => (
      a.clanName.localeCompare(b.clanName) ||
      roleRank[a.role] - roleRank[b.role] ||
      a.playerName.localeCompare(b.playerName)
    ));
}

router.get("/login", async (req, res, next) => {
  if (getAdminUser(req)) return res.redirect("/admin");

  try {
    const clans = await getAllClansWithMembers();

    res.render("adminLogin", {
      title: "Admin Login",
      error: req.query.access === "role"
        ? "Your account is no longer a current family Leader or Co-Leader."
        : null,
      playerTag: "",
      adminCandidates: getAdminCandidates(clans),
      returnTo: safeAdminReturnTo(req.query.returnTo),
      authConfigured: Boolean(process.env.ADMIN_COOKIE_SECRET),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res) => {
  const playerTag = normalizeTag(req.body.playerTag);
  const token = String(req.body.token || "").trim();
  const returnTo = safeAdminReturnTo(req.body.returnTo);
  let error = null;
  let adminCandidates = [];

  if (!process.env.ADMIN_COOKIE_SECRET) {
    error = "Admin login is not configured yet.";
  } else if (!playerTag || !token) {
    error = "Enter both your player tag and API token.";
  } else {
    try {
      const [verification, clans] = await Promise.all([
        verifyPlayerToken(playerTag, token),
        getAllClansWithMembers(),
      ]);
      adminCandidates = getAdminCandidates(clans);

      if (verification?.status !== "ok") {
        error = "That player tag and API token did not match.";
      } else {
        let authorizedMember = null;
        let authorizedClan = null;

        for (const clan of clans) {
          const member = (clan.members || []).find(candidate => (
            normalizeTag(candidate.tag) === playerTag
          ));

          if (member) {
            authorizedMember = member;
            authorizedClan = clan;
            break;
          }
        }

        const allowedRoles = new Set(["leader", "coLeader"]);
        if (!authorizedMember || !allowedRoles.has(authorizedMember.role)) {
          error = "Admin tools are limited to current family Leaders and Co-Leaders.";
        } else {
          setAdminCookie(res, {
            playerTag: authorizedMember.tag,
            playerName: authorizedMember.name,
            role: authorizedMember.role,
            clanName: authorizedClan.name,
          });
          return res.redirect(returnTo);
        }
      }
    } catch (verificationError) {
      error = "We could not verify that token. Check it and try again.";
    }
  }

  if (adminCandidates.length === 0) {
    try {
      adminCandidates = getAdminCandidates(await getAllClansWithMembers());
    } catch (candidateError) {
      error = error || "We could not load the current Admin list. Try again shortly.";
    }
  }

  return res.status(401).render("adminLogin", {
    title: "Admin Login",
    error,
    playerTag: req.body.playerTag || "",
    adminCandidates,
    returnTo,
    authConfigured: Boolean(process.env.ADMIN_COOKIE_SECRET),
  });
});

router.post("/logout", (req, res) => {
  clearAdminCookie(res);
  res.redirect("/admin/login");
});

router.use(requireAdmin);

router.get("/", (req, res) => {
  res.render("adminLanding", { title: "Admin" });
});

router.get("/lineup", async (req, res, next) => {
  try {
    const clans = req.adminClans;
    const formats = Object.fromEntries(
      clans.map((clan) => [
        clan.key,
        req.query[`${clan.key}Format`] || "15",
      ])
    );
    const [regularWarStats, cwlWarStats, lineupOverrides] = await Promise.all([
      getRecentFamilyWarStats(60),
      getMostRecentFamilyCwlStats(),
      readCwlLineupOverrides(),
    ]);
    const lineupHelper = buildCwlLineupHelper(
      clans,
      regularWarStats.combined,
      formats,
      cwlWarStats.combined,
      lineupOverrides,
      cwlOverflowClan
    );

    res.render("admin", {
      title: "CWL Lineup Helper",
      clans,
      formats,
      lineupHelper,
      showReports: false,
      toDisplayPercent,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/missed-attacks", async (req, res, next) => {
  try {
    const allowedReportDays = new Set([7, 14, 30, 60]);
    const requestedDays = Number(req.query.days);
    const days = allowedReportDays.has(requestedDays) ? requestedDays : 30;
    const clans = req.adminClans;
    const [regularWarStats, cwlWarStats] = await Promise.all([
      getRecentFamilyWarStats(60),
      getMostRecentFamilyCwlStats(),
    ]);
    const currentMemberTags = new Set(
      clans.flatMap((clan) => (clan.members || []).map((member) => member.tag))
    );

    res.render("adminMissedAttacks", {
      title: "Missed Attacks Report",
      days,
      report: buildMissedAttacksReport(
        [...regularWarStats.perWar, ...cwlWarStats.perWar],
        days,
        currentMemberTags
      ),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/participation", async (req, res, next) => {
  try {
    const allowedReportDays = new Set([7, 14, 30, 60]);
    const requestedDays = Number(req.query.days);
    const days = allowedReportDays.has(requestedDays) ? requestedDays : 14;
    const clans = req.adminClans;
    const [regularWarStats, cwlWarStats] = await Promise.all([
      getRecentFamilyWarStats(60),
      getMostRecentFamilyCwlStats(),
    ]);

    res.render("adminParticipation", {
      title: "War Participation Report",
      days,
      report: buildWarParticipationReport(
        clans,
        [...regularWarStats.allPerWar, ...cwlWarStats.perWar],
        days
      ),
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
    return res.redirect(query ? `/admin/lineup?${query}` : "/admin/lineup");
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
    return res.redirect(query ? `/admin/lineup?${query}` : "/admin/lineup");
  } catch (error) {
    next(error);
  }
});

module.exports = router;
