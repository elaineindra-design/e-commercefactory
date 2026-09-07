const DATA_KEY = "pcogs:data:v1";

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function hasRemoteStore() {
  return Boolean(redisConfig());
}

async function command(args) {
  const config = redisConfig();
  if (!config) throw new Error("Remote store not configured");
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
  if (!hasRemoteStore()) return { prs: [] };
  const raw = await command(["GET", DATA_KEY]);
  if (!raw) return { prs: [] };
  try {
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.prs) ? parsed : { prs: [] };
  } catch {
    return { prs: [] };
  }
}

export async function writeData(data) {
  if (!hasRemoteStore()) return false;
  await command(["SET", DATA_KEY, JSON.stringify(data)]);
  return true;
}
