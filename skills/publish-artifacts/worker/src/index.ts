export interface Env {
  ARTIFACTS: R2Bucket;
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", avif: "image/avif",
  ico: "image/x-icon",
  woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf",
  txt: "text/plain; charset=utf-8", pdf: "application/pdf", map: "application/json",
};

function typeFor(key: string): string {
  const ext = key.includes(".") ? key.split(".").pop()!.toLowerCase() : "";
  return TYPES[ext] ?? "application/octet-stream";
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    const url = new URL(req.url);
    const path = decodeURIComponent(url.pathname).replace(/^\/+/, "");

    // Candidate R2 keys, most-specific first. The tree maps 1:1 to keys.
    const candidates =
      path === "" || path.endsWith("/")
        ? [path + "index.html"]
        : [path, path + "/index.html", path + ".html"];

    for (const key of candidates) {
      const obj = await env.ARTIFACTS.get(key);
      if (obj) {
        const headers = new Headers();
        obj.writeHttpMetadata(headers);
        headers.set("Content-Type", typeFor(key));
        headers.set("X-Content-Type-Options", "nosniff"); // serve the declared type, never sniff
        headers.set("Cache-Control", "no-store"); // artifacts iterate; never serve stale
        headers.set("ETag", obj.httpEtag);
        return new Response(req.method === "HEAD" ? null : obj.body, { headers });
      }
    }
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
