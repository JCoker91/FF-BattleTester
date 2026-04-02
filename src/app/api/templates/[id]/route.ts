import { updateTemplateDb, deleteTemplateDb } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await request.json();
  updateTemplateDb({ ...data, id });
  return Response.json({ ...data, id });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteTemplateDb(id);
  return Response.json({ ok: true });
}
