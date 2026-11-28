/// <reference lib="webworker" />
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & {
    __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Only the self-contained offline document is precached. Never runtime-cache
// pages, API/auth/admin responses, uploads, media, or a mutation/replay queue.
precacheAndRoute(self.__WB_MANIFEST, { ignoreURLParametersMatching: [] });
cleanupOutdatedCaches();

const base = new URL(".", self.location.href);
self.addEventListener("fetch", (event: FetchEvent) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== "GET" || request.mode !== "navigate" ||
        url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.search) return;

    const route = url.pathname.slice(base.pathname.length);
    // Positive allowlist: new routes stay network-only until reviewed.
    if (!/^(?:|member\/?|activity\/?|news\/?|publications\/?|contact\/?|terms\/?|privacy\/?)$/.test(route)) return;

    event.respondWith(
        fetch(new Request(request, { cache: "no-store" })).catch(async () =>
            await matchPrecache(new URL("offline.html", base).href) ?? Response.error(),
        ),
    );
});
