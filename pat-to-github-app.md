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
venture_members.github_pat  (old — now nullable, kept for fallback)
      ↓
ventures.github_app_installation_id  (new — per venture)
  + GITHUB_APP_ID secret (Cloudflare Worker secret)
  + GITHUB_APP_PRIVATE_KEY secret (Cloudflare Worker secret)
```

One GitHub App per arxys deployment. Each venture org installs the app. The installation ID
is stored per venture. The API exchanges app credentials for a short-lived installation token
at request time (cached for 55 minutes per Worker isolate).

---

## Status

### ✅ Done

- **Migration 0016** applied to remote D1:
  - `ventures.github_app_installation_id TEXT` column added
  - `venture_members.github_pat` made nullable (table recreated)

- **Code shipped** (commit `2fcf2c7`, deployed):
  - `api/src/github/app-auth.ts` — JWT signing (WebCrypto RS256) + installation token exchange
  - `api/src/middleware/auth.ts` — uses App token when `github_app_installation_id` + secrets present; falls back to member PAT
  - `api/src/admin.ts` — `adminGithubCreds()` helper used in all 4 proxy routes (project-test, org-bootstrap, project-bootstrap, github-projects)
  - `api/src/types.ts` — `github_app_installation_id` on venture; `github_pat` nullable; `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` in Bindings
  - Admin UI — "GitHub App installation ID" field on venture settings page

- **GitHub App created** at github.com/settings/apps (personal account: `asif-maktg`):
  - App name: `arxys`
  - App ID: `5863196`
  - Homepage: `https://arxysapis.arxoft.com`
  - Webhook: disabled
  - Permissions:
    - Repository: Contents (R), Issues (R/W), Metadata (R), Pull requests (R/W)
    - Organization: Members (R), Projects (R/W)
  - Where installable: Any account
  - Private key: downloaded (`.pem` file)

- **`GITHUB_APP_ID` stored** as Cloudflare Worker secret ✅

### ⏳ Remaining

1. **Store private key as Cloudflare secret**
   ```bash
   cd /home/asif/.arxys/api
   # paste PEM contents when prompted (single line with \n, or multiline — both work)
   CLOUDFLARE_API_TOKEN=$(grep CLOUDFLARE_API_TOKEN .env | cut -d= -f2) \
     node_modules/.bin/wrangler secret put GITHUB_APP_PRIVATE_KEY
   ```
   Or if you have the .pem file path:
   ```bash
   cat /path/to/arxys.YYYY-MM-DD.private-key.pem | \
     CLOUDFLARE_API_TOKEN=$(grep CLOUDFLARE_API_TOKEN .env | cut -d= -f2) \
     node_modules/.bin/wrangler secret put GITHUB_APP_PRIVATE_KEY
   ```

2. **Install the App on each org/account** — visit:
   ```
   https://github.com/apps/arxys/installations/new
   ```
   Install on each venture's GitHub account:
   - `mak-tg` org
   - `arxoft` org
   - `vaylour` org
   - `dojo` org (or whatever the slug is)
   - personal account `asif-maktg` if needed

   After each install, find the installation ID in the URL:
   ```
   https://github.com/settings/installations/XXXXXXXXX
                                              ^^^^^^^^^ this is the installation ID
   ```

3. **Set installation ID per venture** in the admin UI:
   - Go to `arxysadmin.arxoft.com` → venture → Settings → "GitHub App installation ID"
   - Paste the installation ID for that venture's org
   - Repeat for each venture

4. **Verify** each venture works:
   - Click "Fetch Projects" on the venture page — should list projects from the org
   - Click "🏗 Org bootstrap" — should provision issue types + fields
   - Run test suite: `cd /home/asif/.arxys && bash api/test.sh`

5. **Clean up member PATs** (optional, after all ventures are migrated):
   - Remove PAT values from venture members via admin UI (edit member → blank PAT)
   - Or leave them as silent fallback — they're nullable now and won't be used when App token is present

6. **Final schema cleanup** (future migration, when all ventures confirmed working):
   ```sql
   ALTER TABLE venture_members DROP COLUMN github_pat;
   ```

---

## How the token flow works (for reference)

```
Request → authMiddleware
  → if venture.github_app_installation_id set:
      → signAppJwt(GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY)  [WebCrypto RS256]
      → POST /app/installations/{id}/access_tokens
      → cache token for 55 min
      → credentials.githubToken = installation_token
  → else:
      → credentials.githubToken = ventureMember.github_pat  (fallback)
  → all GitHub API calls use credentials.githubToken unchanged
```

---

## GitHub App URL

```
https://github.com/apps/arxys
```

Installation management:
```
https://github.com/settings/installations
```
