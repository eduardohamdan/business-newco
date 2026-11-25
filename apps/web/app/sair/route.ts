import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { identity, withSystem } from "@beos/db";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await withSystem((db) => identity.revokeSession(db, token));
  jar.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/", req.url), 303);
}
