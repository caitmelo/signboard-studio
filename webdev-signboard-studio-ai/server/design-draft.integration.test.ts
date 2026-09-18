import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const runLiveTest = process.env.RUN_LIVE_AI_TEST === "true";
const fixturePath = new URL("./fixtures/signboard-reference.png", import.meta.url);

describe("designDraft.create", () => {
  it.skipIf(!runLiveTest)("returns a validated editable layout from the reference fixture", async () => {
    const image = await readFile(fixturePath);
    const ctx = {
      user: null,
      req: { ip: "127.0.0.1", headers: {} },
      res: {},
    } as unknown as TrpcContext;

    const result = await appRouter.createCaller(ctx).designDraft.create({
      image: `data:image/png;base64,${image.toString("base64")}`,
    });

    expect(result.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(result.elements.length).toBeGreaterThan(0);
    expect(result.elements.length).toBeLessThanOrEqual(60);
    expect(result.elements.some((element) => element.kind === "text")).toBe(true);
  }, 120_000);
});
