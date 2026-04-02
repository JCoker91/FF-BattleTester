import { updateGlossaryDb, deleteGlossaryDb } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await request.json();
  updateGlossaryDb({ ...data, id });
  return Response.json({ ...data, id });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteGlossaryDb(id);
  return Response.json({ ok: true });
}
