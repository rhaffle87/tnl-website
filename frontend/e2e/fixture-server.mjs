import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = resolve("dist");
const port = Number(process.env.TNL_E2E_PORT || 5200);
const base = process.env.TNL_E2E_BASE || "/";
const stamp = "2026-01-01T00:00:00Z";
let mutations = 0;

const settings = {
    site_title: "Telecommunication Network Laboratory",
    site_title_id: "Laboratorium Jaringan Telekomunikasi",
    short_name: "TNL ITS", language_default: "en", maintenance_mode: false,
    theme: {}, seo: {}, announcement: { enabled: false },
    contact: { email: "fixture@example.test", address: "Fixture laboratory, B-301", maps_url: "" },
    social: { instagram: "tnlab_its" },
};
const member = {
    id: "fixture-member", name: "Accessibility Test Member", role: "lecturer",
    position: "head", position_label: "Head of Laboratory", is_head: true,
    bio: "Deterministic laboratory profile for browser checks.",
    bio_id: "Profil laboratorium untuk pengujian browser.",
    photo_url: "", photo_alt: "", expertise: ["Computer Networks"],
    social: {}, projects: [], status: "active", published: true, order: 1,
    show_nim: false, show_personal_email: false, email_public: "fixture@example.test",
    created_at: stamp, updated_at: stamp,
};
const post = {
    id: "fixture-post", slug: "fixture-news", title: "Laboratory browser fixture",
    title_id: "Berita pengujian laboratorium", excerpt: "Deterministic news for accessibility checks.",
    body: "<p>This article exists only in the local browser fixture.</p>", body_id: "<p>Berita pengujian.</p>",
    category: "research", tags: [], cover_url: "", author: "Test fixture", status: "published",
    published_at: stamp, created_at: stamp, updated_at: stamp, seo: {}, related: [],
};
const block = (type, props) => ({ id: type, type, props, enabled: true });
const pageBlocks = {
    home: [block("hero", { title: "Telecommunication Network Laboratory", intro: "A local fixture for teaching and research.", primary_label: "View activities", secondary_label: "Contact the lab" }), block("news_feed", { heading: "Laboratory news" })],
    member: [block("inner_hero", { title: "People & Researchers", description: "Laboratory profiles" }), block("member_sections", {})],
    news: [block("inner_hero", { title: "News & Announcements", description: "Laboratory updates" }), block("news_feed", { heading: "Latest news", show_filters: true })],
};
const json = (response, value, status = 200) => {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(value));
};
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };

createServer(async (request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (!url.pathname.startsWith(base)) { response.writeHead(404).end(); return; }
    const route = url.pathname.slice(base.length);
    if (route === "__fixtures/mutations") { json(response, { mutations }); return; }
    if (route.startsWith("api/")) {
        if (request.method !== "GET") {
            mutations += 1;
            json(response, { detail: "Fixture sign-in rejected" }, route === "api/auth/login" ? 401 : 200);
        } else if (route === "api/public/settings") json(response, settings);
        else if (route.startsWith("api/public/pages/") && pageBlocks[route.split("/").at(-1)]) {
            const slug = route.split("/").at(-1);
            json(response, { id: slug, slug, title: slug, status: "published", blocks: pageBlocks[slug] });
        } else if (route === "api/public/members") json(response, [member]);
        else if (route === "api/public/posts") json(response, { items: [post], total: 1, categories: ["research"] });
        else if (route === "api/public/posts/fixture-news") json(response, post);
        else if (["api/public/events", "api/public/partners", "api/public/publications"].includes(route)) json(response, []);
        else if (route === "api/auth/google/config") json(response, { enabled: false, auth_base: null });
        else if (route === "api/auth/me" || route.startsWith("api/admin/")) json(response, { fixture: "PRIVATE_API_SENTINEL" });
        else json(response, { detail: `Missing fixture: ${route}` }, 501);
        return;
    }
    if (/^(uploads|media|private-media)\//.test(route)) {
        response.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
        response.end("PRIVATE_MEDIA_SENTINEL");
        return;
    }
    try {
        const name = route && extname(route) ? decodeURIComponent(route) : "index.html";
        const file = resolve(root, name);
        if (!file.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return; }
        let content = await readFile(file);
        if (name === "sw.js" && url.searchParams.has("fixture-version")) {
            content = Buffer.concat([content, Buffer.from(`\n// Fixture version ${url.searchParams.get("fixture-version")}\n`)]);
        }
        response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
        response.end(content);
    } catch { response.writeHead(404).end(); }
}).listen(port, "127.0.0.1", () => console.log(`Browser fixtures: http://127.0.0.1:${port}${base}`));
