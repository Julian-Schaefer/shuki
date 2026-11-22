import { useNavigate, useSearch } from "@tanstack/react-router";

/** Open/close the right-hand preview panel (stored in the `preview` search param). */
export function usePreview() {
  const { preview } = useSearch({ from: "/_app" });
  const navigate = useNavigate();
  return {
    previewId: preview,
    open: (paperId: string) =>
      navigate({ to: ".", search: (prev) => ({ ...prev, preview: paperId }) }),
    close: () => navigate({ to: ".", search: (prev) => ({ ...prev, preview: undefined }) }),
  };
}
