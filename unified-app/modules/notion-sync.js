import { Client } from "@notionhq/client";

const NOTION_KEY = process.env.NOTION_API_KEY;
const notion = NOTION_KEY ? new Client({ auth: NOTION_KEY }) : null;

/**
 * Append a log entry to Bridge Logs DB with exact schema.
 */
export async function appendLogEntry(databaseId, {
  event = "Bridge Log",
  level = "info",
  kind = "",
  source = "unified-app",
  executor = "unified-app@localhost",
  intent = "",
  outcome = "success",
  mode = "apply",
  payload = null,
  trace_id = null,
  reason_code = null,
  latency_ms = null,
}) {
  if (!notion) {
    return { ok: false, error: "No NOTION_API_KEY" };
  }
  try {
    const properties = {
      Event: { title: [{ text: { content: event } }] },
      Timestamp: { date: { start: new Date().toISOString() } },
      Level: { select: { name: level } },
      Kind: { rich_text: [{ text: { content: kind } }] },
      Source: { rich_text: [{ text: { content: source } }] },
      Executor: { rich_text: [{ text: { content: executor } }] },
      intent: { rich_text: [{ text: { content: intent } }] },
      outcome: { select: { name: outcome } },
      mode: { select: { name: mode } },
    };
    
    if (payload) {
      properties.Payload = { rich_text: [{ text: { content: typeof payload === "object" ? JSON.stringify(payload) : payload } }] };
    }
    if (trace_id) {
      properties.trace_id = { rich_text: [{ text: { content: trace_id } }] };
    }
    if (reason_code) {
      properties.reason_code = { rich_text: [{ text: { content: reason_code } }] };
    }
    if (latency_ms !== null) {
      properties.latency_ms = { number: latency_ms };
    }

    await notion.pages.create({
      parent: { database_id: databaseId },
      properties,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Ping Notion — test the connection.
 */
export async function pingNotion() {
  if (!notion) {
    return { ok: false, error: "No NOTION_API_KEY" };
  }
  try {
    const me = await notion.users.me();
    return { ok: true, user: me.name ?? me.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Fetch a page by ID.
 */
export async function fetchPage(pageId) {
  if (!notion) {
    return { ok: false, error: "No NOTION_API_KEY" };
  }
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    return { ok: true, id: page.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export default { fetchPage, appendLogEntry, pingNotion };