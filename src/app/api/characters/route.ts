import { getAllCharacters, insertCharacter } from "@/lib/db";

export async function GET() {
  return Response.json(getAllCharacters());
}

export async function POST(request: Request) {
  const data = await request.json();
  const character = insertCharacter(data);
  return Response.json(character, { status: 201 });
}
