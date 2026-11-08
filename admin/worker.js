// Admin SPA Worker — serves static assets from dist/ at /admin/*
// All unmatched paths return index.html for client-side routing.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request)
  }
}
