import { resetTeamsDb, getAllTeams } from "@/lib/db";

export async function POST() {
  resetTeamsDb();
  return Response.json(getAllTeams());
}
