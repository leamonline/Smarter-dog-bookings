#!/usr/bin/env node
// Manage WhatsApp Flows via the Meta Graph API.
//
// Subcommands:
//   set-public-key                      Upload flow-keys/public.pem to Meta
//   create <name>                       Create a flow (APPOINTMENT_BOOKING), print its id
//   update-endpoint <flowId> <uri>      Set the flow's data endpoint URI
//   upload <flowId> <path>              Upload flow JSON; prints validation_errors
//   publish <flowId>                    Publish the flow (deliberate, separate step)
//   status <flowId>                     Show flow status + validation errors
//   deploy <name> <path>                create → update-endpoint → upload (NOT publish)
//
// Env (export in your shell — these are Edge secrets, not .env.local):
//   META_ACCESS_TOKEN   (required)
//   META_WABA_ID        (create / deploy)
//   META_PHONE_NUMBER_ID(set-public-key)
//   FLOW_ENDPOINT_URI   (update-endpoint / deploy) — your deployed
//                       whatsapp-flow-endpoint URL
//   META_GRAPH_VERSION  (optional, default v22.0)
//
// NOTE: written to Meta's documented API shapes (Graph v22.0). Cross-check
// against current docs if Meta changes the Flows endpoints.

import { readFileSync } from "node:fs";

const VERSION = process.env.META_GRAPH_VERSION || "v22.0";
const TOKEN = process.env.META_ACCESS_TOKEN;
const BASE = `https://graph.facebook.com/${VERSION}`;

function need(name) {
  const v = process.env[name];
  if (!v) fail(`Missing required env var: ${name}`);
  return v;
}

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

async function graph(method, path, { json, form, formData } = {}) {
  const headers = { Authorization: `Bearer ${TOKEN}` };
  let body;
  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  } else if (formData) {
    body = formData; // fetch sets the multipart boundary
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    fail(`Meta ${res.status} on ${method} ${path}: ${JSON.stringify(data, null, 2)}`);
  }
  return data;
}

async function setPublicKey() {
  if (!TOKEN) fail("Missing META_ACCESS_TOKEN");
  const phoneId = need("META_PHONE_NUMBER_ID");
  const publicKey = readFileSync("flow-keys/public.pem", "utf8");
  const data = await graph("POST", `/${phoneId}/whatsapp_business_encryption`, {
    form: { business_public_key: publicKey },
  });
  console.log("✅ Public key uploaded:", JSON.stringify(data));
}

async function createFlow(name) {
  if (!name) fail("Usage: create <name>");
  const wabaId = need("META_WABA_ID");
  const data = await graph("POST", `/${wabaId}/flows`, {
    json: { name, categories: ["APPOINTMENT_BOOKING"] },
  });
  console.log(`✅ Created flow "${name}" → id ${data.id}`);
  return data.id;
}

async function updateEndpoint(flowId, uri) {
  if (!flowId || !uri) fail("Usage: update-endpoint <flowId> <endpoint_uri>");
  await graph("POST", `/${flowId}`, { json: { endpoint_uri: uri } });
  console.log(`✅ Set endpoint_uri on ${flowId} → ${uri}`);
}

async function uploadJson(flowId, path) {
  if (!flowId || !path) fail("Usage: upload <flowId> <path-to-flow.json>");
  const content = readFileSync(path, "utf8");
  JSON.parse(content); // fail fast on malformed JSON
  const fd = new FormData();
  fd.append("name", "flow.json");
  fd.append("asset_type", "FLOW_JSON");
  fd.append("file", new Blob([content], { type: "application/json" }), "flow.json");
  const data = await graph("POST", `/${flowId}/assets`, { formData: fd });
  const errors = data.validation_errors ?? [];
  if (errors.length) {
    console.log("⚠️  Uploaded with validation errors:");
    console.log(JSON.stringify(errors, null, 2));
  } else {
    console.log("✅ Uploaded flow JSON — no validation errors.");
  }
  return errors;
}

async function publishFlow(flowId) {
  if (!flowId) fail("Usage: publish <flowId>");
  const data = await graph("POST", `/${flowId}/publish`);
  console.log("✅ Published:", JSON.stringify(data));
}

async function status(flowId) {
  if (!flowId) fail("Usage: status <flowId>");
  const data = await graph(
    "GET",
    `/${flowId}?fields=id,name,status,categories,validation_errors,endpoint_uri`,
  );
  console.log(JSON.stringify(data, null, 2));
}

async function deploy(name, path) {
  if (!name || !path) fail("Usage: deploy <name> <path-to-flow.json>");
  const uri = need("FLOW_ENDPOINT_URI");
  const flowId = await createFlow(name);
  await updateEndpoint(flowId, uri);
  const errors = await uploadJson(flowId, path);
  console.log(`\nFlow ${flowId} is staged${errors.length ? " WITH validation errors (fix then re-upload)" : ""}.`);
  console.log(`When happy, publish it:\n   npm run flow:publish -- publish ${flowId}\n`);
}

const [cmd, ...args] = process.argv.slice(2);
const commands = {
  "set-public-key": () => setPublicKey(),
  create: () => createFlow(args[0]),
  "update-endpoint": () => updateEndpoint(args[0], args[1]),
  upload: () => uploadJson(args[0], args[1]),
  publish: () => publishFlow(args[0]),
  status: () => status(args[0]),
  deploy: () => deploy(args[0], args[1]),
};

if (!cmd || !commands[cmd]) {
  console.log("Usage: node scripts/publish-flow.mjs <command> [args]");
  console.log("Commands: set-public-key | create <name> | update-endpoint <flowId> <uri> |");
  console.log("          upload <flowId> <path> | publish <flowId> | status <flowId> |");
  console.log("          deploy <name> <path>");
  process.exit(cmd ? 1 : 0);
}

if (!TOKEN) fail("Missing META_ACCESS_TOKEN");
commands[cmd]().catch((err) => fail(err.message));
