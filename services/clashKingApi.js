//services/clashKingApi.js
const axios = require("axios");

const BASE_URL = "https://api.clashk.ing";

function normalizeTag(tag) {
    return tag.startsWith("#") ? tag : `#${tag}`;
}

function encodeTag(tag) {
    return encodeURIComponent(normalizeTag(tag));
}

async function getPreviousWars(clanTag, limit = 50, timestampStart = 0, timestampEnd = 9999999999) {
    const response = await axios.get(
        `${BASE_URL}/war/${encodeTag(clanTag)}/previous`,
        {
            params: {
                timestamp_start: timestampStart,
                timestamp_end: timestampEnd,
                limit
            },
            headers: {
                accept: "application/json"
            }
        }
    );

    return response.data;
}

async function getCwl(clanTag, season) {
    // Archives can use either YYYY-MM or YYYY-MM-01 for the same season.
    // Keep explicitly dated seasons (e.g. June's second CWL) distinct.
    const candidates = /^\d{4}-\d{2}$/.test(season)
      ? [season, `${season}-01`]
      : [season];

    for (const [index, candidate] of candidates.entries()) {
      try {
        const response = await axios.get(
          `${BASE_URL}/cwl/${encodeTag(clanTag)}/${candidate}`,
          { headers: { accept: "application/json" } }
        );
        return response.data;
      } catch (error) {
        if (error.response?.status !== 404 || index === candidates.length - 1) {
          throw error;
        }
      }
    }
  }
  
  module.exports = {
    getPreviousWars,
    getCwl
  };
