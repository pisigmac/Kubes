import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That address is not a URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https pages can be opened.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    isPrivate(host)
  ) {
    throw new Error("The computer cannot open addresses on this machine.");
  }
  if (isIP(host)) return url;
  const looked = await lookup(host, { all: true, verbatim: true });
  if (looked.length === 0 || looked.some((entry) => isPrivate(entry.address))) {
    throw new Error("The computer cannot open addresses on this machine.");
  }
  return url;
}

function isPrivate(host: string): boolean {
  const version = isIP(host);
  if (version === 4) return isPrivateV4(host);
  if (version === 6) return isPrivateV6(host);
  return false;
}

function isPrivateV4(host: string): boolean {
  const [a, b] = host.split(".").map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateV6(host: string): boolean {
  const lower = host.toLowerCase();
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80") ||
    lower.startsWith("::ffff:127.") ||
    lower.startsWith("::ffff:10.") ||
    lower.startsWith("::ffff:192.168.")
  );
}
