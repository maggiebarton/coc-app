// routes/scoreboard.js
const express = require("express");
const router = express.Router();

const { getAllClansWithMembers } = require("../services/clanService");
const { buildLeagueScoreboard } = require("../services/scoringService");

router.get("/", async (req, res, next) => {
    try {
        const type = req.query.type || "leagues";

        const clans = await getAllClansWithMembers();

        const leagueScoreboard = buildLeagueScoreboard(clans);

        const leagueOptions = leagueScoreboard.map(
            group => group.leagueName
        );

        const selectedLeague =
            req.query.league ||
            leagueScoreboard[0]?.leagueName;

        const selectedLeagueGroup =
            leagueScoreboard.find(
                group => group.leagueName === selectedLeague
            ) || leagueScoreboard[0];

        res.render("scoreboard", {
            title: "Scoreboard",
            type,
            leagueOptions,
            selectedLeague,
            selectedLeagueGroup
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;