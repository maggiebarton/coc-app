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
    const response = await axios.get(
      `${BASE_URL}/cwl/${encodeTag(clanTag)}/${season}`,
      {
        headers: {
          accept: "application/json"
        }
      }
    );
  
    return response.data;
  }
  
  module.exports = {
    getPreviousWars,
    getCwl
  };