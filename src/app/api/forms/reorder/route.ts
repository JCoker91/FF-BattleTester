import { reorderFormsDb, getFormsByCharacterId } from "@/lib/db";

export async function POST(request: Request) {
  const { characterId, orderedIds } = await request.json();
  reorderFormsDb(characterId, orderedIds);
  return Response.json(getFormsByCharacterId(characterId));
}
