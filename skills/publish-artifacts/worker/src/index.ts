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

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function serve(key: string, obj: R2ObjectBody, isHead: boolean): Response {
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Content-Type", typeFor(key));
  headers.set("X-Content-Type-Options", "nosniff"); // serve the declared type, never sniff
  headers.set("Cache-Control", "no-store"); // artifacts iterate; never serve stale
  headers.set("ETag", obj.httpEtag);
  return new Response(isHead ? null : obj.body, { headers });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    const isHead = req.method === "HEAD";
    const url = new URL(req.url);

    // SECURITY — path normalization is a gate boundary, not a convenience.
    // Cloudflare Access evaluates the RAW request path against `/<folder>/*`
    // rules; this Worker resolves R2 keys from the DECODED path. Any byte that
    // decodes into a path separator (`%2F`, `%5C`) or a `..`/`.` segment, or an
    // un-normalized `//`, lets a request slip PAST a folder's Access gate while
    // still resolving to a gated object — a content leak. So the Worker must
    // NEVER serve bytes for a non-canonical path: reject encoded separators and
    // traversal outright, and 301 (body-less) anything that isn't already the
    // exact, canonical URL Access saw. The only servable directory URL is the
    // trailing-slash form, which falls inside `/<folder>/*`.
    const rawPath = url.pathname;
    if (/%2f|%5c/i.test(rawPath)) return notFound(); // encoded separator — never legitimate here

    const decoded = decodeURIComponent(rawPath).replace(/^\/+/, "");
    if (decoded.split("/").some((seg) => seg === "..")) return notFound(); // traversal

    // Canonicalize: collapse duplicate slashes, drop "." segments.
    const path = decoded.replace(/\/{2,}/g, "/").replace(/\/\.(?=\/|$)/g, "");
    if (path !== decoded) {
      // Not canonical — redirect to the canonical URL (no body) so the served
      // URL is exactly the one Access evaluated.
      return Response.redirect(`${url.origin}/${path}${url.search}`, 301);
    }

    if (path !== "" && !path.endsWith("/")) {
      // Most-specific first: an exact file, then an `.html` sibling.
      const file = await env.ARTIFACTS.get(path);
      if (file) return serve(path, file, isHead);
      const html = await env.ARTIFACTS.get(path + ".html");
      if (html) return serve(path + ".html", html, isHead);
      // A directory (has index.html) requested without a trailing slash: redirect
      // to the slash form (body-less) so the only servable directory URL is the
      // one Access gates under `/<folder>/*`.
      if (await env.ARTIFACTS.head(path + "/index.html")) {
        return Response.redirect(`${url.origin}/${path}/${url.search}`, 301);
      }
      return notFound();
    }

    // Root ("") or a trailing-slash directory: serve its index.html.
    const idx = await env.ARTIFACTS.get(path + "index.html");
    if (idx) return serve(path + "index.html", idx, isHead);
    return notFound();
  },
};
