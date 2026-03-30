type ProxyQuery = {
  url?: string | string[];
};

type ProxyRequest = {
  query?: ProxyQuery;
};

type ProxyResponse = {
  status: (code: number) => ProxyResponse;
  send: (body: string | Buffer) => void;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost") return true;
  if (h === "0.0.0.0") return true;
  if (h === "127.0.0.1") return true;
  if (h === "::1") return true;

  const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
  if (!isIPv4) return false;

  const parts = h.split(".").map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export default async function handler(req: ProxyRequest, res: ProxyResponse) {
  try {
    const raw = req.query?.url;
    if (!raw || typeof raw !== "string") {
      res.status(400).send("Missing url");
      return;
    }

    const decoded = decodeURIComponent(raw);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(decoded);
    } catch {
      res.status(400).send("Invalid url");
      return;
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      res.status(400).send("Invalid protocol");
      return;
    }

    if (isBlockedHostname(parsedUrl.hostname)) {
      res.status(400).send("Blocked host");
      return;
    }

    const upstream = await fetch(parsedUrl.toString(), { redirect: "follow" });
    if (!upstream.ok) {
      res.status(upstream.status).send(`Upstream error: ${upstream.statusText}`);
      return;
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(buffer);
  } catch {
    res.status(500).send("Proxy error");
  }
}
