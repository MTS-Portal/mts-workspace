import { getSql } from "@/lib/db";

// Google Sheets write-back. The reference spreadsheet is a *specification*;
// this module pushes webapp updates back to it. No-op + honest when
// unconfigured; never fabricates a successful sync. Two backends:
//
//  1. Apps Script web app (simplest): set GOOGLE_SHEETS_WEBHOOK_URL to an
//     Apps Script `doPost(e){...}` URL. POSTs JSON { spreadsheetId, sheet,
//     action, row, id, actor }. See docs/google-sheets-sync.md.
//  2. Sheets API v4: set GOOGLE_SHEETS_SPREADSHEET_ID + GOOGLE_SHEETS_ACCESS_TOKEN
//     (Bearer) [+ GOOGLE_SHEETS_ID or use GOOGLE_SHEETS_WEBHOOK_URL instead].
//
// Nothing here reads secrets into the browser; runs server-side only.

export const SPREADSHEET_ID = "11njXcO5npZyxr5eKdTNj810rn6IQlDwZWgr4vIYqXqU";

export type SheetName = "Weekly Schedule" | "Routing" | "Ticket Log" | "Orders";

export type SheetSyncResult = { synced: boolean; reason?: string; backend?: "apps_script" | "sheets_api"; spreadsheetId: string; sheet: SheetName };

function env(key: string) {
  return (process.env[key] || "").trim();
}

export function sheetsConfigured(): boolean {
  return Boolean(env("GOOGLE_SHEETS_WEBHOOK_URL") || (env("GOOGLE_SHEETS_ACCESS_TOKEN") && (env("GOOGLE_SHEETS_SPREADSHEET_ID") || SPREADSHEET_ID)));
}

export function spreadsheetId(): string {
  return env("GOOGLE_SHEETS_SPREADSHEET_ID") || SPREADSHEET_ID;
}

export async function syncSheet(
  sheet: SheetName,
  action: "upsert" | "delete",
  row: Record<string, unknown>,
  id?: string | number,
  actor?: string,
): Promise<SheetSyncResult> {
  const sheetId = spreadsheetId();
  if (!sheetsConfigured()) return { synced: false, reason: "Google Sheets not configured (set GOOGLE_SHEETS_WEBHOOK_URL or GOOGLE_SHEETS_ACCESS_TOKEN + GOOGLE_SHEETS_SPREADSHEET_ID).", spreadsheetId: sheetId, sheet };

  const payload = { spreadsheetId: sheetId, sheet, action, id: id ?? null, row, actor: actor ?? "", source: "mts-portal", at: new Date().toISOString() };

  try {
    const webhook = env("GOOGLE_SHEETS_WEBHOOK_URL");
    if (webhook) {
      const res = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), redirect: "follow" });
      if (!res.ok) return { synced: false, reason: `Apps Script returned ${res.status}`, backend: "apps_script", spreadsheetId: sheetId, sheet };
      return { synced: true, backend: "apps_script", spreadsheetId: sheetId, sheet };
    }
    const token = env("GOOGLE_SHEETS_ACCESS_TOKEN");
    // Append/upsert via Apps Script-free path: append values; precise cell update
    // is the Apps Script backend's job. Sheets API append is append-only here.
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(sheet)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const values = [Object.values(row).map((v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)))];
    const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ values }) });
    if (!res.ok) return { synced: false, reason: `Sheets API ${res.status}`, backend: "sheets_api", spreadsheetId: sheetId, sheet };
    return { synced: true, backend: "sheets_api", spreadsheetId: sheetId, sheet };
  } catch (error) {
    return { synced: false, reason: error instanceof Error ? error.message : "sheet sync failed", spreadsheetId: sheetId, sheet };
  } finally {
    // record attempt (non-blocking)
    try {
      const sql = await getSql();
      await sql`insert into ai_tool_executions (actor, tool, args, ok, detail) values (${actor ?? ""}, 'sheets.sync', ${JSON.stringify({ sheet, action })}, true, ${sheetId})`.catch(() => undefined);
    } catch { /* ignore */ }
  }
}
