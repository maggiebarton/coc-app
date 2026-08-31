const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ejs = require("ejs");
const { buildCwlLineupHelper } = require("../services/cwlLineupService");
const { clans, overflow, stats, war, createHarness } = require("./helpers/lineupHarness");

const regular = [stats("#A1", 2), stats("#A2", 1), stats("#B1"), stats("#B2", 2.8)];
function build(mode = "family", overrides = {}, options = {}, warStats = regular, cwl = []) {
  return buildCwlLineupHelper(clans, warStats, {}, cwl, overrides, overflow, {
    rosterSizes: { a: 1, b: 1, ws: 1 }, lineupMode: mode, ...options,
  });
}
const members = (result, key) => result.clans.find(clan => clan.key === key).members.map(player => player.tag);

test("family mode retains league-first allocation and shared overflow", () => {
  const result = build();
  assert.deepEqual(members(result, "a"), ["#B1"]);
  assert.deepEqual(members(result, "b"), ["#B2"]);
  assert.deepEqual(members(result, "ws"), ["#A1"]);
  assert.equal(result.unassignedPlayers[0].tag, "#A2");
});

test("home mode fills only home rosters, with one shared overflow ranked by score", () => {
  const result = build("home");
  assert.deepEqual(members(result, "a"), ["#A1"]);
  assert.deepEqual(members(result, "b"), ["#B1"]);
  assert.deepEqual(members(result, "ws"), ["#B2"]);
  assert.equal(result.unassignedPlayers[0].tag, "#A2");
  assert.equal(result.players.find(player => player.tag === "#A1").homeRank, 1);
  assert.equal(result.players.find(player => player.tag === "#B1").homeRank, 1);
});

test("home scores and all three ranks match scoring each clan independently", () => {
  const combined = build("home", {}, {}, regular, regular);
  for (const clan of clans) {
    const separate = buildCwlLineupHelper([clan], regular, {}, regular);
    for (const player of separate.players) {
      const actual = combined.players.find(candidate => candidate.tag === player.tag);
      assert.equal(actual.mainScore, player.mainScore);
      assert.equal(actual.homeRank, player.rank);
      assert.equal(actual.regularRank, player.regularRank);
      assert.equal(actual.cwlRank, player.cwlRank);
    }
  }
});

test("manual cross-clan moves reserve space without mixing automatic home placements", () => {
  const result = build("home", { "#A1": "b" });
  assert.deepEqual(members(result, "a"), ["#A2"]);
  assert.deepEqual(members(result, "b"), ["#A1"]);
  assert.deepEqual(members(result, "ws"), ["#B1"]);
  assert.equal(result.unassignedPlayers[0].tag, "#B2");
});

test("manual removal backfills from the same home clan", () => {
  const result = build("home", { "#A1": "removed" });
  assert.deepEqual(members(result, "a"), ["#A2"]);
  assert.deepEqual(members(result, "b"), ["#B1"]);
  assert.equal(result.players.find(player => player.tag === "#A1").assignedCwlClan, null);
});

test("missed CWL attacks exclude from home and overflow, unless manually assigned", () => {
  const cwl = [stats("#A1", 3, { missedAttacks: 1, attacksUsed: 4, possibleAttacks: 5 })];
  const result = build("home", {}, { excludeMissedAttacks: true }, regular, cwl);
  assert.deepEqual(members(result, "a"), ["#A2"]);
  assert.equal(result.players.find(player => player.tag === "#A1").assignedCwlClan, null);
  const forced = build("home", { "#A1": "ws" }, { excludeMissedAttacks: true }, regular, cwl);
  assert.deepEqual(members(forced, "ws"), ["#A1"]);
});

test("empty clans, no history, and generous roster sizes work in both modes", () => {
  for (const lineupMode of ["family", "home"]) {
    const empty = buildCwlLineupHelper([], [], {}, [], {}, overflow, { lineupMode });
    assert.deepEqual(empty.players, []);
    assert.equal(empty.clans.length, 1);
    const result = build(lineupMode, {}, { rosterSizes: {} }, []);
    assert.equal(result.unassignedPlayers.length, 0);
    assert.ok(result.players.every(player => Number.isFinite(player.mainScore)));
  }
});

