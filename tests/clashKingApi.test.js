const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function apiWith(get) {
  const filename = path.resolve(__dirname, "../services/clashKingApi.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, require: () => ({ get }),
  }, { filename });
  return module.exports;
}
function httpError(status) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
}

test("monthly CWL archive falls back to the first-day season ID on 404", async () => {
  const calls = [];
  const archive = { season: "2026-08-01", rounds: [{ warTags: [] }] };
  const api = apiWith(async url => {
    calls.push(url);
    if (url.endsWith("/2026-08")) throw httpError(404);
    return { data: archive };
  });
  assert.equal(await api.getCwl("#2JQY8Y0YP", "2026-08"), archive);
  assert.deepEqual(calls, [
    "https://api.clashk.ing/cwl/%232JQY8Y0YP/2026-08",
    "https://api.clashk.ing/cwl/%232JQY8Y0YP/2026-08-01",
  ]);
});

test("existing monthly archives are returned without a second request", async () => {
  let count = 0;
  const archive = { season: "2026-04" };
  const api = apiWith(async () => { count++; return { data: archive }; });
  assert.equal(await api.getCwl("#CLAN", "2026-04"), archive);
  assert.equal(count, 1);
});

test("explicitly dated seasons never fall back to a different CWL", async () => {
  for (const season of ["2026-06-16", "2026-08-01"]) {
    const calls = [];
    const api = apiWith(async url => { calls.push(url); throw httpError(404); });
    await assert.rejects(api.getCwl("#CLAN", season), /HTTP 404/);
    assert.deepEqual(calls, [`https://api.clashk.ing/cwl/%23CLAN/${season}`]);
  }
});

test("missing archives still report 404 after both season formats", async () => {
  let count = 0;
  const api = apiWith(async () => { count++; throw httpError(404); });
  await assert.rejects(api.getCwl("#CLAN", "2026-07"), /HTTP 404/);
  assert.equal(count, 2);
});

test("rate limits and server failures do not trigger season-format fallback", async () => {
  for (const status of [429, 500]) {
    let count = 0;
    const api = apiWith(async () => { count++; throw httpError(status); });
    await assert.rejects(api.getCwl("#CLAN", "2026-08"), new RegExp(`HTTP ${status}`));
    assert.equal(count, 1);
  }
});
