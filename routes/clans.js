//routes/clans.js
const express = require("express");
const router = express.Router();

const {
    getAllClanInfo,
    getClanByKey
} = require("../services/clanService");

router.get("/", async (req, res, next) => {
    try {
        const clans = await getAllClanInfo();

        res.render("clan", {
            title: "Clans Overview",
            clans
        });
    } catch (error) {
        next(error);
    }
});

router.get("/:clanKey", async (req, res, next) => {
    try {
        const rankBy = req.query.rankBy || "league";

        const clan = await getClanByKey(req.params.clanKey, rankBy);

        if (!clan) {
            return res.status(404).send("Clan not found");
        }

        res.render("clanDetails", {
            title: `${clan.clanInfo.name} Dashboard`,
            clan,
            rankBy
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;