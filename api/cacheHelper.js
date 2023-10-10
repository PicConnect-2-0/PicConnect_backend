const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS_URL);

async function fetchFromCache(key, fetchFunction, expireTime = 3600) {
    let data = await redis.smembers(key);
    if (data && data.length > 0) {
        // Assuming that your data is stored as a JSON string in the set
        return data.map(item => JSON.parse(item));
    } else {
        data = await fetchFunction();

        if (data && data.length > 0) {
            // Storing each item in the set as a JSON string
            await Promise.all(data.map(item => redis.sadd(key, JSON.stringify(item))));
            await redis.expire(key, expireTime);
        }
        return data;
    }
}

async function invalidateCache(...keys) {
    try {
        await Promise.all(keys.map(key => redis.del(key)));
        console.log("Invalidating cache");
    } catch (err) {
        console.error('Error invalidating cache:', err);
        throw err;
    }
}

  

module.exports = { fetchFromCache, invalidateCache };