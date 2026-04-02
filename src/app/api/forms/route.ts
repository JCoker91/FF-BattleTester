import { getAllForms, insertForm } from "@/lib/db";

export async function GET() {
  return Response.json(getAllForms());
}

export async function POST(request: Request) {
  const { characterId, name } = await request.json();
  const form = insertForm(characterId, name);
  return Response.json(form, { status: 201 });
}
