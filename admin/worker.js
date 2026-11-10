// Admin SPA Worker — serves static assets from dist/ at arxysadmin.arxoft.com
// Falls back to index.html for all unmatched paths (SPA client-side routing).
export default {
  async fetch(request, env) {
    let response = await env.ASSETS.fetch(request)
    if (response.status === 404) {
      const url = new URL(request.url)
      url.pathname = '/'
      response = await env.ASSETS.fetch(new Request(url.toString(), request))
    }
    return response
  }
}
