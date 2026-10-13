import fs from "node:fs";
import path from "node:path";
import type { Browser, Page } from "puppeteer-core";
import { chromeDir, screenshotPath, withSeat } from "./jail.ts";
import { assertPublicUrl } from "./url.ts";


type BrowserModule = typeof import("puppeteer-core");

const orgBrowsers = new Map<string, { browser: Browser; page: Page }>();

async function puppeteer(): Promise<BrowserModule> {
  return import("puppeteer-core");
}

async function screen(orgId = "default"): Promise<Page> {
  const existing = orgBrowsers.get(orgId);
  if (existing) {
    if (existing.browser.connected && !existing.page.isClosed()) {
      return existing.page;
    }
    try {
      if (existing.browser.connected) await existing.browser.close();
    } catch {
      // Ignore error during cleanup
    }
    orgBrowsers.delete(orgId);
  }

  const launched = await puppeteer();
  const dir = chromeDir(orgId);
  fs.mkdirSync(dir, { recursive: true });
  const browserInstance = await launched.default.launch({
    executablePath: process.env.CUBES_CHROME || "/usr/bin/google-chrome",
    headless: true,
    userDataDir: dir,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const pageInstance = await browserInstance.newPage();
  await pageInstance.setViewport({ width: 1280, height: 800 });
  await pageInstance.setRequestInterception(true);
  pageInstance.on("request", async (req) => {
    try {
      await assertPublicUrl(req.url());
      await req.continue();
    } catch {
      await req.abort("accessdenied");
    }
  });

  orgBrowsers.set(orgId, { browser: browserInstance, page: pageInstance });
  return pageInstance;
}

export async function closeBrowsers(orgId?: string): Promise<void> {
  if (orgId) {
    const existing = orgBrowsers.get(orgId);
    if (existing) {
      try {
        if (existing.browser.connected) await existing.browser.close();
      } catch {
        // Ignore error
      }
      orgBrowsers.delete(orgId);
    }
    return;
  }
  for (const val of orgBrowsers.values()) {
    try {
      if (val.browser.connected) await val.browser.close();
    } catch {
      // Ignore error
    }
  }
  orgBrowsers.clear();
}

async function shot(current: Page, orgId = "default"): Promise<void> {
  const dest = screenshotPath(orgId);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await current.screenshot({ path: dest, type: "png" });
}

export async function browse(
  name: string,
  rawUrl: string,
  orgId = "default",
  abortSignal?: AbortSignal,
): Promise<{ title: string; text: string; url: string }> {
  const url = await assertPublicUrl(rawUrl);
  return withSeat(name, async () => {
    if (abortSignal?.aborted) throw new Error("Operation aborted.");
    const current = await screen(orgId);
    const abortHandler = () => {
      try {
        void current.close().catch(() => {});
      } catch {}
    };
    if (abortSignal) {
      abortSignal.addEventListener("abort", abortHandler, { once: true });
    }
    try {
      await current.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 20_000 });
      const title = await current.title();
      const text = await current.evaluate(() => document.body?.innerText?.slice(0, 8000) ?? "");
      await shot(current, orgId);
      return { title, text, url: current.url() };
    } finally {
      if (abortSignal) {
        abortSignal.removeEventListener("abort", abortHandler);
      }
    }
  }, abortSignal);
}

export async function clickPage(name: string, target: string, orgId = "default"): Promise<string> {
  return withSeat(name, async () => {
    const current = await screen(orgId);
    const selector = target.trim();
    if (selector.startsWith("#") || selector.startsWith(".") || selector.startsWith("[")) {
      await current.click(selector);
    } else {
      await current.evaluate((label) => {
        const element = [...document.querySelectorAll("a, button, input, [role='button']")].find((node) =>
          (node.textContent || "").trim().includes(label),
        ) as HTMLElement | undefined;
        if (!element) throw new Error("missing");
        element.click();
      }, selector);
    }
    await shot(current, orgId);
    return current.url();
  });
}

export async function typePage(name: string, text: string, target?: string, orgId = "default"): Promise<void> {
  await withSeat(name, async () => {
    const current = await screen(orgId);
    if (target?.trim()) {
      await current.click(target.trim());
    }
    await current.keyboard.type(text);
    await shot(current, orgId);
  });
}

