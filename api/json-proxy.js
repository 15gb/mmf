export default async function handler(req, res) {
  try {
    const { url } = req.query || {};
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Missing url" });
      return;
    }
    const decoded = decodeURIComponent(url);
    if (!/^https?:\/\//i.test(decoded)) {
      res.status(400).json({ error: "Invalid url" });
      return;
    }

    const response = await fetch(decoded, { redirect: "follow" });
    if (!response.ok) {
      res.status(response.status).json({ error: `Upstream error: ${response.statusText}` });
      return;
    }
    const data = await response.json();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=600, stale-while-revalidate=600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: "Proxy error" });
  }
}
