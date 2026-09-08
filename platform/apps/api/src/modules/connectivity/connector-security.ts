import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import type { Credentials } from "./contracts.js";

function encryptionKey(encoded = process.env.CONNECTIVITY_ENCRYPTION_KEY): Buffer {
  const key = Buffer.from(encoded ?? "", "base64");
  if (key.length !== 32) throw new Error("Server requires a 32-byte base64 CONNECTIVITY_ENCRYPTION_KEY before storing credentials");
  return key;
}
export function encryptCredentials(value: Credentials, context: string, key?: string): string {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}
export function decryptCredentials(value: string | null, context: string, key?: string): Credentials {
  if (!value) return {};
  const [version, iv, tag, content] = value.split(".");
  if (version !== "v1" || !iv || !tag || !content) throw new Error("Stored connector credentials are invalid");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(key), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(content, "base64")), decipher.final()]).toString("utf8")) as Credentials;
}

export function blockedAddress(address: string): boolean {
  let host = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(host) === 6) host = new URL(`http://[${host}]/`).hostname.replace(/^\[|\]$/g, "");
  if (host.startsWith("::ffff:")) {
    const suffix = host.slice(7);
    if (suffix.includes(".")) return blockedAddress(suffix);
    const parts = suffix.split(":");
    if (parts.length === 2) { const high = parseInt(parts[0]!, 16); const low = parseInt(parts[1]!, 16); return blockedAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`); }
  }
  if (host === "metadata.google.internal" || host === "metadata" || host === "::" || /^fe[89ab][0-9a-f]:/.test(host) || host.startsWith("ff") || host === "fd00:ec2::254") return true;
  if (isIP(host) === 4) {
    const [first, second] = host.split(".").map(Number);
    return first === 0 || first! >= 224 || (first === 169 && second === 254) || host === "100.100.100.200" || host === "168.63.129.16";
  }
  return false;
}

/** Origins are authorized by the server operator, never by a request or database setting. */
export function validateConnectorUrl(raw: string, allowed = process.env.CONNECTIVITY_ALLOWED_ORIGINS ?? ""): URL {
  const url = new URL(raw);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Connector URL must be HTTP(S), without embedded credentials, query or fragment");
  if (blockedAddress(url.hostname)) throw new Error("Metadata, link-local and unspecified connector addresses are blocked");
  const origins = allowed.split(",").map((s) => s.trim()).filter(Boolean).map((s) => new URL(s).origin);
  if (!origins.includes(url.origin)) throw new Error("Server administrator must add this exact origin to CONNECTIVITY_ALLOWED_ORIGINS");
  return url;
}

/** Resolves once and pins the destination, preventing a DNS rebind between validation and I/O. */
export async function connectorRequest(baseUrl: string, path: string, init: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string } = {}): Promise<string> {
  const started = Date.now();
  const base = validateConnectorUrl(baseUrl);
  const target = new URL(path || base.pathname, base);
  if (target.origin !== base.origin) throw new Error("Connector request may not change origin");
  const hostname = base.hostname.replace(/^\[|\]$/g, "");
  let dnsTimer: NodeJS.Timeout | undefined;
  const resolved = await Promise.race([
    lookup(hostname, { all: true }),
    new Promise<never>((_resolve, reject) => { dnsTimer = setTimeout(() => reject(new Error("Connector DNS lookup timed out")), 4_000); }),
  ]).finally(() => { if (dnsTimer) clearTimeout(dnsTimer); });
  if (!resolved.length || resolved.some((address) => blockedAddress(address.address))) throw new Error("Connector DNS resolved to a blocked address");
  const destination = resolved[0]!;
  return new Promise<string>((resolve, reject) => {
    const client = target.protocol === "https:" ? https : http;
    const request = client.request(target, {
      method: init.method ?? "GET", headers: { accept: "application/json", ...init.headers },
      // No automatic redirects. Use the original host for TLS identity verification.
      lookup: (_name, options, callback) => options.all ? callback(null, [destination]) : callback(null, destination.address, destination.family),
    }, (response) => {
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.resume(); reject(new Error(`Connector returned HTTP ${response.statusCode ?? "unknown"}; verify access and configuration`)); return;
      }
      const chunks: Buffer[] = []; let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2_000_000) { request.destroy(new Error("Connector response exceeds the 2 MB import limit")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      response.on("error", () => reject(new Error("Connector response was interrupted")));
    });
    const timer = setTimeout(() => request.destroy(new Error("Connector timed out after 8 seconds")), Math.max(1, 8_000 - (Date.now() - started)));
    request.on("close", () => clearTimeout(timer));
    request.on("error", () => reject(new Error("Connector request failed; check endpoint, TLS certificate and network access")));
    if (init.body) request.write(init.body);
    request.end();
  });
}
