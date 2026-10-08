/**
 * Cloudflare Worker — Proxy Haute Performance pour MémoMaître
 * 
 * Gratuit : 100 000 requêtes / jour offertes.
 * Fonctionnalités :
 *  - CORS universel (Access-Control-Allow-Origin: *)
 *  - Cache Edge Cloudflare 10 minutes (évite de saturer les flux)
 *  - User-Agent moderne & WAF-proof
 *  - Support des flux RSS/Atom et des pages HTML (articles complets)
 */

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get("url");
    if (!target) {
      return new Response("Missing url query parameter", { status: 400 });
    }

    try {
      const cache = caches.default;
      const cacheKey = new Request(target, { method: "GET" });
      let response = await cache.match(cacheKey);

      if (!response) {
        const upstream = await fetch(target, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "*/*",
          },
          cf: { cacheTtl: 600, cacheEverything: true },
        });

        const newHeaders = new Headers(upstream.headers);
        newHeaders.set("Access-Control-Allow-Origin", "*");
        newHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
        newHeaders.set("Cache-Control", "public, max-age=600");

        response = new Response(upstream.body, {
          status: upstream.status,
          headers: newHeaders,
        });

        if (upstream.status === 200) {
          ctx.waitUntil(cache.put(cacheKey, response.clone()));
        }
      }

      return response;
    } catch (err) {
      return new Response(err.message || "Proxy error", {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  },
};
