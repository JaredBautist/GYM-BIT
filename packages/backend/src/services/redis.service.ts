import { createClient, type RedisClientType } from 'redis';

import { env } from '../config/env.js';

let _redis: RedisClientType | null = null;

export function getRedis(): RedisClientType {
  if (!_redis) {
    _redis = createClient({ url: env.REDIS_URL });

    _redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
  }
  return _redis;
}

export async function connectRedis(): Promise<void> {
  const redis = getRedis();
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export async function disconnectRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
