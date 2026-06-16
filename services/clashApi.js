//services/clashApi.js
const axios = require("axios");

const BASE_URL = "https://api.clashofclans.com/v1";

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

module.exports = {
    getClanInfo,
    getClanWarLog,
    getCurrentWar
};