async function getPage(harness, query = {}) {
  let locals;
  await harness.handler("/lineup")({ query, adminClans: clans }, {
    render(view, values) { assert.equal(view, "admin"); locals = values; },
  }, error => { throw error; });
  return locals;
}

test("lineup loads WS CWL stats for current home-clan members without adding WS to the primary pool", async () => {
  for (const lineupMode of ["family", "home"]) {
    const harness = createHarness();
    const page = await getPage(harness, { lineupMode });
    assert.ok(harness.calls.some(call => call.tag === overflow.tag));
    const player = page.lineupHelper.players.find(player => player.tag === "#A1");
    assert.equal(player.cwlWarsParticipated, 1);
    assert.equal(player.cwlAvgStars, 3);
    assert.equal(player.homeClan, "Alpha");
    assert.equal(page.clans.length, 2);
    assert.equal(page.lineupHelper.clans.filter(clan => clan.isOverflow).length, 1);
  }
});

test("WS history falls back to older seasons and counts only completed wars", async () => {
  let wsCalls = 0;
  const harness = createHarness({ getCwl: async tag => {
    if (tag !== overflow.tag) return { rounds: [] };
    wsCalls++;
    if (wsCalls === 1) throw new Error("Season unavailable");
    const completed = war(overflow, clans[0].members[0]);
    return { rounds: [{ warTags: [completed, { ...completed, state: "inWar" }] }] };
  } });
  const page = await getPage(harness);
  assert.equal(page.lineupHelper.players.find(player => player.tag === "#A1").cwlWarsParticipated, 1);
  assert.equal(wsCalls, 3);
});

test("unavailable WS history does not prevent lineup generation", async () => {
  const harness = createHarness({ getCwl: async () => { throw new Error("Unavailable"); } });
  const page = await getPage(harness, { lineupMode: "home" });
  assert.equal(page.lineupHelper.players.length, 4);
  assert.ok(page.lineupHelper.players.every(player => player.cwlRank === null));
});

test("both page modes render, with mode controls, home ranks, and override state", async () => {
  for (const lineupMode of ["family", "home"]) {
    const page = await getPage(createHarness(), { lineupMode });
    const html = await ejs.renderFile(path.resolve(__dirname, "../views/admin.ejs"), page);
    assert.ok(html.includes('id="familyLineupMode"'));
    assert.ok(html.includes('id="homeLineupMode"'));
    assert.ok(html.includes(`type="hidden" name="lineupMode" value="${lineupMode}"`));
    assert.equal(html.includes('id="rankedPlayerHomeFilter"'), lineupMode === "home");
    assert.ok(html.includes("Witch Slapped"));
  }
});

test("invalid mode defaults to family", async () => {
  assert.equal((await getPage(createHarness(), { lineupMode: "invalid" })).lineupMode, "family");
});

test("override saves and resets preserve home mode and roster settings", async () => {
  for (const route of ["/overrides", "/overrides/reset"]) {
    const harness = createHarness();
    let location;
    await harness.handler(route, "post")({ body: {
      playerTag: "#A1", destination: "b", lineupMode: "home", lineupPreset: "exclude-missed-attacks",
      aFormat: "30", aRosterSize: "12", wsRosterSize: "8",
    } }, { redirect(value) { location = value; } }, error => { throw error; });
    const query = new URL(location, "http://localhost").searchParams;
    assert.equal(query.get("lineupMode"), "home");
    assert.equal(query.get("lineupPreset"), "exclude-missed-attacks");
    assert.equal(query.get("aFormat"), "30");
    assert.equal(query.get("aRosterSize"), "12");
    assert.equal(query.get("wsRosterSize"), "8");
    assert.equal(harness.saved.length, 1);
  }
});
