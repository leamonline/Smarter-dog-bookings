# WhatsApp Template Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "template picker coming soon" placeholder in the WhatsApp inbox with a real template picker that lets staff send Meta-approved template messages when the 24-hour free-form text window is closed.

**Architecture:** Frontend-only + one new DB query. The `whatsapp-send` edge function already has a working `mode: "template"` handler. This plan adds: (1) a `WHATSAPP_TEMPLATES` constant defining the templates and their parameters, (2) a `sendTemplate` action + dog-name fetch in `useWhatsAppInbox.js`, (3) a `TemplatePicker` component inline in `WhatsAppInboxView.jsx` that replaces the static "coming soon" message. No migrations. No new edge functions.

**Tech Stack:** React 19, Supabase JS client, Vitest (Node env, no JSDOM).

---

## Pre-flight: Register Meta Templates

Before any code runs in production, the following templates must be submitted in the Meta Business Manager (WhatsApp Manager → Message Templates → Create Template). This takes 1–48 hours for Meta approval. You can develop and test against an approved sandbox template in the meantime.

### Templates to register

**Template 1 — appointment reminder**
- Name: `smarter_appointment_reminder`
- Category: `UTILITY`
- Language: `en_GB`
- Body: `Hi {{1}}, just a quick reminder that {{2}} has a grooming appointment with us on {{3}} at {{4}}. We're looking forward to seeing you both! 🐾`
- Parameters: `[customer first name, dog name, date (e.g. "Monday 11 May"), time (e.g. "9:00am")]`

**Template 2 — general contact (no params)**
- Name: `smarter_general_contact`
- Category: `UTILITY`
- Language: `en_GB`
- Body: `Hi {{1}}, it's the Smarter Dog Grooming team here! We just wanted to reach out — could you reply here when you get a chance? Thanks so much! 🐾`
- Parameters: `[customer first name]`

**Template 3 — rebook invite**
- Name: `smarter_rebook_invite`
- Category: `MARKETING`
- Language: `en_GB`
- Body: `Hi {{1}}, it was lovely seeing {{2}} recently! 🐾 Would you like to book their next groom? Just reply here and we'll sort something out.`
- Parameters: `[customer first name, dog name]`

> **Dev note:** While awaiting approval, you can use a Meta sandbox template (e.g. `hello_world`) to smoke-test the send flow end-to-end. Swap it for the real template names once approved.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/constants/whatsappTemplates.js` | Template definitions: name, label, description, param schema, preview function |
| Modify | `src/supabase/hooks/useWhatsAppInbox.js` | Add `sendTemplate` action (calls whatsapp-send in template mode) + add `dogNames` state + fetch dogs on conversation select |
| Modify | `src/components/views/WhatsAppInboxView.jsx` | Replace closed-window "coming soon" div with `<TemplatePicker>` component |
| Create | `src/supabase/hooks/useWhatsAppInbox.test.js` | Unit tests for the pure template-rendering helpers |

---

## Task 1: Create `src/constants/whatsappTemplates.js`

**Files:**
- Create: `src/constants/whatsappTemplates.js`

- [ ] **Step 1.1: Write the template constants file**

```javascript
// src/constants/whatsappTemplates.js

/**
 * Each template maps to a Meta-approved WhatsApp message template.
 *
 * `params` defines the ordered list of {{N}} placeholders in the template body.
 * `autoFill` is a hint to the picker: which context key to pre-populate from.
 *   Supported values: "customer_first_name", "dog_name" (first dog), "dog_name_select" (dropdown if multiple dogs)
 *
 * `preview(values)` renders the message with the given param values for the
 *   UI preview — must match the exact wording registered with Meta.
 */
