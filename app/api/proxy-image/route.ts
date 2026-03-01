import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) return new NextResponse('Missing url', { status: 400 });

    try {
        const resp = await axios.get(url, { responseType: 'arraybuffer' });
        const contentType = resp.headers['content-type'] || 'image/jpeg';
        return new NextResponse(resp.data, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000'
            }
        });
    } catch (e) {
        return new NextResponse('Error fetching image', { status: 500 });
    }
}
