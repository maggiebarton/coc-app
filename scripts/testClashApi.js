require("dotenv").config();

const {
    getAllClanInfo,
    getAllClanMembers
} = require("../services/clanService");

async function main() {
    try {
        console.log("\n=== Testing Clan Service Logic ===\n");

        console.log("\n==============================");
        console.log("PART 1: Clan info for all 3 clans");
        console.log("==============================\n");

        const clanInfoResults = await getAllClanInfo();

        console.dir(clanInfoResults, { depth: null });

        console.log("\n==============================");
        console.log("PART 2: Member lists for all 3 clans");
        console.log("==============================\n");

        const memberResults = await getAllClanMembers();

        console.dir(memberResults, { depth: null });

        console.log("\n=== Test complete ===\n");
    } catch (error) {
        console.error("\nClash API test failed.");

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