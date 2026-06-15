// scripts/testWarLog.js
require("dotenv").config();

const clans = require("../config/clans");
const { getClanWarLog } = require("../services/clashApi");

async function main() {
    try {
        for (const clan of clans) {
            console.log("\n==============================");
            console.log(`War log for ${clan.key} - ${clan.tag}`);
            console.log("==============================\n");

            const warLog = await getClanWarLog(clan.tag, 1);

            console.dir(warLog, { depth: null });
        }
    } catch (error) {
        console.error("War log test failed.");

        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
        } else {
            console.error(error.message);
        }

        process.exit(1);
    }
}

main();