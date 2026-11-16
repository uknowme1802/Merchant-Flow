// One-off migration: the "user" role was renamed to "agent". Run once per database after
// deploying the rename. Safe to run twice: the second run finds nothing to change.
//
//   MONGO_URI=... node scripts/migrateUserRoleToAgent.js            change the stored roles
//   MONGO_URI=... DRY_RUN=true node scripts/migrateUserRoleToAgent.js   only count them
//
// Until it has run, the API reads a stored "user" as "agent" (constants/roles.js), so nothing
// breaks in between.
require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");

async function migrate() {
    if (!process.env.MONGO_URI) {
        console.error("MONGO_URI is not set. Aborting!");
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);

    const filter = { role: "user" };
    const found = await User.countDocuments(filter);

    if (process.env.DRY_RUN === "true") {
        console.log(`Dry run: ${found} user(s) have the old "user" role. Nothing was changed.`);
    } else {
        // updateMany does not run schema validators, so the old value can be matched and replaced.
        const result = await User.updateMany(filter, { $set: { role: "agent" } });
        console.log(`Changed ${result.modifiedCount} of ${found} user(s) from "user" to "agent".`);
    }

    await mongoose.disconnect();
}

migrate().catch((err) => {
    console.error("Migration failed:", err.message);
    process.exit(1);
});
