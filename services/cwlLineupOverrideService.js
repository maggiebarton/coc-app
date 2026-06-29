const fs = require("fs/promises");
const path = require("path");

const OVERRIDE_FILE = path.join(
  __dirname,
  "..",
  "data",
  "cwl-lineup-overrides.json"
);

function normalizeTag(tag) {
  const normalized = String(tag || "").trim().toUpperCase();

  if (!normalized) return null;

  return normalized.startsWith("#") ? normalized : `#${normalized}`;
}

async function readCwlLineupOverrides() {
  try {
    const contents = await fs.readFile(OVERRIDE_FILE, "utf8");
    const overrides = JSON.parse(contents);

    return overrides && typeof overrides === "object" ? overrides : {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function saveCwlLineupOverride(playerTag, destination) {
  const tag = normalizeTag(playerTag);

  if (!tag) throw new Error("A player tag is required");

  const overrides = await readCwlLineupOverrides();

  if (destination === "automatic") {
    delete overrides[tag];
  } else {
    overrides[tag] = destination;
  }

  await fs.mkdir(path.dirname(OVERRIDE_FILE), { recursive: true });
  await fs.writeFile(OVERRIDE_FILE, `${JSON.stringify(overrides, null, 2)}\n`);

  return overrides;
}

async function clearCwlLineupOverrides() {
  try {
    await fs.unlink(OVERRIDE_FILE);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

module.exports = {
  clearCwlLineupOverrides,
  normalizeTag,
  readCwlLineupOverrides,
  saveCwlLineupOverride,
};
