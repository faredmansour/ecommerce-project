const dotenv = require("dotenv");
dotenv.config({ path: "./connection/config.env" });

const mongoose = require("mongoose");
const app = require("./app");
const logger = require("./utils/logger");
const { connectRedis } = require("./utils/cache");

const port = process.env.PORT || 8000;

async function start() {
  try {
    if (!process.env.DB_URL) {
      logger.error("DB_URL is not set. Create connection/config.env (see .env.example).");
      process.exit(1);
    }

    await mongoose.connect(process.env.DB_URL);
    logger.info("DB connection success");

    // Redis is optional — only attempt when a URL is configured.
    if (process.env.REDIS_URL) {
      await connectRedis();
    }

    app.listen(port, () => {
      logger.info(`Server is running on port ${port}`);
    });
  } catch (err) {
    logger.error(err.message);
    process.exit(1);
  }
}

start();
