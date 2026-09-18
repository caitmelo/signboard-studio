export type ReferenceFileKind = "image" | "pdf" | null;

export function referenceFileKind(name: string, mimeType: string): ReferenceFileKind {
  if (mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (mimeType === "image/jpeg" || mimeType === "image/png") return "image";
  return null;
}
