import { Loader2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RouterOutputs } from "@/lib/trpc";

type Status = RouterOutputs["paper"]["list"][number]["status"];

const labels: Record<Status, string> = {
  pending: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: Status }) {
  const busy = status === "pending" || status === "processing";
  return (
    <Badge
      variant={status === "failed" ? "destructive" : status === "ready" ? "secondary" : "outline"}
    >
      {busy && <Loader2Icon className="animate-spin" />}
      {labels[status]}
    </Badge>
  );
}

export const isBusy = (status: Status) => status === "pending" || status === "processing";
