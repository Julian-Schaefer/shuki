import { MessageSquarePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Lives inside the scroll container so it moves with the content. */
export function AnnotateButton({
  top,
  left,
  onClick,
}: {
  top: number;
  left: number;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      className="absolute z-20 -translate-x-1/2 shadow-md"
      style={{ top, left }}
      // Keep the selection alive while clicking.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <MessageSquarePlusIcon /> Note
    </Button>
  );
}

export function buttonPosition(range: Range, scrollContainer: HTMLElement) {
  const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
  const last = rects.at(-1) ?? range.getBoundingClientRect();
  const box = scrollContainer.getBoundingClientRect();
  const left = last.left + last.width / 2 - box.left + scrollContainer.scrollLeft;
  return {
    top: last.bottom - box.top + scrollContainer.scrollTop + 6,
    left: Math.min(Math.max(left, 48), scrollContainer.scrollWidth - 48),
  };
}
