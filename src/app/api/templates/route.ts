import { getAllTemplates, insertTemplate } from "@/lib/db";

export async function GET() {
  return Response.json(getAllTemplates());
}

export async function POST(request: Request) {
  const data = await request.json();
  const template = insertTemplate(data);
  return Response.json(template, { status: 201 });
}
