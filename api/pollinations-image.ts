type Q = { [k: string]: string | string[] | undefined };

export default async function handler(req: { query?: Q }, res: any) {
  try {
    const q = req.query || {};
    const prompt = typeof q.prompt === "string" ? q.prompt : "";
    if (!prompt) {
      res.status(400).send("Missing prompt");
      return;
    }
    const width = typeof q.width === "string" ? q.width : "1024";
    const height = typeof q.height === "string" ? q.height : "1024";
    const seed = typeof q.seed === "string" ? q.seed : "0";
    const enhance = typeof q.enhance === "string" ? q.enhance : "false";
    const model = typeof q.model === "string" ? q.model : "flux-schnell";

    const key =
      process.env.VITE_POLLINATIONS_API_KEY ||
      process.env.POLLINATIONS_API_KEY ||
      "";
    if (!key) {
      res.status(500).send("Pollinations API key not configured");
      return;
    }

    const upstream = `https://gen.pollinations.ai/image/${encodeURIComponent(
      prompt
    )}?model=${encodeURIComponent(model)}&width=${encodeURIComponent(
      width
    )}&height=${encodeURIComponent(height)}&seed=${encodeURIComponent(
      seed
    )}&enhance=${encodeURIComponent(enhance)}&key=${encodeURIComponent(key)}`;

    const resp = await fetch(upstream, { redirect: "follow" });
    if (!resp.ok) {
      res.status(resp.status).send(`Upstream error: ${resp.statusText}`);
      return;
    }
    const type = resp.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await resp.arrayBuffer());
    res.setHeader("Content-Type", type);
    res.setHeader(
      "Cache-Control",
      "public, max-age=60, stale-while-revalidate=60"
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(buf);
  } catch {
    res.status(500).send("Proxy error");
  }
}
