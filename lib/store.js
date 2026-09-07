const DATA_KEY = "pcogs:data:v1";
const SUPABASE_ROW_ID = "main";

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || "https://clajgzxalhjrtjfccohn.supabase.co";
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  return url && secretKey ? { url: url.replace(/\/$/, ""), secretKey } : null;
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function hasRemoteStore() {
  return Boolean(supabaseConfig() || redisConfig());
}

async function supabaseRead() {
  const config = supabaseConfig();
  const response = await fetch(
    `${config.url}/rest/v1/cogs_shared_state?id=eq.${encodeURIComponent(SUPABASE_ROW_ID)}&select=data`,
    {
      headers: {
        apikey: config.secretKey,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );
  if (!response.ok) throw new Error(`Supabase read failed (${response.status})`);
  const rows = await response.json();
  const data = rows?.[0]?.data;
  return data && Array.isArray(data.prs) ? data : { prs: [] };
}

async function supabaseWrite(data) {
  const config = supabaseConfig();
  const response = await fetch(
    `${config.url}/rest/v1/cogs_shared_state?id=eq.${encodeURIComponent(SUPABASE_ROW_ID)}`,
    {
      method: "PATCH",
      headers: {
        apikey: config.secretKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        data,
        updated_at: new Date().toISOString(),
      }),
      cache: "no-store",
    }
  );
  if (!response.ok) throw new Error(`Supabase write failed (${response.status})`);
  return true;
}

async function redisCommand(args) {
  const config = redisConfig();
  if (!config) throw new Error("Redis store not configured");
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Redis request failed (${response.status})`);
  const body = await response.json();
  if (body.error) throw new Error(body.error);
  return body.result;
}

export async function readData() {
  if (supabaseConfig()) return supabaseRead();
  if (!redisConfig()) return { prs: [] };

  const raw = await redisCommand(["GET", DATA_KEY]);
  if (!raw) return { prs: [] };
  try {
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.prs) ? parsed : { prs: [] };
  } catch {
    return { prs: [] };
  }
}

export async function writeData(data) {
  if (supabaseConfig()) return supabaseWrite(data);
  if (!redisConfig()) return false;
  await redisCommand(["SET", DATA_KEY, JSON.stringify(data)]);
  return true;
}
