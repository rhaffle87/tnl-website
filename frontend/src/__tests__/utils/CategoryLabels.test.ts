import { describe, expect, it } from "vitest";
import { categoryKey, localizeCategory } from "@/lib/i18n/categoryLabels";

describe("categoryLabels", () => {
  it.each([
    ["Research", "research", "Riset"],
    ["Community Service", "community-service", "Pengabdian Masyarakat"],
    ["Training", "training", "Pelatihan"],
    ["Announcement", "announcement", "Pengumuman"],
  ])("maps canonical category %s to a stable key and Indonesian label", (raw, key, id) => {
    expect(categoryKey(raw)).toBe(key);
    expect(localizeCategory(raw, "id")).toBe(id);
    expect(localizeCategory(raw, "en")).toBe(raw);
  });

  it("maps Indonesian canonical labels back to the same key", () => {
    expect(categoryKey("Riset")).toBe("research");
    expect(categoryKey("Pengabdian Masyarakat")).toBe("community-service");
    expect(localizeCategory("Riset", "en")).toBe("Research");
    expect(localizeCategory("Pengumuman", "en")).toBe("Announcement");
  });

  it("falls back to the raw label and a slugified raw key for unknown categories", () => {
    expect(localizeCategory("Quantum & Optics", "id")).toBe("Quantum & Optics");
    expect(localizeCategory("Quantum & Optics", "en")).toBe("Quantum & Optics");
    expect(categoryKey("Quantum & Optics")).toBe("quantum-optics");
    expect(categoryKey("  Future   Lab/Workshop  ")).toBe("future-lab-workshop");
  });
});
