import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://redis:6379', {
    maxRetriesPerRequest: null,
});

export const knowledgeQueue = new Queue('knowledge-sync-queue', { connection: connection as any });
