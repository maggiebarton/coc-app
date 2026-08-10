//services/clashApi.js
const axios = require("axios");

const BASE_URL = "https://api.clashofclans.com/v1";
const CWL_WAR_CONCURRENCY = 8;
const CWL_CACHE_TTL_MS = 10 * 60 * 1000;
let activeCwlWarRequests = 0;
const pendingCwlWarRequests = [];
const currentCwlCache = new Map();

//helpers
function normalizeTag(tag) {
    return tag.startsWith("#") ? tag : `#${tag}`;
}

function encodeTag(tag) {
    return encodeURIComponent(normalizeTag(tag));
}

function getHeaders() {
    return {
        Authorization: `Bearer ${process.env.CLASH_API_KEY}`
    };
}

function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function requestWithRetry(operation, attempts = 3) {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            const status = error.response?.status;
            const retryable = !status || status === 429 || status >= 500;

            if (!retryable || attempt === attempts) throw error;

            const retryAfterSeconds = Number(error.response?.headers?.["retry-after"]);
            const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
                ? retryAfterSeconds * 1000
                : attempt * 350;
            await wait(delay);
        }
    }

    throw lastError;
}

//GET clan metadata
async function getClanInfo(clanTag) {
    const response = await axios.get(
        `${BASE_URL}/clans/${encodeTag(clanTag)}`,
        {
            headers: getHeaders()
        }
    );

    return response.data;
}

//GET current war
async function getCurrentWar(clanTag) {
    const response = await axios.get(
        `${BASE_URL}/clans/${encodeTag(clanTag)}/currentwar`,
        {
            headers: getHeaders()
        }
    );

    return response.data;
}

//GET war log
async function getClanWarLog(clanTag, limit = 10) {
    const response = await axios.get(
        `${BASE_URL}/clans/${encodeTag(clanTag)}/warlog`,
        {
            headers: getHeaders(),
            params: {
                limit
            }
        }
    );

    return response.data;
}

async function verifyPlayerToken(playerTag, token) {
    const response = await axios.post(
        `${BASE_URL}/players/${encodeTag(playerTag)}/verifytoken`,
        { token },
        { headers: getHeaders() }
    );

    return response.data;
}

//GET season start/end
async function getCurrentGoldPassSeason() {
    const response = await axios.get(
      `${BASE_URL}/goldpass/seasons/current`,
      {
        headers: getHeaders()
      }
    );
  
    return response.data;
  }

  //GET current CWL
  async function getCurrentCwlLeagueGroup(clanTag) {
    const response = await axios.get(
      `${BASE_URL}/clans/${encodeTag(clanTag)}/currentwar/leaguegroup`,
      {
        headers: getHeaders()
      }
    );
  
    return response.data;
  }

async function getCwlLeagueWar(warTag) {
    const response = await axios.get(
        `${BASE_URL}/clanwarleagues/wars/${encodeTag(warTag)}`,
        { headers: getHeaders() }
    );

    return response.data;
}

function runLimitedCwlWarRequest(warTag) {
    return new Promise((resolve, reject) => {
        const run = () => {
            activeCwlWarRequests += 1;
            requestWithRetry(() => getCwlLeagueWar(warTag))
                .then(resolve, reject)
                .finally(() => {
                    activeCwlWarRequests -= 1;
                    pendingCwlWarRequests.shift()?.();
                });
        };

        if (activeCwlWarRequests < CWL_WAR_CONCURRENCY) {
            run();
        } else {
            pendingCwlWarRequests.push(run);
        }
    });
}

async function loadCurrentCwl(clanTag) {
    const leagueGroup = await requestWithRetry(
        () => getCurrentCwlLeagueGroup(clanTag)
    );
    const warTags = [...new Set(
        (leagueGroup.rounds || []).flatMap(round => round.warTags || [])
            .filter(tag => tag && tag !== "#0")
    )];
    const warsByTag = new Map();
    const batchSize = 4;

    for (let index = 0; index < warTags.length; index += batchSize) {
        const batchTags = warTags.slice(index, index + batchSize);
        const batchResults = await Promise.allSettled(
            batchTags.map(runLimitedCwlWarRequest)
        );
        batchResults.forEach((result, batchIndex) => {
            if (result.status === "fulfilled") {
                const requestedTag = normalizeTag(batchTags[batchIndex]);
                warsByTag.set(requestedTag, {
                    ...result.value,
                    tag: result.value.tag || batchTags[batchIndex]
                });
            }
        });
    }

    return {
        ...leagueGroup,
        rounds: (leagueGroup.rounds || []).map(round => ({
            ...round,
            warTags: (round.warTags || []).map(tag => (
                (tag ? warsByTag.get(normalizeTag(tag)) : null) || tag
            ))
        }))
    };
}

function getCurrentCwl(clanTag) {
    const cacheKey = normalizeTag(clanTag);
    const cached = currentCwlCache.get(cacheKey);

    if (cached && Date.now() - cached.createdAt < CWL_CACHE_TTL_MS) {
        return cached.promise;
    }

    const promise = loadCurrentCwl(clanTag).catch(error => {
        currentCwlCache.delete(cacheKey);
        throw error;
    });
    currentCwlCache.set(cacheKey, { createdAt: Date.now(), promise });
    return promise;
}

module.exports = {
    getClanInfo,
    getClanWarLog,
    getCurrentWar,
    verifyPlayerToken,
    getCurrentGoldPassSeason,
    getCurrentCwlLeagueGroup,
    getCwlLeagueWar,
    getCurrentCwl
};
