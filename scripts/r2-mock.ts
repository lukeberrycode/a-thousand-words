// A local stand-in for Cloudflare R2, so system tests and worktrees need no R2 account or secrets
// (ADR 0024). It speaks just enough of the S3 API for this app: PUT, GET, HEAD and DELETE of one
// object at `/<bucket>/<key>` (path-style; src/lib/r2-config.ts sets that when R2_ENDPOINT is set).
// Signatures aren't checked. Every response allows any origin, because the browser PUTs uploads to
// presigned URLs and loads images from the public URL, which is `http://localhost:<port>/<bucket>`.
//
//   tsx scripts/r2-mock.ts --port 3001 --dir .r2-mock    objects kept in a folder, across restarts
//   tsx scripts/r2-mock.ts --port 3101                   objects kept in memory (the system tests)

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { decodeAwsChunked, fileNameFor, isAwsChunked, parseObjectPath } from "../src/lib/r2-mock";

type StoredObject = { body: Uint8Array; contentType: string };

// Well above the app's upload limit (src/lib/uploads.ts), so the app's own checks are what's tested.
const MAX_BODY_BYTES = 100 * 1024 * 1024;

const { values } = parseArgs({ options: { port: { type: "string" }, dir: { type: "string" } } });
const port = Number(values.port);
if (!Number.isInteger(port) || port <= 0)
  throw new Error("Usage: tsx scripts/r2-mock.ts --port <port> [--dir <folder>]");

const store = values.dir ? folderStore(values.dir) : memoryStore();

function memoryStore() {
  const objects = new Map<string, StoredObject>();
  const id = (bucket: string, key: string) => `${bucket}\n${key}`;
  return {
    get: (bucket: string, key: string) => objects.get(id(bucket, key)) ?? null,
    put: (bucket: string, key: string, object: StoredObject) => void objects.set(id(bucket, key), object),
    delete: (bucket: string, key: string) => void objects.delete(id(bucket, key)),
  };
}

function folderStore(dir: string) {
  const path = (bucket: string, key: string) => join(dir, fileNameFor(bucket), fileNameFor(key));
  return {
    get(bucket: string, key: string): StoredObject | null {
      try {
        const { contentType } = JSON.parse(readFileSync(`${path(bucket, key)}.meta`, "utf8"));
        return { body: readFileSync(path(bucket, key)), contentType };
      } catch {
        return null;
      }
    },
    put(bucket: string, key: string, object: StoredObject) {
      mkdirSync(join(dir, fileNameFor(bucket)), { recursive: true });
      writeFileSync(path(bucket, key), object.body);
      writeFileSync(`${path(bucket, key)}.meta`, JSON.stringify({ contentType: object.contentType }));
    },
    delete(bucket: string, key: string) {
      rmSync(path(bucket, key), { force: true });
      rmSync(`${path(bucket, key)}.meta`, { force: true });
    },
  };
}

function readBody(req: IncomingMessage) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    req.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > MAX_BODY_BYTES) {
        reject(new Error("Body too large"));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function etag(body: Uint8Array) {
  return `"${createHash("md5").update(body).digest("hex")}"`;
}

function xmlError(res: ServerResponse, status: number, code: string, message: string) {
  const escaped = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  res.writeHead(status, { "Content-Type": "application/xml" });
  res.end(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${escaped}</Message></Error>`);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, HEAD, DELETE");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "*");
  res.setHeader("Access-Control-Expose-Headers", "ETag");

  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "OPTIONS") return void res.writeHead(204).end();
  // Playwright and scripts/dev.ts wait for this before starting the app.
  if (pathname === "/" && req.method === "GET") return void res.writeHead(200).end("r2-mock ok\n");

  const target = parseObjectPath(pathname);
  if (!target) return xmlError(res, 400, "InvalidRequest", "Expected /<bucket>/<key>.");
  const { bucket, key } = target;

  if (req.method === "PUT") {
    const raw = await readBody(req);
    const body = isAwsChunked(req.headers) ? decodeAwsChunked(raw) : raw;
    store.put(bucket, key, { body, contentType: req.headers["content-type"] ?? "application/octet-stream" });
    return void res.writeHead(200, { ETag: etag(body) }).end();
  }
  if (req.method === "GET" || req.method === "HEAD") {
    const object = store.get(bucket, key);
    if (!object) {
      if (req.method === "HEAD") return void res.writeHead(404).end();
      return xmlError(res, 404, "NoSuchKey", "The specified key does not exist.");
    }
    res.writeHead(200, {
      "Content-Type": object.contentType,
      // An uploader chooses the content type. Never let a stored file run as a page on localhost.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Content-Length": object.body.length,
      ETag: etag(object.body),
    });
    return void res.end(req.method === "GET" ? object.body : undefined);
  }
  if (req.method === "DELETE") {
    store.delete(bucket, key);
    return void res.writeHead(204).end();
  }
  return xmlError(res, 501, "NotImplemented", `${req.method} isn't supported by the R2 mock.`);
}

// Loopback only, so nothing else on the network can reach it, on both IPv4 and IPv6: "localhost"
// resolves to 127.0.0.1 in some clients and ::1 in others. A machine without IPv6 skips ::1.
const servers = ["127.0.0.1", "::1"].map((host) => {
  const server = createServer((req, res) => {
    handle(req, res)
      .catch((err) => {
        if (!res.headersSent) xmlError(res, 400, "InvalidRequest", String((err as Error).message));
      })
      .finally(() => console.log(`r2-mock ${req.method} ${req.url?.split("?")[0]} ${res.statusCode}`));
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (host === "::1" && err.code === "EADDRNOTAVAIL") return;
    throw err;
  });
  server.listen(port, host);
  return server;
});
console.log(`R2 mock on http://localhost:${port}, ${values.dir ? `objects in ${values.dir}` : "objects in memory"}`);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    for (const server of servers) server.close();
    process.exit(0);
  });
}
