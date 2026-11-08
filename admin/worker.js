// Admin SPA Worker — serves static assets from dist/ at /admin/*
// Strips the /admin prefix before looking up assets, and falls back
// to index.html for all unmatched paths (SPA client-side routing).
export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // Strip /admin prefix to map to actual asset paths in dist/
    if (url.pathname.startsWith('/admin')) {
      url.pathname = url.pathname.slice('/admin'.length) || '/'
    }

    // Try the asset; if not found serve index.html for SPA routing
    const assetRequest = new Request(url.toString(), request)
    let response = await env.ASSETS.fetch(assetRequest)

    if (response.status === 404) {
      const indexUrl = new URL(request.url)
      indexUrl.pathname = '/'
      response = await env.ASSETS.fetch(new Request(indexUrl.toString(), request))
    }

    return response
  }
}