export const WHATSAPP_TEMPLATES = [
  {
    name: "smarter_appointment_reminder",
    label: "Appointment Reminder",
    description: "Remind a customer about an upcoming appointment",
    language: "en_GB",
    params: [
      { key: "customer_first_name", label: "Customer first name", autoFill: "customer_first_name" },
      { key: "dog_name", label: "Dog name", autoFill: "dog_name_select" },
      { key: "date", label: "Date (e.g. Monday 12 May)", autoFill: null },
      { key: "time", label: "Time (e.g. 9:00am)", autoFill: null },
    ],
    preview: (values) =>
      `Hi ${values.customer_first_name || "{{1}}"}, just a quick reminder that ${values.dog_name || "{{2}}"} has a grooming appointment with us on ${values.date || "{{3}}"} at ${values.time || "{{4}}"}. We're looking forward to seeing you both! 🐾`,
  },
  {
    name: "smarter_general_contact",
    label: "General Contact",
    description: "Reach out when you need to speak to a customer",
    language: "en_GB",
    params: [
      { key: "customer_first_name", label: "Customer first name", autoFill: "customer_first_name" },
    ],
    preview: (values) =>
      `Hi ${values.customer_first_name || "{{1}}"}, it's the Smarter Dog Grooming team here! We just wanted to reach out — could you reply here when you get a chance? Thanks so much! 🐾`,
  },
  {
    name: "smarter_rebook_invite",
    label: "Rebook Invite",
    description: "Invite a customer to book their next groom",
    language: "en_GB",
    params: [
      { key: "customer_first_name", label: "Customer first name", autoFill: "customer_first_name" },
      { key: "dog_name", label: "Dog name", autoFill: "dog_name_select" },
    ],
    preview: (values) =>
      `Hi ${values.customer_first_name || "{{1}}"}, it was lovely seeing ${values.dog_name || "{{2}}"} recently! 🐾 Would you like to book their next groom? Just reply here and we'll sort something out.`,
  },
];

/** Pure helper: build the ordered `params` array for whatsapp-send from a template's param values. */
export function buildTemplateParams(template, values) {
  return template.params.map((p) => values[p.key] ?? "");
}
```

- [ ] **Step 1.2: Commit**

```bash
git add src/constants/whatsappTemplates.js
git commit -m "feat(whatsapp-inbox): add whatsappTemplates constant with 3 Meta templates"
```

---

## Task 2: Unit test `buildTemplateParams`

**Files:**
- Create: `src/constants/whatsappTemplates.test.js`

The test runs in the existing Vitest Node environment (no JSDOM needed — pure function).

- [ ] **Step 2.1: Write the failing test**

```javascript
// src/constants/whatsappTemplates.test.js
import { describe, it, expect } from "vitest";
import { WHATSAPP_TEMPLATES, buildTemplateParams } from "./whatsappTemplates.js";

