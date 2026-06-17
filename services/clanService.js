//services/clanService.js
const clans = require("../config/clans");
const { getClanInfo } = require("./clashApi");

//helpers
function mapClanInfo(clan) {
    const totalWars =
        (clan.warWins || 0) +
        (clan.warLosses || 0) +
        (clan.warTies || 0);

    return {
        tag: clan.tag,
        name: clan.name,
        type: clan.type,
        description: clan.description,
        isFamilyFriendly: clan.isFamilyFriendly,
        badgeUrls: clan.badgeUrls,

        clanLevel: clan.clanLevel,
        clanPoints: clan.clanPoints,
        members: clan.members,

        requiredTrophies: clan.requiredTrophies,

        warFrequency: clan.warFrequency,
        warWinStreak: clan.warWinStreak,
        warWins: clan.warWins,
        warLosses: clan.warLosses,
        warTies: clan.warTies,
        isWarLogPublic: clan.isWarLogPublic,
        warLeague: clan.warLeague,

        totalWars,
        winPercentage: totalWars > 0
            ? ((clan.warWins / totalWars) * 100).toFixed(1)
            : "0.0"
    };
}

function splitClanResponse(clan) {
    const { memberList = [] } = clan;

    return {
        clanInfo: mapClanInfo(clan),
        members: memberList.map(member => ({
            ...member,
            displayRole: normalizeRole(member.role)
        }))
    };
}

function rankMembers(members, rankBy = "league") {
    const sortedMembers = [...members];

    if (rankBy === "donos") {
        sortedMembers.sort((a, b) => {
            return (b.donations || 0) - (a.donations || 0);
        });
    }
    else if (rankBy === "avgStars") {
        sortedMembers.sort((a, b) => {
            return (b.avgStars || 0) - (a.avgStars || 0);
        });
    } else {
        sortedMembers.sort((a, b) => {
            return (a.clanRank || 999) - (b.clanRank || 999);
        });
    }

    return sortedMembers.map((member, index) => ({
        ...member,
        displayRank: index + 1
    }));
}

function normalizeRole(role) {
    switch (role) {
        case "leader":
            return "Leader";

        case "coLeader":
            return "Co-Leader";

        case "admin":
            return "Elder";

        case "member":
            return "Member";

        default:
            return role;
    }
}

//single clan metadata
async function getClanByKey(clanKey, rankBy = "league") {
    const clanConfig = clans.find(clan => clan.key === clanKey);

    if (!clanConfig) {
        return null;
    }

    const clan = await getClanInfo(clanConfig.tag);
    const { clanInfo, members } = splitClanResponse(clan);

    return {
        ...clanConfig,
        clanInfo,
        members: rankMembers(members, rankBy)
    };
}

//just clans metadata
async function getAllClanInfo() {
    const results = await Promise.all(
        clans.map(async clanConfig => {
            const clan = await getClanInfo(clanConfig.tag);
            const { clanInfo } = splitClanResponse(clan);

            return {
                ...clanConfig,
                clanInfo
            };
        })
    );

    return results;
}

//just members list
async function getAllClanMembers() {
    const results = await Promise.all(
        clans.map(async clanConfig => {
            const clan = await getClanInfo(clanConfig.tag);
            const { members } = splitClanResponse(clan);

            return {
                ...clanConfig,
                members
            };
        })
    );

    return results;
}

//full json of clans metadata + members
async function getAllClansWithMembers() {
    const results = await Promise.all(
        clans.map(async clanConfig => {
            const clan = await getClanInfo(clanConfig.tag);
            const { clanInfo, members } = splitClanResponse(clan);

            return {
                ...clanConfig,
                clanInfo,
                members
            };
        })
    );

    return results;
}

module.exports = {
    getAllClanInfo,
    getAllClanMembers,
    getAllClansWithMembers,
    getClanByKey
};