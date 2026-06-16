//services/scoringService.js
const LEAGUE_ORDER = [
    "Legends",
    "Electro League",
    "Dragon League",
    "Titan League",
    "P.E.K.K.A. League",
    "Golem League",
    "Witch League",
    "Valkyrie League",
    "Wizard League",
    "Archer League",
    "Barbarian League",
    "Skeleton League",
    "Unranked"
];

function getLeagueGroup(member) {
    const leagueName = member.leagueTier?.name || member.league?.name || "Unranked";

    if (leagueName.startsWith("Legend League")) {
        return "Legends";
    }

    return leagueName;
}

function getLegendTierRank(member) {
    const name = member.leagueTier?.name || "";

    if (name === "Legend League I") return 1;
    if (name === "Legend League II") return 2;
    if (name === "Legend League III") return 3;

    return 99;
}

function buildLeagueScoreboard(clansWithMembers = []) {
    const allMembers = clansWithMembers.flatMap(clan =>
        clan.members.map(member => ({
            ...member,
            clanKey: clan.key,
            clanName: clan.name,
            leagueGroup: getLeagueGroup(member),
        }))
    );

    const groups = new Map();

    for (const member of allMembers) {
        if (!groups.has(member.leagueGroup)) {
            groups.set(member.leagueGroup, []);
        }

        groups.get(member.leagueGroup).push(member);
    }

    return [...groups.entries()]
        .map(([leagueName, members]) => ({
            leagueName,
            members: members
                .sort((a, b) => {
                    if (leagueName === "Legends") {
                        const tierDiff =
                            getLegendTierRank(a) - getLegendTierRank(b);

                        if (tierDiff !== 0) {
                            return tierDiff;
                        }
                    }

                    return (b.trophies || 0) - (a.trophies || 0);
                })
                .map((member, index) => ({
                    ...member,
                    scoreboardRank: index + 1
                }))
        }))
        .sort((a, b) => {
            return (
                LEAGUE_ORDER.indexOf(a.leagueName) -
                LEAGUE_ORDER.indexOf(b.leagueName)
            );
        });
}

module.exports = {
    getLeagueGroup,
    getLegendTierRank,
    buildLeagueScoreboard
}