import { exportSnapshot, importSnapshot, DbSnapshot } from "@/lib/db";
import path from "path";
import fs from "fs";

// Source-controlled snapshot lives at <repo>/db/snapshot.json.
// /data/ is gitignored (it holds the live sqlite db); /db/ is committed.
const snapshotDir = path.join(process.cwd(), "db");
const snapshotPath = path.join(snapshotDir, "snapshot.json");

// GET: write the current db state to db/snapshot.json and return a summary.
export async function GET() {
  const snapshot = exportSnapshot();
  if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), "utf-8");
  const totalRows = Object.values(snapshot.tables).reduce((sum, rows) => sum + rows.length, 0);
  return Response.json({
    ok: true,
    path: "db/snapshot.json",
    exportedAt: snapshot.exportedAt,
    tables: Object.keys(snapshot.tables).length,
    rows: totalRows,
  });
}

// POST: load db/snapshot.json and overwrite the current db.
// Body is ignored — we always read from the canonical file path.
export async function POST() {
  if (!fs.existsSync(snapshotPath)) {
    return Response.json({ ok: false, error: "db/snapshot.json not found." }, { status: 404 });
  }
  let snapshot: DbSnapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8")) as DbSnapshot;
  } catch (e) {
    return Response.json({ ok: false, error: `Failed to parse snapshot: ${(e as Error).message}` }, { status: 400 });
  }
  try {
    const result = importSnapshot(snapshot);
    return Response.json({ ok: true, ...result, exportedAt: snapshot.exportedAt });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
