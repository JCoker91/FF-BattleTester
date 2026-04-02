import { getAllCharacterSkills, insertCharacterSkill } from "@/lib/db";

export async function GET() {
  return Response.json(getAllCharacterSkills());
}

export async function POST(request: Request) {
  const data = await request.json();
  const cs = insertCharacterSkill(data);
  return Response.json(cs, { status: 201 });
}
