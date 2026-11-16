# PAT → GitHub App Migration

## Why

Per-member PATs stored in `venture_members.github_pat` are an operational liability:
- PATs expire silently — first sign is a 401 at runtime during an unrelated operation
- PATs are scoped to the member's personal account permissions, not the org's
- If a member leaves, their PAT becomes invalid and breaks the workspace
- No audit trail on GitHub's side for API calls made via PAT

A GitHub App installed per org issues short-lived installation tokens scoped to exactly the
permissions the app needs. Rotation is automatic. The app survives member turnover.

---

## Target architecture

```
venture_members.github_pat  (current)
      ↓
ventures.github_app_installation_id  (target)
  + GITHUB_APP_ID secret (Cloudflare Worker secret)
  + GITHUB_APP_PRIVATE_KEY secret (Cloudflare Worker secret)
```

One GitHub App per arxys deployment. Each venture org installs the app. The installation ID
is stored per venture. The API exchanges app credentials for a short-lived installation token
at request time (cached for the token's 1-hour lifetime).

---

## Steps

### 1. Create the GitHub App

In GitHub → Settings → Developer Settings → GitHub Apps → New GitHub App:

- **Name**: arxys
- **Homepage URL**: https://arxysapis.arxoft.com
- **Webhook**: disabled (we don't need inbound events)
- **Permissions (Repository)**:
  - Issues: Read & Write
  - Pull requests: Read & Write
  - Contents: Read (for repo info, commits)
  - Metadata: Read (required)
- **Permissions (Organization)**:
  - Members: Read
  - Projects: Read & Write
- **Where can this app be installed**: Any account

After creation:
- Note the **App ID**
- Generate and download a **private key** (`.pem` file)

### 2. Store secrets in Cloudflare

```bash
wrangler secret put GITHUB_APP_ID         # numeric app ID
wrangler secret put GITHUB_APP_PRIVATE_KEY  # full PEM contents, single line with \n
```

### 3. Install the app on each venture org

Each venture org owner visits:
```
https://github.com/apps/arxys/installations/new
```

After installation, capture the **installation ID** from the URL:
```
https://github.com/settings/installations/12345678
                                           ^^^^^^^^ this is the installation ID
```

### 4. Schema migration

```sql
-- Add installation ID to ventures
ALTER TABLE ventures ADD COLUMN github_app_installation_id TEXT;

-- Keep github_pat on venture_members during transition, nullable
-- Drop it in a later migration once all ventures are migrated
```

### 5. API changes

Add `src/github/app-auth.ts`:

```typescript
// Exchange App credentials for a short-lived installation token
// Cache the token for 55 minutes (tokens last 1 hour)
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

export async function getInstallationToken(
  installationId: string,
  appId: string,
  privateKeyPem: string
): Promise<string> {
  const cached = tokenCache.get(installationId)
  if (cached && Date.now() < cached.expiresAt) return cached.token

  const jwt = await signAppJwt(appId, privateKeyPem)
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'arxys-api/1.0',
      },
    }
  )
  const data = await res.json() as { token: string; expires_at: string }
  const expiresAt = Date.now() + 55 * 60 * 1000
  tokenCache.set(installationId, { token: data.token, expiresAt })
  return data.token
}
```

In `src/middleware/auth.ts`, when building `credentials`:
- If `venture.github_app_installation_id` is set → call `getInstallationToken()` and use as `githubToken`
- If not → fall back to `ventureMember.github_pat` (transition period)

This keeps the rest of the codebase unchanged — `c.get('credentials').githubToken` works as before.

### 6. Admin UI changes

- Venture detail page: add **GitHub App Installation ID** field (read/write)
- Remove per-member GitHub PAT field once all ventures are migrated

### 7. Cutover and cleanup

Per venture:
1. Set `github_app_installation_id` on the venture via admin UI
2. Verify a few API calls work (list issues, update project field)
3. Null out `venture_members.github_pat` for all members in that venture

Once all ventures are migrated:
```sql
-- Final cleanup migration
ALTER TABLE venture_members DROP COLUMN github_pat;
ALTER TABLE ventures DROP COLUMN ... (any PAT-related remnants)
```

---

## Effort estimate

| Task | Effort |
|------|--------|
| Create GitHub App + secrets | 1h |
| `app-auth.ts` token exchange + JWT signing | 2h |
| Auth middleware update (app token fallback) | 1h |
| Admin UI: installation ID field | 1h |
| Per-venture cutover + verification | 0.5h each |
| Final schema cleanup migration | 0.5h |
| **Total (excl. per-venture cutover)** | **~6h** |
