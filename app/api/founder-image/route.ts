import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_IMAGE_HOSTS = [
  'avatars.githubusercontent.com',
  'bookface-images.s3.amazonaws.com',
  'bookface-images.s3.us-west-2.amazonaws.com',
  'bookface-images.s3-us-west-2.amazonaws.com',
];

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    ALLOWED_IMAGE_HOSTS.includes(host) ||
    host === 'ycombinator.com' ||
    host.endsWith('.ycombinator.com')
  );
}

export async function GET(request: NextRequest) {
  const value = request.nextUrl.searchParams.get('url');
  if (!value) return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 });
  }

  if (url.protocol !== 'https:' || !isAllowedHost(url.hostname)) {
    return NextResponse.json({ error: 'Image host is not allowed' }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/*',
        'user-agent': 'FounderLens/0.1',
      },
      next: { revalidate: 86_400 },
    });
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
    if (!response.ok || !contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Image is unavailable' }, { status: 404 });
    }

    return new NextResponse(response.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Image is unavailable' }, { status: 502 });
  }
}
