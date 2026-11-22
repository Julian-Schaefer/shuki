import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/page-header";

export const Route = createFileRoute("/_app/search")({
  component: () => (
    <ComingSoon
      title="Search"
      description="Full-text search across papers and notes, plus optional semantic search when an AI provider is configured."
    />
  ),
});
