import { getAllTeams } from "@/lib/db";

export async function GET() {
  return Response.json(getAllTeams());
}
