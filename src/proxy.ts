import { NextResponse, type NextRequest } from "next/server";
import { canonicalRedirect } from "@/lib/http/canonical";

export function proxy(req: NextRequest) {
  const target = canonicalRedirect({
    host: req.headers.get("host"),
    pathname: req.nextUrl.pathname,
    search: req.nextUrl.search,
    method: req.method,
    appUrl: process.env.APP_URL?.trim().replace(/\/+$/, ""),
    vercelEnv: process.env.VERCEL_ENV,
  });
  return target ? NextResponse.redirect(target, 308) : NextResponse.next();
}

export const config = {
  matcher: ["/((?!u/|api/|_next/|favicon|icon|apple-icon|logo).*)"],
};
