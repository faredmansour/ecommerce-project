const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

// Test environment defaults (must be set before app/controllers load secrets).
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.JWT_EXPIRES_IN = "15m";
process.env.PAYMOB_CHECKOUT_RESULT_KEYRING = JSON.stringify({ "test-v2": "11".repeat(32) });
process.env.PAYMOB_CHECKOUT_RESULT_ACTIVE_KEY_ID = "test-v2";

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});
