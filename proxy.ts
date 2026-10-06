import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/inventory",
  "/grocery",
  "/recipes",
  "/plan",
  "/settings",
  "/join",
];

const AUTH_PAGES = ["/login", "/signup"];

function hasSession(request: NextRequest): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return false;
  const ref = new URL(url).hostname.split(".")[0];
  return request.cookies.getAll().some((cookie) => {
    return (
      cookie.name === `sb-${ref}-auth-token` ||
      cookie.name.startsWith(`sb-${ref}-auth-token.`)
    );
  });
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = hasSession(request);

  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(session ? "/inventory" : "/login", request.url),
    );
  }

  const needsAuth = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (needsAuth && !session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (AUTH_PAGES.some((page) => pathname === page) && session) {
    return NextResponse.redirect(new URL("/inventory", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
