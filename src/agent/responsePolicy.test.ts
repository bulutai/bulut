import { describe, expect, it } from "vitest";
import {
  NON_FINAL_MAX_CHARS,
  NON_FINAL_MAX_WORDS,
  FINAL_MAX_CHARS,
  FINAL_MAX_WORDS,
  trimNonFinalReply,
  trimFinalReply,
  shouldSpeakMidSessionReply,
  buildRuntimePolicyContext,
} from "./responsePolicy";

describe("responsePolicy", () => {
  it("trims non-final replies to configured limits", () => {
    const input = "Aynı cümle. Aynı cümle. " + "kelime ".repeat(80);
    const trimmed = trimNonFinalReply(input);

    expect(trimmed.length).toBeLessThanOrEqual(NON_FINAL_MAX_CHARS + 3);
    expect(trimmed.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(NON_FINAL_MAX_WORDS);
    expect(trimmed.toLowerCase().match(/aynı cümle\./g)?.length ?? 0).toBe(1);
  });

  it("trims final replies to configured limits", () => {
    const input = "sonuç ".repeat(200);
    const trimmed = trimFinalReply(input);

    expect(trimmed.length).toBeLessThanOrEqual(FINAL_MAX_CHARS + 3);
    expect(trimmed.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(FINAL_MAX_WORDS);
  });

  it("speaks mid-session only for confirmation/clarification prompts", () => {
    expect(shouldSpeakMidSessionReply("Devam etmek için onaylıyor musunuz?")).toBe(true);
    expect(shouldSpeakMidSessionReply("Proceed without confirmation")).toBe(true);
    expect(shouldSpeakMidSessionReply("İşlem tamamlandı")).toBe(false);
  });

  it("injects runtime policy metadata into page context", () => {
    const context = buildRuntimePolicyContext("Sayfa özeti");
    expect(context).toContain("BULUT_AGENT_RUNTIME_POLICY_V1");
    expect(context).toContain("click: if target changes domain");
    expect(context).toContain("navigate: internal route change only");
    expect(context).toContain("getpagecontext");
    expect(context).toContain("Sayfa özeti");
  });

  it("does not duplicate policy marker when already present", () => {
    const base = "BULUT_AGENT_RUNTIME_POLICY_V1";
    expect(buildRuntimePolicyContext(base)).toBe(base);
  });
});
