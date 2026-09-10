import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, sep, extname } from "node:path";

const root = resolve("out");
const config = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
const policy = config.app.security.csp;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };
const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let file = resolve(root, "." + pathname);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    const data = await readFile(file);
    const headers = {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Cache-Control": pathname.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-cache",
    };
    if (extname(file) === ".html") {
      const hashes = [...data.toString("utf8").matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
        .filter(match => match[1].trim())
        .map(match => "'sha256-" + createHash("sha256").update(match[1]).digest("base64") + "'");
      headers["Content-Security-Policy"] = Object.entries({ ...policy, "script-src": "'self' " + hashes.join(" "), "frame-ancestors": "'none'" })
        .map(([key,value]) => key + " " + value).join("; ");
    }
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : data);
  } catch (error) {
    res.writeHead(error.code === "ENOENT" ? 404 : 400).end("Not found");
  }
});
server.listen(Number(process.env.PORT ?? 3000), "127.0.0.1", () => {
  console.log("DraftSim static preview on http://127.0.0.1:" + server.address().port);
});
