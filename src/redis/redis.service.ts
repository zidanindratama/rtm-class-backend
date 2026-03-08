import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch {
      // No-op: service shutdown should continue even if Redis quit fails.
    } finally {
      this.client = null;
    }
  }

  async get(key: string): Promise<string | null> {
    const redis = this.getClient();
    if (!redis) return null;

    try {
      return await redis.get(key);
    } catch (error) {
      this.logger.warn(
        `Redis GET failed (${key}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async setEx(key: string, value: string, ttlSec: number): Promise<void> {
    const redis = this.getClient();
    if (!redis) return;

    try {
      await redis.set(key, value, 'EX', ttlSec);
    } catch (error) {
      this.logger.warn(
        `Redis SET failed (${key}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private getClient(): Redis | null {
    if (this.client) return this.client;

    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) return null;

    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    this.client.on('error', (error) => {
      this.logger.warn(`Redis unavailable: ${error.message}`);
    });

    void this.client.connect().catch(() => null);
    return this.client;
  }
}
