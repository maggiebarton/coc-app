const ADMIN_COOKIE_NAME = "fw_admin_auth";
const ADMIN_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const { getAllClansWithMembers } = require("../services/clanService");

function normalizeTag(tag) {
  return String(tag || "").replace("#", "").trim().toUpperCase();
}

function getAdminUser(req) {
  const session = req.signedCookies?.[ADMIN_COOKIE_NAME];

  if (
    !session ||
    typeof session !== "object" ||
    !session.playerTag ||
    !session.expiresAt ||
    Number(session.expiresAt) <= Date.now()
  ) {
    return null;
  }

  return session;
}

async function requireAdmin(req, res, next) {
  const adminUser = getAdminUser(req);

  if (!adminUser) {
    res.clearCookie(ADMIN_COOKIE_NAME);
    const returnTo = req.originalUrl.startsWith("/admin")
      ? req.originalUrl
      : "/admin";
    return res.redirect(`/admin/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  try {
    const clans = await getAllClansWithMembers();
    let currentMember = null;
    let currentClan = null;

    for (const clan of clans) {
      const member = (clan.members || []).find(candidate => (
        normalizeTag(candidate.tag) === normalizeTag(adminUser.playerTag)
      ));

      if (member) {
        currentMember = member;
        currentClan = clan;
        break;
      }
    }

    if (!currentMember || !new Set(["leader", "coLeader"]).has(currentMember.role)) {
      clearAdminCookie(res);
      return res.redirect("/admin/login?access=role");
    }

    req.adminClans = clans;
    req.adminUser = {
      ...adminUser,
      playerName: currentMember.name,
      role: currentMember.role,
      clanName: currentClan.name,
    };
    res.locals.adminUser = req.adminUser;
    return next();
  } catch (error) {
    return next(error);
  }
}

function setAdminCookie(res, adminUser) {
  const expiresAt = Date.now() + ADMIN_SESSION_MS;

  res.cookie(
    ADMIN_COOKIE_NAME,
    { ...adminUser, expiresAt },
    {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ADMIN_SESSION_MS,
    }
  );
}

function clearAdminCookie(res) {
  res.clearCookie(ADMIN_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

module.exports = {
  clearAdminCookie,
  getAdminUser,
  requireAdmin,
  setAdminCookie,
};
