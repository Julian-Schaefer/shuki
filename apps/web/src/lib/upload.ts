export async function uploadPaperFile(paperId: string, file: File): Promise<void> {
  const response = await fetch(`/api/papers/${paperId}/file`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": file.type || "application/pdf",
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Upload failed (${response.status})`);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
