import {
  getCharacterById,
  updateCharacterDb,
  deleteCharacterDb,
} from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const character = getCharacterById(id);
  if (!character)
    return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(character);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await request.json();
  updateCharacterDb({ ...data, id });
  return Response.json({ ...data, id });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteCharacterDb(id);
  return Response.json({ ok: true });
}
