import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/", "/login"];

export async function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get("better-auth.session_token");
  const { pathname } = request.nextUrl;

  const isPublic =
    publicPaths.includes(pathname) ||
    pathname.startsWith("/api/auth");

  // Unauthenticated users can only access public pages
  if (!sessionCookie && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated users on login page go to chat
  if (sessionCookie && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
