import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/page-header";

export const Route = createFileRoute("/_app/notes")({
  component: () => (
    <ComingSoon
      title="Notes"
      description="Write notes, link them to papers and to each other. The note concept is being designed."
    />
  ),
});
