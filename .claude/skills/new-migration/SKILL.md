---
name: new-migration
description: Create a new Supabase migration with correct sequential numbering and RLS policy guidance
disable-model-invocation: true
---

# New Supabase Migration

Guide the creation of a new database migration file with correct numbering and best practices.

## Steps

### 1. Determine Next Migration Number
List existing migrations to find the next sequential number:
```bash
ls supabase/migrations/ | sort | tail -5
```
The new migration should use the next number in sequence (e.g., if last is `016_`, next is `017_`).

### 2. Ask What the Migration Does
Ask the user to describe the change. Common types:
- **New table**: schema + RLS policies + indexes
- **Alter table**: add/modify columns
- **New function**: RPC or trigger function
- **New index**: performance optimisation
- **RLS policy**: security rule change

### 3. Create the Migration File
Create at `supabase/migrations/[NNN]_[descriptive_name].sql` with this structure:

```sql
-- Migration: [NNN] — [Description]
-- Date: [today's date]

BEGIN;

-- === Schema Changes ===
-- [table/column/function changes here]

-- === RLS Policies ===
-- Every new table MUST have:
--   1. ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;
--   2. A policy for staff access using is_staff()
--   3. A policy for customer access (if applicable) scoped to their data
-- Review existing policies in 004_rls_policies.sql for patterns.

-- === Indexes ===
-- Add indexes for columns used in WHERE, JOIN, or ORDER BY.
-- Review existing indexes in 011_indexes_and_functions.sql for patterns.

COMMIT;
```

### 4. Validation Checklist
Before finishing, verify:
- [ ] Sequential number is correct (no gaps, no duplicates)
- [ ] File name is descriptive (`017_add_grooming_notes_table.sql`)
- [ ] RLS is enabled on any new tables
- [ ] Staff and customer policies are defined
- [ ] Indexes added for frequently queried columns
- [ ] Migration is wrapped in BEGIN/COMMIT
- [ ] No destructive operations without explicit user confirmation (DROP, TRUNCATE)

### 5. Test the Migration
Remind the user to test locally:
```bash
supabase db reset
```
Or apply just this migration via the Supabase dashboard SQL editor.
