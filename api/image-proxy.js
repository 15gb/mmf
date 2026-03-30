export default async function handler(req, res) {
  try {
    const { url } = req.query || {};
    if (!url || typeof url !== "string") {
      res.status(400).send("Missing url");
      return;
    }
    const decoded = decodeURIComponent(url);
    if (!/^https?:\/\//i.test(decoded)) {
      res.status(400).send("Invalid url");
      return;
    }

    const response = await fetch(decoded, {
      // Avoid sending problematic headers
      redirect: "follow",
    });

    if (!response.ok) {
      res.status(response.status).send(`Upstream error: ${response.statusText}`);
      return;
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(buffer);
  } catch (e) {
    res.status(500).send("Proxy error");
  }
}
