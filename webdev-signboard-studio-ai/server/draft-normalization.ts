const HEX_6 = /^#?[0-9a-fA-F]{6}$/;
const HEX_3 = /^#?[0-9a-fA-F]{3}$/;

type DraftElementKind = "text" | "image" | "rectangle" | "ellipse" | "line";

type DraftObject = Record<string, unknown>;

function isDraftObject(value: unknown): value is DraftObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normaliseColour(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const colour = value.trim();
  if (HEX_6.test(colour)) return `#${colour.replace(/^#/, "").toUpperCase()}`;
  if (HEX_3.test(colour)) {
    const [red, green, blue] = colour.replace(/^#/, "").split("");
    return `#${red}${red}${green}${green}${blue}${blue}`.toUpperCase();
  }
  return fallback;
}

function fallbackColour(kind: unknown): string {
  if (kind === "text" || kind === "line") return "#101828";
  if (kind === "rectangle" || kind === "ellipse") return "#D1D5DB";
  // Image layers do not render a colour. Supplying a canonical value keeps an
  // otherwise valid image layer from invalidating the whole draft.
  return "#FFFFFF";
}

/**
 * Vision models may emit empty colour strings for image layers because the
 * field has no visual meaning there. Convert only colour notation; all layout
 * content remains subject to the strict draft schema afterwards.
 */
export function normaliseDraftPayload(payload: unknown): unknown {
  if (!isDraftObject(payload)) return payload;
  const elements = payload.elements;
  if (!Array.isArray(elements)) return payload;

  return {
    ...payload,
    background: normaliseColour(payload.background, "#FFFFFF"),
    elements: elements.map((element) => {
      if (!isDraftObject(element)) return element;
      return {
        ...element,
        color: normaliseColour(element.color, fallbackColour(element.kind as DraftElementKind)),
      };
    }),
  };
}
