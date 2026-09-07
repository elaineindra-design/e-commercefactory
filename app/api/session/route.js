import { NextResponse } from "next/server";
import { clearSession, getSession, setSession } from "../../../lib/session";

export async function GET() {
  const session = await getSession();
  return NextResponse.json({ session: session ? { name: session.name, role: session.role } : null });
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const role = body?.role;
  const name = String(body?.name || "").trim().slice(0, 80);
  const password = String(body?.password || "");

  if (!name) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!["requester", "factory"].includes(role)) return NextResponse.json({ error: "Choose Requester or Factory." }, { status: 400 });

  if (role === "requester") {
    const expected = process.env.REQUESTER_PASSWORD || "requester123";
    if (password !== expected) return NextResponse.json({ error: "Incorrect requester password." }, { status: 401 });
  }

  await setSession({ name, role });
  return NextResponse.json({ session: { name, role } });
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
