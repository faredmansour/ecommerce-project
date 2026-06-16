const redis = require("redis");
const logger = require("./logger");

const client = redis.createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
});

client.on("error", (err) => {
  logger.error(`Redis error: ${err.message}`);
});

const connectRedis = async () => {
  try {
    if (!client.isOpen) {
      await client.connect();
    }
    logger.info("Redis connected");
  } catch (err) {
    logger.error(`Redis connection failed: ${err.message}`);
  }
};

const getCache = async (key) => {
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.error(`Redis get error: ${err.message}`);
    return null;
  }
};

const setCache = async (key, value, ttl = 300) => {
  try {
    await client.set(key, JSON.stringify(value), { EX: ttl });
  } catch (err) {
    logger.error(`Redis set error: ${err.message}`);
  }
};

const invalidateCacheByPattern = async (pattern) => {
  try {
    const keys = [];
    for await (const key of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      keys.push(key);
    }
    if (keys.length) {
      await client.del(keys);
    }
  } catch (err) {
    logger.error(`Redis invalidate error: ${err.message}`);
  }
};

module.exports = {
  client,
  connectRedis,
  getCache,
  setCache,
  invalidateCacheByPattern,
};
