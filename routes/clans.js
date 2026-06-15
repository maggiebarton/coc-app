//routes/clans.js
const express = require("express");
const router = express.Router();

const { getAllClanInfo } = require("../services/clanService");

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

module.exports = router;