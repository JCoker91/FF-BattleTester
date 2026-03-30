import { updateSeriesDb, deleteSeriesDb } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name } = await request.json();
  updateSeriesDb(id, name);
  return Response.json({ id, name });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteSeriesDb(id);
  return Response.json({ ok: true });
}
