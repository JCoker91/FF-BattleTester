import { reorderSeriesDb, getAllSeries } from "@/lib/db";

export async function POST(request: Request) {
  const { orderedIds } = await request.json();
  reorderSeriesDb(orderedIds);
  return Response.json(getAllSeries());
}
