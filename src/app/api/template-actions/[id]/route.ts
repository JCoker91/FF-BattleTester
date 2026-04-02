import { updateTemplateActionDb, deleteTemplateActionDb } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await request.json();
  updateTemplateActionDb({ ...data, id });
  return Response.json({ ...data, id });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteTemplateActionDb(id);
  return Response.json({ ok: true });
}
