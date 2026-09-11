import { NextResponse } from "next/server";
import { getSession } from "../../../lib/session";
import { hasRemoteStore, readData } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const secret = (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ""
  ).trim();

  const result = {
    remoteConfigured: hasRemoteStore(),
    supabaseUrlConfigured: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseSecretConfigured: Boolean(secret),
    supabaseKeyType: !secret ? "none" : secret.startsWith("sb_secret_") ? "secret" : "legacy-service-role",
    storeReadOk: false,
    prCount: null,
  };

  if (!result.remoteConfigured) {
    return NextResponse.json(result);
  }

  try {
    const data = await readData();
    result.storeReadOk = true;
    result.prCount = Array.isArray(data?.prs) ? data.prs.length : 0;
  } catch (error) {
    result.storeError = String(error?.message || error || "Unknown storage error").slice(0, 160);
  }

  return NextResponse.json(result);
}
