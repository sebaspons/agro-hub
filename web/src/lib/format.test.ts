import { describe, expect, it } from "vitest";
import { fmtMoneyShort, fmtPct, fmtValue } from "./format";

describe("format", () => {
  it("compacta millones", () => {
    expect(fmtMoneyShort(1_500_000)).toBe("$1.5 M");
    expect(fmtMoneyShort(2_000_000_000)).toBe("$2.0 B");
  });

  it("formatea porcentajes", () => {
    expect(fmtPct(23.456)).toBe("23.5%");
  });

  it("fmtValue respeta el formato", () => {
    expect(fmtValue(50, "pct")).toBe("50.0%");
    expect(fmtValue(1000, "int")).toContain("1");
  });
});
