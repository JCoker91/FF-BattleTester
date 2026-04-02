import { getAllStatusEffects, insertStatusEffect } from "@/lib/db";

export async function GET() {
  return Response.json(getAllStatusEffects());
}

export async function POST(request: Request) {
  const data = await request.json();
  const effect = insertStatusEffect(data);
  return Response.json(effect, { status: 201 });
}
