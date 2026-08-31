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
const {
  getClanWarLog,
  getCurrentCwl,
  getCurrentWar,
  verifyPlayerToken,
} = require("../services/clashApi");
const {
  buildMissedAttacksReport,
  buildWarParticipationReport,
  combinePlayerStats,
  getRegularWars,
  getRollingRegularWars,
  summarizeWarPlayerStats,
} = require("../services/warService");
const {
  buildCwlDebrief,
  formatSeasonLabel,
  getRecentCwlSeasonCandidates,
  isValidCwlSeason,
} = require("../services/cwlService");
const {
  clearCwlLineupOverrides,
  readCwlLineupOverrides,
  saveCwlLineupOverride,
} = require("../services/cwlLineupOverrideService");
const {
  buildCwlLineupHelper,
  toDisplayPercent,
} = require("../services/cwlLineupService");
const { buildRegularWarDebrief } = require("../services/regularWarDebriefService");
const { buildProbationReport } = require("../services/probationService");
const recentEndedWarCache = new Map();

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

async function getMostRecentFamilyCwlStats(historyClans = clansConfig) {
  const latestCwlStats = [];
  const reportCwlStats = [];
  const seasonCandidates = getRecentCwlSeasonCandidates(new Date(), 6);

  for (const clanConfig of historyClans) {
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

function parseClashWarTime(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
    "$1-$2-$3T$4:$5:$6"
  ));
  return Number.isNaN(date.getTime()) ? null : date;
}

function countExpandedCwlWars(cwlData) {
  return (cwlData?.rounds || []).reduce((count, round) => (
    count + (round.warTags || round.wars || []).filter(
      (war) => typeof war === "object" && war.clan && war.opponent
    ).length
  ), 0);
}

function scoreCwlDataCoverage(cwlData) {
  return (cwlData?.rounds || []).reduce((score, round) => (
    score + (round.warTags || round.wars || []).reduce((warScore, war) => {
      if (typeof war !== "object" || !war.clan || !war.opponent) return warScore;
      const members = [...(war.clan.members || []), ...(war.opponent.members || [])];
      const attacks = members.reduce(
        (total, member) => total + (member.attacks || []).length,
        0
      );
      return warScore + 1000 + members.length + attacks;
    }, 0)
  ), 0);
}

function sameCwlSeason(left, right) {
  return String(left || "").slice(0, 7) === String(right || "").slice(0, 7);
}

