import { useNavigate, useSearch } from "@tanstack/react-router";

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
