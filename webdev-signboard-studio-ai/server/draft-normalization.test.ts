import { describe, expect, it } from "vitest";
import { normaliseDraftPayload } from "./draft-normalization";

describe("normaliseDraftPayload", () => {
  it("retains an otherwise valid vision draft when image layers use empty colours", () => {
    const result = normaliseDraftPayload({
      background: "#fff",
      notes: [],
      elements: [
        { kind: "image", color: "", label: "Property photo" },
        { kind: "text", color: "#123", label: "Address" },
        { kind: "line", color: "", label: "Divider" },
      ],
    }) as { background: string; elements: Array<{ color: string }> };

    expect(result.background).toBe("#FFFFFF");
    expect(result.elements.map((element) => element.color)).toEqual(["#FFFFFF", "#112233", "#101828"]);
  });

  it("does not alter valid six-digit colours", () => {
    const result = normaliseDraftPayload({
      background: "#1b334c",
      elements: [{ kind: "rectangle", color: "#0087B9" }],
    }) as { background: string; elements: Array<{ color: string }> };

    expect(result.background).toBe("#1B334C");
    expect(result.elements[0]?.color).toBe("#0087B9");
  });
});
