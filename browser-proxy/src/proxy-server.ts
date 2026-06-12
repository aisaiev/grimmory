import express from "express";
import { BrowserPool } from "./browser-pool.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

const pool = new BrowserPool(3);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", activePages: pool.activePageCount });
});

app.post("/fetch", async (req, res) => {
  const { url, type } = req.body;

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "Missing or invalid url" });
    return;
  }

  const responseType = type === "json" ? "json" : "html";

  const page = await pool.acquirePage();

  try {
    const navigationResponse = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    if (!navigationResponse) {
      res.status(502).json({ error: "Navigation returned no response" });
      return;
    }

    await page
      .waitForLoadState("networkidle", { timeout: 20000 })
      .catch(() => {});

    await page.waitForTimeout(1000);

    const finalUrl = page.url();

    await page.waitForLoadState("domcontentloaded").catch(() => {});

    let content: string;
    if (responseType === "json") {
      content = await navigationResponse.text();
    } else {
      content = await page.content();
    }

    res.json({ content, url: finalUrl });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Proxy fetch failed";
    res.status(502).json({ error: message });
  } finally {
    pool.releasePage(page);
  }
});

const PORT = parseInt(process.env.PROXY_PORT || "7350", 10);

async function start(): Promise<void> {
  await pool.initialize();
  app.listen(PORT, () => {
    console.log(`browser-proxy listening on :${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start proxy:", err);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  await pool.close();
  process.exit(0);
});
