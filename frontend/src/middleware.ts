import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// กำหนดหน้าที่จะ "ล็อค" (ต้องล็อกอินถึงจะเข้าได้)
// สามารถเพิ่ม path อื่นๆ ลงใน Array นี้ได้เลยครับ
const protectedRoutes = ['/dashboard', '/settings', '/profile'];

// หน้าที่ให้เฉพาะคน "ยังไม่ล็อกอิน" เข้า (ตอนนี้ไม่มีแล้ว เพราะ Home ก็ใช้ดูเป็น Dashboard ได้เลย)
const authRoutes: string[] = [];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Get token from cookies
  const token = request.cookies.get('token')?.value;

  // ตรวจสอบว่า path ปัจจุบันอยู่ในกลุ่ม 'หน้าล็อค' หรือไม่
  // (ใช้ .startsWith() เพื่อให้ครอบคลุม path ลูกๆ ด้วย เช่น /dashboard/projects)
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));

  // 1. ถ้าไม่ได้ล็อกอิน และกำลังเข้า 'หน้าล็อค'
  if (!token && isProtectedRoute) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  // ถ้าไม่ใช่ 2 กรณีด้านบน ก็ปล่อยผ่านให้แสดงหน้าเว็บปกติได้เลย!
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
