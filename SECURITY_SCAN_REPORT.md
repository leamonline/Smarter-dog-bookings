# Security Scan Report

Date: 2026-05-01
Repository: `/workspace/Smarter-dog-bookings`

## Skill handling note
The requested `$security-scan` skill was not available in this session's declared skill list, so I performed a manual fallback scan using dependency and code-level checks.

## Scan commands executed
1. `npm audit --json`
2. `rg -n "(eval\(|new Function\(|dangerouslySetInnerHTML|child_process|exec\(|spawn\(|Deno\.env|process\.env|service_role|SUPABASE_SERVICE_ROLE_KEY|jwt|api[_-]?key|password\s*=)" src supabase --glob '!**/*.test.*'`
3. Manual review of:
   - `supabase/functions/whatsapp-send/index.ts`
   - `supabase/functions/whatsapp-agent/index.ts`
   - `supabase/functions/whatsapp-webhook/index.ts`

## Findings

### 1) Dependency vulnerability scan unavailable in this environment (Low confidence / tooling limitation)
- `npm audit` failed with `403 Forbidden` against the npm advisory API endpoint.
- Impact: unable to confirm current CVE status of locked dependencies from `package-lock.json` during this run.
- Severity: **Informational**.

### 2) Overly broad CORS policy on `whatsapp-send` edge function (Potential Medium)
- File: `supabase/functions/whatsapp-send/index.ts`
- Current behavior sets:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Headers` includes `authorization` and `x-internal-secret`
- Risk:
  - If this endpoint is ever called from unintended browser origins, broad CORS can expand attack surface for token misuse or abuse paths.
  - Existing in-function auth checks reduce risk, but origin restriction is still recommended defense-in-depth.
- Severity: **Medium (defense-in-depth hardening gap)**.

### 3) Public endpoints intentionally deployed with `--no-verify-jwt` but have compensating controls (Reviewed, not a direct vuln)
- Files:
  - `supabase/functions/whatsapp-webhook/index.ts`
  - `supabase/functions/whatsapp-agent/index.ts`
- Observed controls:
  - Webhook validates Meta HMAC signature.
  - Agent path uses a shared callback secret for trigger-origin verification.
- Residual risk:
  - Secret leakage or weak rotation practices would weaken this control model.
- Severity: **Low (acceptable if secret hygiene is strong)**.

## Recommended remediation
1. **Lock down CORS origins** for `whatsapp-send` to known dashboard domains (production + staging), and reject others.
2. **Rotate and enforce secret policies** for `SEND_INTERNAL_SECRET`, `AGENT_CALLBACK_SECRET`, and Meta secrets; document rotation cadence.
3. **Re-run dependency audit** in a network context with npm advisory access (or via an alternative scanner such as Snyk/OSV-Scanner/Dependabot).
4. Add CI security gates:
   - dependency audit job,
   - secret scanning,
   - optional SAST rules for edge functions.

## Overall assessment
- No clear critical code-level vulnerability was found in sampled high-risk edge functions.
- One medium-priority hardening issue (CORS scope) and one important scan limitation (dependency advisory access) should be addressed.
