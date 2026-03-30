import { getAllSeries, insertSeries } from "@/lib/db";

export async function GET() {
  return Response.json(getAllSeries());
}

export async function POST(request: Request) {
  const { name } = await request.json();
  const series = insertSeries(name);
  return Response.json(series, { status: 201 });
}
