import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden="true">
      <rect width="32" height="32" rx="7" className="fill-primary" />
      <path
        d="M10 9h9l3 3v11H10z"
        fill="none"
        className="stroke-primary-foreground"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M13 16h6M13 19.5h4"
        className="stroke-primary-foreground"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
