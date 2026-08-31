const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const express = require("express");

const clans = [
  { key: "a", name: "Alpha", tag: "#A", clanInfo: { warLeague: { name: "Master I" } },
    members: [{ tag: "#A1", name: "Alpha One", townHallLevel: 16 }, { tag: "#A2", name: "Alpha Two", townHallLevel: 15 }] },
  { key: "b", name: "Beta", tag: "#B", clanInfo: { warLeague: { name: "Crystal I" } },
    members: [{ tag: "#B1", name: "Beta One", townHallLevel: 18 }, { tag: "#B2", name: "Beta Two", townHallLevel: 17 }] },
];
const overflow = require("../../config/cwlOverflowClan");

function stats(tag, stars = 3, extra = {}) {
  return { playerTag: tag, warsParticipated: 5, possibleAttacks: 10,
    attacksUsed: 10, missedAttacks: 0, avgStars: stars, avgDestruction: stars / 3 * 100,
    avgThDifference: 0, ...extra };
}

function war(clan, member, attacksPerMember = 1, stars = 3) {
  return {
    state: "warEnded", attacksPerMember, endTime: "20260830T120000.000Z",
    clan: { tag: clan.tag, name: clan.name, members: [{ tag: member.tag, name: member.name,
      townhallLevel: member.townHallLevel, attacks: [{ defenderTag: "#ENEMY", stars, destructionPercentage: stars / 3 * 100 }] }] },
    opponent: { tag: "#OTHER", name: "Opponent", members: [{ tag: "#ENEMY", townhallLevel: member.townHallLevel }] },
  };
}

// Isolated route fixture: API and override persistence are mocked, never live.
function createHarness({ getCwl, overrides = {} } = {}) {
  const calls = [];
  const saved = [];
  const filename = path.resolve(__dirname, "../../routes/admin.js");
  const localRequire = createRequire(filename);
  const mocks = {
    "../config/clans": clans,
    "../middleware/adminAuth": {
      requireAdmin(req, res, next) { req.adminClans = clans; next(); },
    },
    "../services/clashApi": { getCurrentWar: async () => null },
    "../services/clashKingApi": {
      getPreviousWars: async () => ({ items: [] }),
      getCwl: async (tag, season) => {
        calls.push({ tag, season });
        if (getCwl) return getCwl(tag, season);
        return { rounds: tag === overflow.tag ? [{ wars: [war(overflow, clans[0].members[0])] }] : [] };
      },
    },
    "../services/cwlLineupOverrideService": {
      readCwlLineupOverrides: async () => overrides,
      saveCwlLineupOverride: async (...args) => saved.push(args),
      clearCwlLineupOverrides: async () => saved.push("reset"),
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    require: name => mocks[name] || localRequire(name), module, exports: module.exports,
    URLSearchParams, console, process,
  }, { filename });
  const router = module.exports;
  const handler = (route, method = "get") => router.stack.find(layer =>
    layer.route?.path === route && layer.route.methods[method]).route.stack[0].handle;
  const app = express();
  app.set("views", path.resolve(__dirname, "../../views"));
  app.set("view engine", "ejs");
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.resolve(__dirname, "../../public")));
  app.use("/admin", router);
  return { calls, saved, handler, app };
}

module.exports = { clans, overflow, stats, war, createHarness };
