import { NextResponse, type NextRequest } from 'next/server';

/** Optional shared password. Set APP_PASSWORD in Vercel to require it; any username works. */
export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const header = req.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    try {
      const decoded = atob(encoded);
      const given = decoded.slice(decoded.indexOf(':') + 1);
      if (given === password) return NextResponse.next();
    } catch { /* fall through */ }
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="NRF Venue RFPs", charset="UTF-8"' },
  });
}

export const config = { matcher: ['/((?!_next/static|_next/image|icon.png|favicon.ico).*)'] };
