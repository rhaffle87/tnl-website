import { describe, expect, it } from "vitest";
import { B301_MAP_URL, getContactMapLinks } from "@/lib/contact-map";

describe("contact map CMS overrides", () => {
  it.each([
    undefined, null, "", "   ", "not a URL", "javascript:alert(1)",
    "https://example.org/maps?q=-7.29,112.8",
    "https://www.google.com.example.org/maps?q=-7.29,112.8",
    "https://www.google.com/search?q=New+Lab",
    "https://www.google.com/maps/@-7.1,112.1,19z",
    "https://www.google.com/maps/place/%ZZ",
  ])("falls back coherently when the CMS map has no usable safe target: %s", (mapsUrl) => {
    const links = getContactMapLinks(mapsUrl);
    expect(links.openUrl).toBe(B301_MAP_URL);
    expect(new URL(links.embedUrl).searchParams.get("q")).toBe("-7.2849799,112.7958691");
    expect(new URL(links.directionsUrl).searchParams.get("destination")).toBe("-7.2849799,112.7958691");
    expect(links.coordinatesLabel).toBe("-7.2849799, 112.7958691");
  });

  it.each([
    ["https://www.google.com/maps/search/?api=1&query=-7.29%2C112.8", "-7.29,112.8"],
    ["https://maps.google.com/maps?q=-7.29,112.8", "-7.29,112.8"],
    ["https://www.google.com/maps/dir/?api=1&destination=-7.29,112.8", "-7.29,112.8"],
    ["https://www.google.com/maps/search/?api=1&query=New+Telecom+Lab", "New Telecom Lab"],
    ["https://www.google.com/maps/place/New+Telecom+Lab/@-7.1,112.1,19z", "New Telecom Lab"],
  ])("keeps every action on the CMS target for %s", (mapsUrl, target) => {
    const links = getContactMapLinks(mapsUrl);
    expect(links.openUrl).toBe(mapsUrl);
    expect(new URL(links.embedUrl).searchParams.get("q")).toBe(target);
    expect(new URL(links.directionsUrl).searchParams.get("destination")).toBe(target);
  });

  it("uses place data ahead of both the query and camera coordinates", () => {
    const mapsUrl = `${B301_MAP_URL}&q=-7.1,112.1`;
    const links = getContactMapLinks(mapsUrl);
    expect(links.openUrl).toBe(mapsUrl);
    expect(new URL(links.embedUrl).searchParams.get("q")).toBe("-7.2849799,112.7958691");
    expect(new URL(links.directionsUrl).searchParams.get("destination")).toBe("-7.2849799,112.7958691");
  });
});
