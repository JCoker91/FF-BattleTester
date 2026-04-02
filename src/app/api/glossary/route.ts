import { getAllGlossary, insertGlossary } from "@/lib/db";

export async function GET() {
  return Response.json(getAllGlossary());
}

export async function POST(request: Request) {
  const data = await request.json();
  const entry = insertGlossary(data);
  return Response.json(entry, { status: 201 });
}
