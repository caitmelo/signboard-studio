import { describe, expect, it } from "vitest";
import { referenceFileKind } from "../client/src/lib/reference-file";

describe("referenceFileKind", () => {
  it("accepts PDFs by MIME type or filename", () => {
    expect(referenceFileKind("design.pdf", "application/pdf")).toBe("pdf");
    expect(referenceFileKind("DESIGN.PDF", "")).toBe("pdf");
  });

  it("accepts supported reference images and rejects other files", () => {
    expect(referenceFileKind("design.jpg", "image/jpeg")).toBe("image");
    expect(referenceFileKind("design.png", "image/png")).toBe("image");
    expect(referenceFileKind("design.webp", "image/webp")).toBeNull();
  });
});
