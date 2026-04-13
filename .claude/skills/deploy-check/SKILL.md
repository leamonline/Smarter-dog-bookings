---
name: deploy-check
description: Pre-deployment verification checklist for Vercel — runs typecheck, tests, build, and security checks
disable-model-invocation: true
---

# Pre-Deployment Checklist

Run all verification steps before deploying to Vercel. Report results as a checklist and STOP deployment if any step fails.

## Steps

### 1. TypeScript Type Check
```bash
npm run typecheck
```
If errors found: list them and mark this step as FAILED.

### 2. Run Tests
```bash
npm run test
```
If any tests fail: list failures and mark as FAILED.

### 3. Check for Staged .env Files
```bash
git diff --cached --name-only | grep -E '\.env'
```
If any .env files are staged: BLOCK deployment and warn about secret exposure.

### 4. Validate Edge Functions Syntax
Check that all files in `supabase/functions/*/index.ts` parse without syntax errors:
```bash
for f in supabase/functions/*/index.ts; do npx tsx --eval "import('$f')" 2>&1 || echo "SYNTAX ERROR: $f"; done
```

### 5. Production Build
```bash
npm run build
```
If build fails: report the error and mark as FAILED.

### 6. Bundle Size Check
After build, check the `dist/` output size:
```bash
du -sh dist/
```
Report the total size. Warn if over 5MB.

## Output Format

```
Pre-Deploy Checklist — [date]
[PASS/FAIL] TypeScript type check
[PASS/FAIL] Tests (X passed, Y failed)
[PASS/FAIL] No .env files staged
[PASS/FAIL] Edge Functions syntax
[PASS/FAIL] Production build
[INFO] Bundle size: X MB

Result: READY TO DEPLOY / BLOCKED — fix N issue(s) above
```
