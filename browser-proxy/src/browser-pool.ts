import { chromium, Browser, BrowserContext, Page } from "playwright";

export class BrowserPool {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private readonly maxPages: number;
  private activePages = 0;
  private destroyed = false;

  constructor(maxPages = 3) {
    this.maxPages = maxPages;
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1920, height: 1080 },
    });
  }

  async acquirePage(): Promise<Page> {
    while (this.activePages >= this.maxPages) {
      if (this.destroyed) throw new Error("Browser pool destroyed");
      await new Promise((r) => setTimeout(r, 100));
    }
    this.activePages++;
    return await this.context!.newPage();
  }

  releasePage(page: Page): void {
    this.activePages = Math.max(0, this.activePages - 1);
    page.close().catch(() => {});
  }

  get activePageCount(): number {
    return this.activePages;
  }

  async close(): Promise<void> {
    this.destroyed = true;
    await this.browser?.close();
  }
}
