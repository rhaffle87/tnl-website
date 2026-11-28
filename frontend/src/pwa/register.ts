// No forced activation or reload: a new worker waits until old tabs close.
if (import.meta.env.PROD && window.isSecureContext && "serviceWorker" in navigator) {
    const base = import.meta.env.BASE_URL;
    const relativePath = window.location.pathname.slice(base.length);
    if (window.location.pathname.startsWith(base) &&
        /^(?:|member\/?|activity\/?|news\/?|publications\/?|contact\/?|terms\/?|privacy\/?)$/.test(relativePath) &&
        !window.location.search && !window.location.hash) {
        const register = () => {
            void navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: "none" })
                .catch((error: unknown) => console.warn("Offline support unavailable", error));
        };
        if (document.readyState === "complete") register();
        else window.addEventListener("load", register, { once: true });
    }
}
