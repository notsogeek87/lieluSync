import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/auth/session";
import { getOverview } from "./overview";

/** Loads the signed-in user's overview, or sends visitors back to the home page. */
export async function requireOverview() {
  const userId = await currentUserId();
  if (!userId) redirect("/?login=required");
  const overview = await getOverview(userId);
  if (!overview) redirect("/");
  return overview;
}
