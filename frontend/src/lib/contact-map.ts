// Keep the supplied place URL verbatim. Its @ coordinates are the camera,
// while !3d / !4d identify the actual B301 laboratory pin.
export const B301_MAP_URL = "https://www.google.com/maps/place/B301+Laboratorium+Jaringan+Telekomunikasi/@-7.284889,112.7957677,20.25z/data=!4m6!3m5!1s0x2dd7fa6d2673efe5:0xc868a50c14fc032a!8m2!3d-7.2849799!4d112.7958691!16s%2Fg%2F11fyzdl2s7?entry=ttu&g_ep=EgoyMDI2MTExOC4xIKXMDSoASAFQAw%3D%3D";

// This exact value is the old seed (also present in the published settings).
// Treat only that legacy default as unset; future admin map URLs still win.
const LEGACY_CAMPUS_MAP_URL = "https://www.google.com/maps/search/?api=1&query=Gedung+B+Teknik+Elektro+ITS+Surabaya";

export function getContactMapLinks(mapsUrl?: string | null) {
  let openUrl = B301_MAP_URL;
  let target = "-7.2849799,112.7958691";

  if (mapsUrl && mapsUrl !== LEGACY_CAMPUS_MAP_URL) {
    try {
      const url = new URL(mapsUrl);
      const isGoogleMap = url.protocol === "https:"
        && ["google.com", "www.google.com", "maps.google.com"].includes(url.hostname)
        && /^\/maps(?:\/|$)/.test(url.pathname);
      if (isGoogleMap) {
        // Place coordinates win over search parameters; never use the @ camera.
        const pin = url.pathname.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
        const place = url.pathname.match(/\/place\/([^/]+)/);
        const configuredTarget = pin
          ? `${pin[1]},${pin[2]}`
          : url.searchParams.get("destination") || url.searchParams.get("query") || url.searchParams.get("q")
            || (place ? decodeURIComponent(place[1].replace(/\+/g, " ")) : null);
        if (configuredTarget?.trim()) {
          openUrl = mapsUrl;
          target = configuredTarget;
        }
      }
    } catch {
      // Malformed CMS URLs must not break Contact or split its three map targets.
    }
  }

  const coordinates = target.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  return {
    coordinatesLabel: coordinates ? `${coordinates[1]}, ${coordinates[2]}` : null,
    openUrl,
    embedUrl: `https://maps.google.com/maps?q=${encodeURIComponent(target)}&z=20&output=embed`,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}`,
  };
}
