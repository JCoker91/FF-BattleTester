import { getSkillById, updateSkillDb, deleteSkillDb } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const skill = getSkillById(id);
  if (!skill) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(skill);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await request.json();
  updateSkillDb({ ...data, id });
  return Response.json({ ...data, id });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteSkillDb(id);
  return Response.json({ ok: true });
}
