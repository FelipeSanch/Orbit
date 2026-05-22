import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/", "/login"];

// Better Auth uses two cookie names depending on transport:
//   - http (local dev): `better-auth.session_token`
//   - https (production): `__Secure-better-auth.session_token`
// The `__Secure-` prefix is mandated by the cookie spec when the Secure
// attribute is set. Checking both ensures the middleware sees the
// session regardless of environment.
const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

export async function middleware(request: NextRequest) {
  // Treat empty-value cookies as absent. A signed-out browser sometimes
  // briefly holds an emptied cookie before the Set-Cookie clear takes
  // full effect; without this check, an emptied cookie would still
  // count as "authenticated" and bounce /login → /chat under no session.
  const sessionCookie = SESSION_COOKIE_NAMES.map((n) =>
    request.cookies.get(n),
  ).find((c) => c && c.value);
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
