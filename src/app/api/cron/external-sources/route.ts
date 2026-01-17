import { NextResponse } from 'next/server';
import {knowledgeQueue} from "@/lib/external-sources/queue";

const parseCategoryIds = (value?: string | null) => {
    if (!value) return [];
    return value
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item));
};

export async function POST(req: Request) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const categoryIds = parseCategoryIds(process.env.DOND_POST_CATEGORY_IDS);
    if (categoryIds.length === 0) {
        return NextResponse.json({ error: 'No category IDs configured' }, { status: 400 });
    }

    await knowledgeQueue.add('knowledge-sync-queue', {
        apiUrl: process.env.DOND_POSTS_URL || 'https://malinicms.com/api/v2/posts',
        categories: categoryIds,
    }, {
        removeOnComplete: true,
        removeOnFail: 10
    });

    return NextResponse.json({ status: 'Sync job scheduled' });
}
