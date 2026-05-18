import { Client } from "@notionhq/client";

const NOTION_KEY = process.env.NOTION_API_KEY;
const notion = NOTION_KEY ? new Client({ auth: NOTION_KEY }) : null;

/**
 * Fetch a page by ID — confirms read access is live.
 */
export async function fetchPage(pageId) {
  if (!notion) {
    return { ok: false, error: 'No NOTION_API_KEY' };
  }
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    return { ok: true, id: page.id, title: page.properties?.title ?? null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Append a log entry to a Notion database.
 */
export async function appendLogEntry(databaseId, { message, level = "info", source = "unified-app" }) {
  if (!notion) {
    return { ok: false, error: 'No NOTION_API_KEY' };
  }
  try {
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Name: {
          title: [{ text: { content: message } }],
        },
        Level: {
          select: { name: level },
        },
        Source: {
          rich_text: [{ text: { content: source } }],
        },
        Timestamp: {
          date: { start: new Date().toISOString() },
        },
      },
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
    return { ok: false, error: 'No NOTION_API_KEY' };
  }
  try {
    const me = await notion.users.me();
    return { ok: true, user: me.name ?? me.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export default { fetchPage, appendLogEntry, pingNotion };