import fs from "node:fs";
import path from "node:path";
import type { Browser, Page } from "puppeteer-core";
import { chromeDir, screenshotPath, withSeat } from "./jail.ts";
import { assertPublicUrl } from "./url.ts";


type BrowserModule = typeof import("puppeteer-core");

let browser: Browser | null = null;
let page: Page | null = null;

async function puppeteer(): Promise<BrowserModule> {
  return import("puppeteer-core");
}

async function screen(): Promise<Page> {
  if (browser && !browser.connected) {
    browser = null;
    page = null;
  }
  if (!browser) {
    const launched = await puppeteer();
    fs.mkdirSync(chromeDir(), { recursive: true });
    browser = await launched.default.launch({
      executablePath: process.env.CUBES_CHROME || "/usr/bin/google-chrome",
      headless: true,
      userDataDir: chromeDir(),
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
  }
  if (!page || page.isClosed()) {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      try {
        await assertPublicUrl(req.url());
        await req.continue();
      } catch {
        await req.abort("accessdenied");
      }
    });
  }
  return page;
}

async function shot(current: Page): Promise<void> {
  fs.mkdirSync(path.dirname(screenshotPath()), { recursive: true });
  await current.screenshot({ path: screenshotPath(), type: "png" });
}

export async function browse(name: string, rawUrl: string): Promise<{ title: string; text: string; url: string }> {
  const url = await assertPublicUrl(rawUrl);
  return withSeat(name, async () => {
    const current = await screen();
    await current.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 20_000 });
    const title = await current.title();
    const text = await current.evaluate(() => document.body?.innerText?.slice(0, 8000) ?? "");
    await shot(current);
    return { title, text, url: current.url() };
  });
}

export async function clickPage(name: string, target: string): Promise<string> {
  return withSeat(name, async () => {
    const current = await screen();
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
    await shot(current);
    return current.url();
  });
}

export async function typePage(name: string, text: string, target?: string): Promise<void> {
  await withSeat(name, async () => {
    const current = await screen();
    if (target?.trim()) {
      await current.click(target.trim());
    }
    await current.keyboard.type(text);
    await shot(current);
  });
}
