import { connection } from "next/server";
import { loadPlan } from "@trng/backend/planner/store";
import { Planner } from "@/components/planner/Planner";

/** Training Planner tab: the saved plan, edited and optimised in the browser. */
export default async function PlannerPage() {
  await connection(); // always render per request: the plan changes
  return <Planner initial={await loadPlan()} />;
}