async function getCwlWithOfficialFallback(clanTag, season, allowOfficialFallback) {
  let clashKingData = null;

  const clashKingSeasons = [season];
  const baseSeason = String(season || "").slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(baseSeason) && season === baseSeason) {
    clashKingSeasons.push(`${baseSeason}-01`);
  }

  for (const clashKingSeason of clashKingSeasons) {
    try {
      const candidate = await getCwl(clanTag, clashKingSeason);
      if (scoreCwlDataCoverage(candidate) > scoreCwlDataCoverage(clashKingData)) {
        clashKingData = candidate;
      }
    } catch (error) {
      // Try the next known ClashKing season format before the official fallback.
    }
  }

  if (!allowOfficialFallback) return clashKingData;

  try {
    const officialData = await getCurrentCwl(clanTag);
    const officialSeason = officialData?.season || season;

    if (
      sameCwlSeason(officialSeason, season) &&
      scoreCwlDataCoverage(officialData) > scoreCwlDataCoverage(clashKingData)
    ) {
      return { ...officialData, season: officialSeason };
    }
  } catch (error) {
    // ClashKing data can still be used when the official current-CWL endpoint is unavailable.
  }

  return clashKingData;
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
    const rosterSizes = Object.fromEntries(
      clans.map((clan) => {
        const requestedSize = Number.parseInt(req.query[`${clan.key}RosterSize`], 10);
        return [
          clan.key,
          Number.isInteger(requestedSize) && requestedSize >= 1 && requestedSize <= 50
            ? requestedSize
            : null,
        ];
      })
    );
    const requestedOverflowSize = Number.parseInt(
      req.query[`${cwlOverflowClan.key}RosterSize`],
      10
    );
    rosterSizes[cwlOverflowClan.key] =
      Number.isInteger(requestedOverflowSize) &&
      requestedOverflowSize >= 1 &&
      requestedOverflowSize <= 50
        ? requestedOverflowSize
        : null;
    const lineupPreset = req.query.lineupPreset === "exclude-missed-attacks"
      ? "exclude-missed-attacks"
      : "standard";
    const lineupMode = req.query.lineupMode === "home" ? "home" : "family";
    const [regularWarStats, cwlWarStats, lineupOverrides] = await Promise.all([
      getRecentFamilyWarStats(60),
      getMostRecentFamilyCwlStats([...clansConfig, cwlOverflowClan]),
      readCwlLineupOverrides(),
    ]);
    const lineupHelper = buildCwlLineupHelper(
      clans,
      regularWarStats.combined,
      formats,
      cwlWarStats.combined,
      lineupOverrides,
      cwlOverflowClan,
      {
        rosterSizes,
        excludeMissedAttacks: lineupPreset === "exclude-missed-attacks",
        lineupMode,
      }
    );

    res.render("admin", {
      title: "CWL Lineup Helper",
      clans,
      formats,
      rosterSizes,
      lineupPreset,
      lineupMode,
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

router.get("/cwl-debrief", async (req, res, next) => {
  try {
    const familyClans = [...clansConfig, cwlOverflowClan].filter((clan) => clan.tag);
    const seasonOptions = getRecentCwlSeasonCandidates(new Date(), 12);
    const cwlRequestCache = new Map();
    const loadCwl = (clanTag, season, allowOfficialFallback) => {
      const cacheKey = [normalizeTag(clanTag), season, allowOfficialFallback].join(":");
      if (!cwlRequestCache.has(cacheKey)) {
        cwlRequestCache.set(
          cacheKey,
          getCwlWithOfficialFallback(clanTag, season, allowOfficialFallback)
        );
      }
      return cwlRequestCache.get(cacheKey);
    };
    let selectedSeason = isValidCwlSeason(req.query.season)
      ? req.query.season
      : null;

    if (!selectedSeason) {
      for (const [seasonIndex, season] of seasonOptions.entries()) {
        const results = await Promise.allSettled(
          familyClans.map((clan) => loadCwl(
            clan.tag,
            season,
            seasonIndex === 0
          ))
        );
        if (results.some((result) => (
          result.status === "fulfilled" && countExpandedCwlWars(result.value) > 0
        ))) {
          selectedSeason = season;
          break;
        }
      }
    }

    const results = selectedSeason
      ? await Promise.allSettled(
          familyClans.map((clan) => loadCwl(
            clan.tag,
            selectedSeason,
            sameCwlSeason(selectedSeason, seasonOptions[0])
          ))
        )
      : [];
    const clanSeasons = results.flatMap((result, index) => (
      result.status === "fulfilled" && countExpandedCwlWars(result.value) > 0
        ? [{ clan: familyClans[index], cwlData: result.value }]
        : []
    ));

    res.render("adminCwlDebrief", {
      title: "CWL Debrief",
      selectedSeason,
      seasonOptions: [...new Set([
        ...(selectedSeason ? [selectedSeason] : []),
        ...seasonOptions,
      ])].map((season) => ({ season, label: formatSeasonLabel(season) })),
      report: buildCwlDebrief(clanSeasons, selectedSeason),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/war-debrief", async (req, res, next) => {
  try {
    const allowedWarCounts = new Set([1, 3, 5, 10, 15, 25, 50]);
    const requestedCount = Number.parseInt(req.query.wars, 10);
    const warCount = allowedWarCounts.has(requestedCount) ? requestedCount : 10;
    const results = await Promise.allSettled(clansConfig.map(async (clan) => {
      const [previousWarResult, currentWarResult, warLogResult] = await Promise.allSettled([
        getPreviousWars(clan.tag, 50),
        getCurrentWar(clan.tag),
        getClanWarLog(clan.tag, Math.min(Math.max(warCount + 5, 10), 50)),
      ]);
      const previousWars = previousWarResult.status === "fulfilled"
        ? previousWarResult.value.items || []
        : [];
      const currentWar = currentWarResult.status === "fulfilled"
        ? currentWarResult.value
        : null;
      if (currentWar?.state === "warEnded") {
        recentEndedWarCache.set(normalizeTag(clan.tag), currentWar);
      }
      const cachedEndedWar = recentEndedWarCache.get(normalizeTag(clan.tag)) || null;
      const warLog = warLogResult.status === "fulfilled"
        ? warLogResult.value.items || []
        : [];
      const candidates = [
        ...(currentWar?.state === "warEnded" ? [currentWar] : []),
        ...(cachedEndedWar ? [cachedEndedWar] : []),
        ...previousWars,
      ];
      const uniqueWars = [...new Map(candidates.map((war) => [
        war.tag || [
          war.preparationStartTime || war.startTime || war.endTime || "unknown",
          ...[war.clan?.tag || "", war.opponent?.tag || ""].sort(),
        ].join(":"),
        war,
      ])).values()];
      const detailedRegularWars = getRegularWars(uniqueWars)
        .filter((war) => war.state === "warEnded");
      const detailedWarMatches = (summary) => detailedRegularWars.some((war) => {
        const endDifference = Math.abs(
          (parseClashWarTime(war.endTime)?.getTime() || 0) -
          (parseClashWarTime(summary.endTime)?.getTime() || 0)
        );
        const detailedTags = new Set([normalizeTag(war.clan?.tag), normalizeTag(war.opponent?.tag)]);
        const summaryTags = [normalizeTag(summary.clan?.tag), normalizeTag(summary.opponent?.tag)];
        return endDifference <= 5 * 60 * 1000 && summaryTags.every((tag) => detailedTags.has(tag));
      });
      const warLogOnlyWars = warLog
        .filter((war) => war.attacksPerMember === 2 && !detailedWarMatches(war))
        .map((war) => ({ ...war, state: "warEnded", detailsUnavailable: true }));
      const regularWars = [...detailedRegularWars, ...warLogOnlyWars]
        .sort((a, b) => {
          const left = String(a.endTime || "");
          const right = String(b.endTime || "");
          return right.localeCompare(left);
        })
        .slice(0, warCount);
      return { clan, wars: regularWars };
    }));
    const clanWars = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );

    res.render("adminWarDebrief", {
      title: "Regular War Debrief",
      warCount,
      warCountOptions: [...allowedWarCounts],
      report: buildRegularWarDebrief(clanWars, warCount, req.adminClans),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/probation", async (req, res, next) => {
  try {
    const allowedWarCounts = new Set([3, 5, 10, 15, 25]);
    const requestedCount = Number.parseInt(req.query.wars, 10);
    const warCount = allowedWarCounts.has(requestedCount) ? requestedCount : 10;
    const results = await Promise.allSettled(clansConfig.map(async (clan) => {
      const previousWarData = await getPreviousWars(clan.tag, 50);
      const regularWars = getRegularWars(previousWarData.items || [])
        .filter((war) => war.state === "warEnded")
        .sort((left, right) => String(right.endTime || "").localeCompare(String(left.endTime || "")))
        .slice(0, warCount);
      return { clan, wars: regularWars };
    }));
    const clanWars = results.flatMap((result) => (
      result.status === "fulfilled" ? [result.value] : []
    ));
    const debrief = buildRegularWarDebrief(clanWars, warCount, req.adminClans);

    res.render("adminProbation", {
      title: "Probation Review",
      warCount,
      warCountOptions: [...allowedWarCounts],
      report: buildProbationReport(debrief.players),
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
    if (req.body.lineupMode === "home") {
      formatParams.set("lineupMode", "home");
    }
    if (req.body.lineupPreset === "exclude-missed-attacks") {
      formatParams.set("lineupPreset", "exclude-missed-attacks");
    }
    for (const clan of clansConfig) {
      const format = req.body[`${clan.key}Format`];
      if (format === "15" || format === "30") {
        formatParams.set(`${clan.key}Format`, format);
      }
      const rosterSize = Number.parseInt(req.body[`${clan.key}RosterSize`], 10);
      if (Number.isInteger(rosterSize) && rosterSize >= 1 && rosterSize <= 50) {
        formatParams.set(`${clan.key}RosterSize`, String(rosterSize));
      }
    }
    const overflowRosterSize = Number.parseInt(
      req.body[`${cwlOverflowClan.key}RosterSize`],
      10
    );
    if (
      Number.isInteger(overflowRosterSize) &&
      overflowRosterSize >= 1 &&
      overflowRosterSize <= 50
    ) {
      formatParams.set(
        `${cwlOverflowClan.key}RosterSize`,
        String(overflowRosterSize)
      );
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
    if (req.body.lineupMode === "home") {
      formatParams.set("lineupMode", "home");
    }
    if (req.body.lineupPreset === "exclude-missed-attacks") {
      formatParams.set("lineupPreset", "exclude-missed-attacks");
    }
    for (const clan of clansConfig) {
      const format = req.body[`${clan.key}Format`];
      if (format === "15" || format === "30") {
        formatParams.set(`${clan.key}Format`, format);
      }
      const rosterSize = Number.parseInt(req.body[`${clan.key}RosterSize`], 10);
      if (Number.isInteger(rosterSize) && rosterSize >= 1 && rosterSize <= 50) {
        formatParams.set(`${clan.key}RosterSize`, String(rosterSize));
      }
    }
    const overflowRosterSize = Number.parseInt(
      req.body[`${cwlOverflowClan.key}RosterSize`],
      10
    );
    if (
      Number.isInteger(overflowRosterSize) &&
      overflowRosterSize >= 1 &&
      overflowRosterSize <= 50
    ) {
      formatParams.set(
        `${cwlOverflowClan.key}RosterSize`,
        String(overflowRosterSize)
      );
    }

    const query = formatParams.toString();
    return res.redirect(query ? `/admin/lineup?${query}` : "/admin/lineup");
  } catch (error) {
    next(error);
  }
});

module.exports = router;
