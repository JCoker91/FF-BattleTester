import { getAllEffectTagTypes } from "@/lib/db";

export async function GET() {
  return Response.json(getAllEffectTagTypes());
}
