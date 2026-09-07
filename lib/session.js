import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "pcogs_session";
const MAX_AGE = 60 * 60 * 24 * 7;

function secret() {
  return process.env.SESSION_SECRET || "pcogs-dev-session-secret-change-me";
}

function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function makeSessionToken(session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed?.name || !["requester", "factory"].includes(parsed?.role)) return null;
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getSession() {
  const store = await cookies();
  return parseSessionToken(store.get(COOKIE_NAME)?.value);
}

export async function setSession(session) {
  const store = await cookies();
  const payload = { ...session, exp: Date.now() + MAX_AGE * 1000 };
  store.set(COOKIE_NAME, makeSessionToken(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}
