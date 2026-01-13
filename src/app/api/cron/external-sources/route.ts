import { NextResponse } from 'next/server';
import {knowledgeQueue} from "@/lib/external-sources/queue";

export async function POST(req: Request) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await knowledgeQueue.add('sync-daily', {
        apiUrl: 'http://www.dondemineilstravels.com/api/v2/posts',
    }, {
        removeOnComplete: true,
        removeOnFail: 10
    });

    return NextResponse.json({ status: 'Sync job scheduled' });
}
