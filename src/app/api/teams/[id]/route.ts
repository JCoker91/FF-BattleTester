import { updateTeamDb } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await request.json();
  updateTeamDb({ ...data, id });
  return Response.json({ ...data, id });
}
