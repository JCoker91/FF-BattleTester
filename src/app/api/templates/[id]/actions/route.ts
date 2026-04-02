import { getActionsByTemplateId, insertTemplateAction } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return Response.json(getActionsByTemplateId(id));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await request.json();
  const action = insertTemplateAction({ ...data, templateId: id });
  return Response.json(action, { status: 201 });
}
