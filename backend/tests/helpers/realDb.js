// A real MongoDB for tests that need what mocks cannot give: unique and partial indexes, and
// atomic updates racing each other. It runs in memory (mongodb-memory-server), so it needs no
// install and no connection string, locally or in CI.
//
//   const db = require("./helpers/realDb");
//   beforeAll(db.connect); afterEach(db.clear); afterAll(db.disconnect);

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let server;

const connect = async () => {
    server = await MongoMemoryServer.create();
    await mongoose.connect(server.getUri(), { dbName: "merchantflow_test" });
    // Build every index now, so unique and partial indexes are in place before the first write.
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
};

const clear = async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
};

const disconnect = async () => {
    await mongoose.disconnect();
    if (server) await server.stop();
};

module.exports = { connect, clear, disconnect };
