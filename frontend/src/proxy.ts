import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// หน้าที่ต้อง login ก่อนถึงจะเข้าได้
const protectedRoutes = ['/restaurants', '/home', '/orders', '/tables', '/menu', '/inventory', '/staff', '/reports', '/settings', '/dashboard', '/profile'];
const dashboardRoutes = ['/home', '/orders', '/tables', '/menu', '/inventory', '/staff', '/reports', '/settings', '/dashboard', '/profile'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('token')?.value;
  const activeRestaurantId = request.cookies.get('active_restaurant_id')?.value;

  const isProtected = protectedRoutes.some(route => pathname.startsWith(route));
  const isDashboard = dashboardRoutes.some(route => pathname.startsWith(route));

  // ยังไม่ login แล้วพยายามเข้าหน้าที่ต้องล็อค → กลับไปหน้า landing
  if (!token && isProtected) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // login แล้วแต่เข้าหน้า landing → ไปที่ dashboard
  if (token && pathname === '/') {
    return NextResponse.redirect(new URL('/restaurants', request.url));
  }

  if (token && isDashboard && !activeRestaurantId) {
    const url = new URL('/restaurants', request.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
