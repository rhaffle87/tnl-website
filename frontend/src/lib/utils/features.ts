/**
 * Temporary kill switches for desks that are offline while the CMS is being tidied.
 *
 * Both flags default to OFF. Set VITE_FEATURE_DOOR_CHECKIN=true and/or
 * VITE_FEATURE_CERTIFICATES=true at build time to bring a desk back. VITE_* values
 * are build-time only and are baked into the bundle; getFeatureFlags() re-reads the
 * env on each call so tests can stub it and import this module fresh. Backend routes
 * stay live and covered by tests, so hiding a desk never loses registration or
 * certificate data — it only removes the UI entry point.
 */
export interface FeatureFlags {
    doorCheckIn: boolean;
    certificates: boolean;
}

export function getFeatureFlags(): FeatureFlags {
    return {
        doorCheckIn: import.meta.env.VITE_FEATURE_DOOR_CHECKIN === "true",
        certificates: import.meta.env.VITE_FEATURE_CERTIFICATES === "true",
    };
}

export const FEATURES: FeatureFlags = getFeatureFlags();
