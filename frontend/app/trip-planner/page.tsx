import { redirect } from "next/navigation";

// Trip Planner is temporarily retired. The live award pipeline returns stale
// point/cash values for some routes (e.g. YYZ→LHR), so rather than surface
// unverified flight data the route redirects home for now. The full, working
// implementation is preserved untouched in `page.original.tsx` — restore it by
// renaming that file back to `page.tsx` and re-adding the nav entry in
// components/layout/sidebar.tsx.
export default function TripPlannerPage(): never {
  redirect("/");
}
