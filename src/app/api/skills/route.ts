import { getAllSkills, insertSkill } from "@/lib/db";

export async function GET() {
  return Response.json(getAllSkills());
}

export async function POST(request: Request) {
  const data = await request.json();
  const skill = insertSkill(data);
  return Response.json(skill, { status: 201 });
}
