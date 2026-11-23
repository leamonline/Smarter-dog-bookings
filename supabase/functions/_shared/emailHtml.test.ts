// The branded email wrapper (flyer visual language, step 4). The plain-text
// words are the contract: the HTML must carry every one of them, escaped,
// and add only the salon's frame around them.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { EMAIL_COLOURS, escapeHtml, PORTAL_BUTTON_LABEL, portalUrlFrom, renderEmailHtml } from "./emailHtml.ts";
import { CUSTOMER_PORTAL_URL, SALON_LOCATION } from "./salonConstants.ts";

const CONFIRMED = "Hi Sarah, Bella is booked in for a Full Groom on Tue 25 Nov at 9:00am. See you then!";
const textOf = (html: string) =>
  html
    .replace(/<div style="display:none[^>]*>.*?<\/div>/s, "")
    .replace(/<title>.*?<\/title>/s, "")
    .replace(/<br>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;|&middot;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

Deno.test("carries the plain-text words unchanged inside the salon's frame", () => {
  const html = renderEmailHtml(CONFIRMED, { subject: "Booking confirmed", portalUrl: CUSTOMER_PORTAL_URL });
  assertStringIncludes(textOf(html), CONFIRMED);
  assertStringIncludes(html, "Smarter Dog Grooming");
  assertStringIncludes(html, `<title>Booking confirmed</title>`);
});

Deno.test("escapes anything a customer or staff member typed", () => {
  const html = renderEmailHtml(`Hi <b>Sam</b> & "Rex's" owner <script>alert(1)</script>`, { subject: "A <subject> & more" });
  assert(!html.includes("<script>"), "no raw script tag");
  assert(!html.includes("<b>Sam</b>"), "no raw markup from the text");
  assertStringIncludes(html, "Hi &lt;b&gt;Sam&lt;/b&gt; &amp; &quot;Rex&#39;s&quot; owner");
  assertStringIncludes(html, "<title>A &lt;subject&gt; &amp; more</title>");
});

Deno.test("keeps paragraphs and line breaks from the text", () => {
  const html = renderEmailHtml("Waitlist Alert\n\nSam has joined.\nDogs: Bella\n\n\nLog in to manage it.", { subject: "s" });
  const paragraphs = html.match(/<p style="margin:0 0 16px;">/g) ?? [];
  assertEquals(paragraphs.length, 3);
  assertStringIncludes(html, "Sam has joined.<br>Dogs: Bella");
});

Deno.test("turns web addresses into links, leaving sentence punctuation outside", () => {
  const html = renderEmailHtml("See https://smarterdog.co.uk/book/login?a=1&b=2. Thanks!", { subject: "s" });
  assertStringIncludes(
    html,
    `<a href="https://smarterdog.co.uk/book/login?a=1&amp;b=2" style="color:${EMAIL_COLOURS.brandBlue};text-decoration:underline;">https://smarterdog.co.uk/book/login?a=1&amp;b=2</a>. Thanks!`,
  );
});

Deno.test("a link cannot break out of its attribute", () => {
  const html = renderEmailHtml(`Go to https://example.test/"onmouseover="x now`, { subject: "s" });
  assert(!html.includes(`"onmouseover="`), "a quote ends the link instead of entering the markup");
  assertStringIncludes(html, `<a href="https://example.test/"`);
});

Deno.test("customer emails get the yellow portal button; staff emails do not", () => {
  const customer = renderEmailHtml(CONFIRMED, { subject: "s", portalUrl: CUSTOMER_PORTAL_URL });
  assertStringIncludes(customer, `href="${CUSTOMER_PORTAL_URL}"`);
  assertStringIncludes(customer, PORTAL_BUTTON_LABEL);
  assertStringIncludes(customer, `bgcolor="${EMAIL_COLOURS.yellow}" style="background:${EMAIL_COLOURS.yellow};border-radius:999px;"`);

  const staff = renderEmailHtml("Waitlist Alert", { subject: "s", portalUrl: null });
  assert(!staff.includes(PORTAL_BUTTON_LABEL), "no customer button on a staff alert");
});

Deno.test("draws the flyer stripe as nine coloured cells filling the row", () => {
  const html = renderEmailHtml(CONFIRMED, { subject: "s" });
  const segments = [...html.matchAll(/<td width="([\d.]+)%" height="7" bgcolor="(#[0-9A-F]{6})"/g)];
  assertEquals(segments.map((m) => m[2]), [
    EMAIL_COLOURS.flyerBlue, EMAIL_COLOURS.flyerBlue, EMAIL_COLOURS.yellow, EMAIL_COLOURS.flyerBlue,
    EMAIL_COLOURS.navy, EMAIL_COLOURS.flyerBlue, EMAIL_COLOURS.flyerBlue, EMAIL_COLOURS.flyerBlue, EMAIL_COLOURS.yellow,
  ]);
  const gaps = (html.match(/<td width="1%"/g) ?? []).length;
  const total = segments.reduce((sum, m) => sum + Number(m[1]), 0) + gaps;
  assertEquals(gaps, 8);
  assertEquals(Math.round(total * 10) / 10, 100);
});

Deno.test("signs off with the salon's name and address, in a readable grey", () => {
  const html = renderEmailHtml(CONFIRMED, { subject: "s" });
  assertStringIncludes(html, `${escapeHtml(SALON_LOCATION.name)} &middot; ${escapeHtml(SALON_LOCATION.address)}`);
  assertStringIncludes(html, `color:${EMAIL_COLOURS.muted};">${escapeHtml(SALON_LOCATION.name)}`);
});

Deno.test("uses no images, web fonts or style blocks, which email clients block or strip", () => {
  const html = renderEmailHtml(CONFIRMED, { subject: "s", portalUrl: CUSTOMER_PORTAL_URL });
  assert(!/<img\b/i.test(html), "no images");
  assert(!/<style\b/i.test(html), "no style block");
  assert(!/<link\b/i.test(html), "no external stylesheet or font");
  assert(!/@import|@font-face/.test(html), "no font loading");
});

Deno.test("shows the start of the message as the inbox preview", () => {
  const html = renderEmailHtml(CONFIRMED, { subject: "s" });
  assertStringIncludes(html, `mso-hide:all;">${escapeHtml(CONFIRMED)}</div>`);
});

Deno.test("the portal link can be overridden per environment, falling back to production", () => {
  assertEquals(portalUrlFrom(undefined), CUSTOMER_PORTAL_URL);
  assertEquals(portalUrlFrom("   "), CUSTOMER_PORTAL_URL);
  assertEquals(portalUrlFrom(" https://staging.test/book/login "), "https://staging.test/book/login");
});
