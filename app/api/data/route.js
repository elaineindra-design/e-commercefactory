import { NextResponse } from "next/server";
import { getSession } from "../../../lib/session";
import { hasRemoteStore, readData, writeData } from "../../../lib/store";
import { mergeByRole } from "../../../lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasRemoteStore()) return NextResponse.json({ data: null, persistence: "local" });
  try {
    const data = await readData();
    return NextResponse.json({ data, persistence: "remote" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load shared data." }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasRemoteStore()) return NextResponse.json({ data: null, persistence: "local" });

  let body = {};
  try { body = await request.json(); } catch {}
  if (!body?.data || !Array.isArray(body.data.prs)) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  try {
    const current = await readData();
    const merged = mergeByRole(current, body.data, session);
    await writeData(merged);
    return NextResponse.json({ ok: true, persistence: "remote", data: merged });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to save shared data." }, { status: 500 });
  }
}