describe("buildTemplateParams", () => {
  it("returns params in template order", () => {
    const template = WHATSAPP_TEMPLATES[0]; // appointment_reminder
    const values = {
      customer_first_name: "Sarah",
      dog_name: "Bella",
      date: "Monday 12 May",
      time: "9:00am",
    };
    expect(buildTemplateParams(template, values)).toEqual(["Sarah", "Bella", "Monday 12 May", "9:00am"]);
  });

  it("fills empty string for missing params", () => {
    const template = WHATSAPP_TEMPLATES[0];
    expect(buildTemplateParams(template, { customer_first_name: "Sarah" })).toEqual([
      "Sarah", "", "", "",
    ]);
  });

  it("general_contact only has one param", () => {
    const template = WHATSAPP_TEMPLATES[1]; // general_contact
    expect(buildTemplateParams(template, { customer_first_name: "Jon" })).toEqual(["Jon"]);
  });

  it("preview renders correctly for appointment_reminder", () => {
    const template = WHATSAPP_TEMPLATES[0];
    const values = { customer_first_name: "Sarah", dog_name: "Bella", date: "Monday 12 May", time: "9:00am" };
    expect(template.preview(values)).toBe(
      "Hi Sarah, just a quick reminder that Bella has a grooming appointment with us on Monday 12 May at 9:00am. We're looking forward to seeing you both! 🐾"
    );
  });

  it("preview falls back to placeholder syntax for missing values", () => {
    const template = WHATSAPP_TEMPLATES[0];
    expect(template.preview({})).toBe(
      "Hi {{1}}, just a quick reminder that {{2}} has a grooming appointment with us on {{3}} at {{4}}. We're looking forward to seeing you both! 🐾"
    );
  });
});
```

- [ ] **Step 2.2: Run tests — expect PASS**

```bash
npx vitest run src/constants/whatsappTemplates.test.js
```

Expected: 5 tests PASS

- [ ] **Step 2.3: Commit**

```bash
git add src/constants/whatsappTemplates.test.js
git commit -m "test(whatsapp-inbox): unit tests for buildTemplateParams + template previews"
```

---

## Task 3: Add `sendTemplate` + `dogNames` to `useWhatsAppInbox.js`

**Files:**
- Modify: `src/supabase/hooks/useWhatsAppInbox.js`

`sendTemplate` invokes `whatsapp-send` in `mode: "template"`. `dogNames` is an array of dog names fetched when a conversation is selected (used to populate the dog name dropdown in the picker).

- [ ] **Step 3.1: Import WHATSAPP_TEMPLATES constants at the top of the hook file**

Find the existing imports block near line 1–10:

```javascript
import { createClient } from "@supabase/supabase-js";
```

Add after it:

```javascript
import { buildTemplateParams } from "../constants/whatsappTemplates.js";
```

- [ ] **Step 3.2: Add `dogNames` state near the other state declarations (~line 134)**

Find:
```javascript
const [conversations, setConversations] = useState([]);
```

Add below it:
```javascript
const [dogNames, setDogNames] = useState([]);
```

- [ ] **Step 3.3: Fetch dog names when a conversation is selected**

Find `selectConversation` (around line 200) — it calls `fetchConversationDetail`. After the detail fetch, add a dog-name fetch:

```javascript
// Fetch dog names for template picker auto-fill
const humanId = conversations.find((c) => c.id === conversationId)?.human_id;
if (humanId) {
  const { data: dogsData } = await supabase
    .from("dogs")
    .select("name")
    .eq("human_id", humanId)
    .order("name");
  setDogNames((dogsData ?? []).map((d) => d.name));
} else {
  setDogNames([]);
}
```

- [ ] **Step 3.4: Add the `sendTemplate` callback near the other action callbacks (~line 460)**

Find the `toggleAutoSend` or `sendDraft` callback and add below it:

```javascript
const sendTemplate = useCallback(
  async (template, paramValues) => {
    const conversation = conversations.find((c) => c.id === selectedId);
    if (!conversation) return;

    const params = buildTemplateParams(template, paramValues);

    const { error } = await supabase.functions.invoke("whatsapp-send", {
      body: {
        mode: "template",
        to: conversation.phone_e164,
        template_name: template.name,
        language: template.language,
        params,
        conversation_id: conversation.id,
      },
    });

    if (error) throw new Error(error.message ?? "Template send failed");

    // Refresh messages so the sent template appears in the thread
    const detail = await fetchConversationDetail(selectedId);
    setMessages(detail.messages);
  },
  [conversations, selectedId, supabase],
);
```

- [ ] **Step 3.5: Export `dogNames` and `sendTemplate` from the hook's return object (~line 492)**

Find the `return {` statement at the bottom of the hook and add:

```javascript
dogNames,
sendTemplate,
```

- [ ] **Step 3.6: Run existing tests to confirm no regressions**

```bash
npx vitest run
```

Expected: all existing tests PASS (the hook changes are additive).

- [ ] **Step 3.7: Commit**

```bash
git add src/supabase/hooks/useWhatsAppInbox.js
git commit -m "feat(whatsapp-inbox): add sendTemplate action + dogNames state to useWhatsAppInbox"
```

---

## Task 4: Build `TemplatePicker` component in `WhatsAppInboxView.jsx`

**Files:**
- Modify: `src/components/views/WhatsAppInboxView.jsx`

This replaces the static "coming soon" block (~line 678–685) with an inline `TemplatePicker` component. The component lives at the bottom of the same file (consistent with `DraftPanel` and other internal components in this file).

- [ ] **Step 4.1: Import WHATSAPP_TEMPLATES at the top of the file**

Find the existing imports (~line 1–10). Add:

```javascript
import { WHATSAPP_TEMPLATES } from "../../constants/whatsappTemplates.js";
```

- [ ] **Step 4.2: Add the `TemplatePicker` component at the bottom of the file (before the final `export default`)**

```jsx
/**
 * Shown in the message composer when the 24h free-form text window is closed.
 * Lets staff pick a Meta-approved template, fill in any params, preview the
 * message, then send it.
 */
function TemplatePicker({ conversation, dogNames, onSend }) {
  const [selectedTemplateName, setSelectedTemplateName] = React.useState(WHATSAPP_TEMPLATES[0].name);
  const [paramValues, setParamValues] = React.useState({});
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [sent, setSent] = React.useState(false);

  const template = WHATSAPP_TEMPLATES.find((t) => t.name === selectedTemplateName);

  // Auto-fill known params from conversation context whenever the selected
  // template or conversation changes.
  React.useEffect(() => {
    const autoFilled = {};
    const customerFirstName = conversation?.humans?.name ?? "";
    const firstDog = dogNames[0] ?? "";

    for (const param of template.params) {
      if (param.autoFill === "customer_first_name") autoFilled[param.key] = customerFirstName;
      else if (param.autoFill === "dog_name_select") autoFilled[param.key] = firstDog;
    }
    setParamValues(autoFilled);
    setSent(false);
    setError(null);
  }, [selectedTemplateName, conversation?.id, dogNames]);

  const allFilled = template.params.every((p) => (paramValues[p.key] ?? "").trim() !== "");
  const preview = template.preview(paramValues);

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      await onSend(template, paramValues);
      setSent(true);
    } catch (err) {
      setError(err.message ?? "Failed to send template");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="p-4 text-sm text-green-700 bg-green-50 rounded-lg border border-green-200">
        ✓ Template sent successfully. The customer will receive the message shortly.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-xs font-medium text-amber-800">
        24h window closed — send a template message instead
      </p>

      {/* Template selector */}
      <div>
        <label className="block text-xs text-slate-600 mb-1">Template</label>
        <select
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          value={selectedTemplateName}
          onChange={(e) => setSelectedTemplateName(e.target.value)}
        >
          {WHATSAPP_TEMPLATES.map((t) => (
            <option key={t.name} value={t.name}>
              {t.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">{template.description}</p>
      </div>

      {/* Param inputs */}
      {template.params.map((param) => {
        if (param.autoFill === "dog_name_select" && dogNames.length > 1) {
          return (
            <div key={param.key}>
              <label className="block text-xs text-slate-600 mb-1">{param.label}</label>
              <select
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
                value={paramValues[param.key] ?? ""}
                onChange={(e) =>
                  setParamValues((prev) => ({ ...prev, [param.key]: e.target.value }))
                }
              >
                <option value="">Select a dog…</option>
                {dogNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        return (
          <div key={param.key}>
            <label className="block text-xs text-slate-600 mb-1">{param.label}</label>
            <input
              type="text"
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
              value={paramValues[param.key] ?? ""}
              onChange={(e) =>
                setParamValues((prev) => ({ ...prev, [param.key]: e.target.value }))
              }
              placeholder={`Enter ${param.label.toLowerCase()}…`}
            />
          </div>
        );
      })}

      {/* Preview */}
      <div className="bg-white border border-slate-200 rounded p-3 text-sm text-slate-700 whitespace-pre-wrap">
        {preview}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSend}
        disabled={!allFilled || sending}
        className="self-end px-4 py-2 text-sm font-medium rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? "Sending…" : "Send Template"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4.3: Destructure `dogNames` and `sendTemplate` from the hook in `WhatsAppInboxView`**

Find where `useWhatsAppInbox()` is destructured (~line 730):

```javascript
const {
  conversations,
  selectedId,
  // ...existing fields...
} = useWhatsAppInbox();
```

Add `dogNames` and `sendTemplate` to the destructuring:

```javascript
const {
  conversations,
  selectedId,
  // ...existing fields...
  dogNames,
  sendTemplate,
} = useWhatsAppInbox();
```

- [ ] **Step 4.4: Replace the "coming soon" block with `<TemplatePicker>`**

Find the existing closed-window block (~line 678–685):

```jsx
if (!windowOpen) {
  return (
    <div className="...">
      <span className="font-bold">24h window closed.</span>{" "}
      Template picker coming soon; for now, use the WhatsApp consumer app on your phone if it's urgent.
    </div>
  );
}
```

Replace with:

```jsx
if (!windowOpen) {
  return (
    <TemplatePicker
      conversation={selectedConversation}
      dogNames={dogNames}
      onSend={sendTemplate}
    />
  );
}
```

- [ ] **Step 4.5: Run the dev server and do a manual smoke test**

```bash
npm run dev
```

Open the WhatsApp inbox in the browser. Find a conversation where `last_inbound_at` is more than 24 hours ago (or temporarily set a recent conversation's `last_inbound_at` to an old date in Supabase to force the window closed). Verify:

1. The "coming soon" text is gone; the template picker renders
2. The template dropdown shows three options
3. Selecting a template auto-fills the customer name (and first dog name if available)
4. The preview updates as you type
5. "Send Template" is disabled until all params are filled
6. On send, a spinner shows briefly then the success message appears
7. The sent template message appears in the conversation thread

- [ ] **Step 4.6: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 4.7: Commit**

```bash
git add src/components/views/WhatsAppInboxView.jsx src/constants/whatsappTemplates.js src/constants/whatsappTemplates.test.js src/supabase/hooks/useWhatsAppInbox.js
git commit -m "feat(whatsapp-inbox): replace 'coming soon' with working template picker"
```

---

## Task 5: Push branch and open PR

- [ ] **Step 5.1: Push to remote**

```bash
git push -u origin HEAD
```

- [ ] **Step 5.2: Open PR**

```bash
gh pr create \
  --title "feat(whatsapp-inbox): WhatsApp template picker for closed 24h window" \
  --body "Replaces the 'template picker coming soon' placeholder with a working UI.

## What this does
- Staff can pick from 3 Meta-approved templates (appointment reminder, general contact, rebook invite)
- Customer first name and dog name auto-fill from conversation context
- Multi-dog households get a dropdown to choose which dog
- Shows a live preview of the rendered message before sending
- Calls the existing \`whatsapp-send\` edge function in \`mode: 'template'\`

## Pre-flight
Templates must be registered and approved in Meta Business Manager (see plan for exact wording) before this works in production. During development, use the \`hello_world\` sandbox template to test the send path.

## Tests
- Unit tests for \`buildTemplateParams\` + preview rendering (5 assertions)
- Manual smoke test: template picker renders, auto-fills, previews, and sends"
```

---

## Verification Checklist

- [ ] `npx vitest run` — all tests pass
- [ ] Dev server: template picker renders when 24h window is closed
- [ ] Customer name auto-fills from conversation data
- [ ] Dog name auto-fills (single dog) or dropdown (multiple dogs)
- [ ] Preview updates live as params change
- [ ] Send button disabled until all params filled
- [ ] Successful send shows confirmation; message appears in thread
- [ ] Error path: wrong template name shows an error message (test with `hello_world` if approval pending)
- [ ] No regressions: inbox behaviour when window IS open is unchanged
- [ ] Both open branches (`feat/two-approval-ux-coupling`, `feat/agent-large-dog-availability`) are unaffected (different files)
