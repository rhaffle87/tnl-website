// Shared data hooks over the typed fetch layer. Every public page reads through
// these, so a failed fetch degrades to an empty region rather than a blank page.

import { useMutation, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiGet, apiUrl, ApiError } from "@/lib/api/api";
import type {
  Activity,
  AuthUser,
  PublicCollectionResponse,
  Equipment,
  LabEvent,
  ListResponse,
  Member,
  PageDoc,
  Partner,
  Post,
  PracticumModule,
  PracticumModule as Practicum,
  Project,
  PublicStats,
  Publication,
  SiteSettings,
} from "@/lib/types/types";

const STALE = 60_000;

export function useSettings(): UseQueryResult<SiteSettings> {
  return useQuery({
    queryKey: ["public", "settings"],
    queryFn: () => apiGet<SiteSettings>("/public/settings"),
    retry: false,
    staleTime: STALE,
  });
}

export function useStats(): UseQueryResult<PublicStats> {
  return useQuery({
    queryKey: ["public", "stats"],
    queryFn: () => apiGet<PublicStats>("/public/stats"),
    retry: false,
    staleTime: STALE,
  });
}

export function usePage(slug: string | undefined, options: { enabled?: boolean } = {}): UseQueryResult<PageDoc> {
  return useQuery({
    queryKey: ["public", "page", slug],
    queryFn: () => apiGet<PageDoc>(`/public/pages/${encodeURIComponent(slug!)}`),
    enabled: Boolean(slug) && (options.enabled ?? true),
    retry: false,
    staleTime: STALE,
  });
}

export function usePagePreview(slug: string | undefined, pageId: string | undefined): UseQueryResult<PageDoc> {
  return useQuery({
    queryKey: ["auth", "page-preview", slug, pageId],
    queryFn: async () => {
      if (!pageId) throw new ApiError(404, { detail: "Page preview not found." });
      const page = await apiGet<PageDoc>(`/admin/pages/${encodeURIComponent(pageId)}/preview`);
      if (page.slug !== slug) throw new ApiError(404, { detail: "Page preview not found." });
      return page;
    },
    enabled: Boolean(slug && pageId),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useMembers(params?: { status?: string; batch?: string }): UseQueryResult<Member[]> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.batch) search.set("batch", params.batch);
  const qs = search.toString();
  return useQuery({
    queryKey: ["public", "members", qs],
    queryFn: () => apiGet<Member[]>(`/public/members${qs ? `?${qs}` : ""}`),
    retry: false,
    staleTime: STALE,
  });
}

export function usePosts(params?: {
  category?: string;
  q?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}): UseQueryResult<ListResponse<Post>> {
  const search = new URLSearchParams();
  if (params?.category) search.set("category", params.category);
  if (params?.q) search.set("q", params.q);
  if (params?.tag) search.set("tag", params.tag);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.offset) search.set("offset", String(Math.max(0, Math.trunc(params.offset))));
  const qs = search.toString();
  return useQuery({
    queryKey: ["public", "posts", qs],
    queryFn: () => apiGet<ListResponse<Post>>(`/public/posts${qs ? `?${qs}` : ""}`),
    retry: false,
    staleTime: STALE,
    placeholderData: (previousData) => previousData,
  });
}

export function usePost(slug: string | undefined): UseQueryResult<Post> {
  return useQuery({
    queryKey: ["public", "post", slug],
    queryFn: () => apiGet<Post>(`/public/posts/${slug}`),
    enabled: Boolean(slug),
    retry: false,
  });
}

export function useEvents(type?: string): UseQueryResult<LabEvent[]> {
  return useQuery({
    queryKey: ["public", "events", type ?? "all"],
    queryFn: () => apiGet<LabEvent[]>(`/public/events${type ? `?type=${type}` : ""}`),
    retry: false,
    staleTime: STALE,
  });
}

export function useEvent(slug: string | undefined): UseQueryResult<LabEvent> {
  return useQuery({
    queryKey: ["public", "event", slug],
    queryFn: () => apiGet<LabEvent>(`/public/events/${slug}`),
    enabled: Boolean(slug),
    retry: false,
  });
}

export function useActivities(category?: string): UseQueryResult<Activity[]> {
  return useQuery({
    queryKey: ["public", "activities", category ?? "all"],
    queryFn: () => apiGet<Activity[]>(`/public/activities${category ? `?category=${category}` : ""}`),
    retry: false,
    staleTime: STALE,
  });
}

export function useProjects(kind?: string): UseQueryResult<Project[]> {
  return useQuery({
    queryKey: ["public", "projects", kind ?? "all"],
    queryFn: () => apiGet<Project[]>(`/public/projects${kind ? `?kind=${kind}` : ""}`),
    retry: false,
    staleTime: STALE,
  });
}

export function usePublications(params?: { year?: number; ptype?: string; member_id?: string }): UseQueryResult<Publication[]> {
  const search = new URLSearchParams();
  if (params?.year) search.set("year", String(params.year));
  if (params?.ptype) search.set("ptype", params.ptype);
  if (params?.member_id) search.set("member_id", params.member_id);
  const qs = search.toString();
  return useQuery({
    queryKey: ["public", "publications", qs],
    queryFn: () => apiGet<Publication[]>(`/public/publications${qs ? `?${qs}` : ""}`),
    retry: false,
    staleTime: STALE,
  });
}

export function usePublicCollection(key: string | undefined, params?: { limit?: number; offset?: number }): UseQueryResult<PublicCollectionResponse> {
  const search = new URLSearchParams();
  if (params?.limit) search.set("limit", String(Math.min(100, Math.max(1, Math.trunc(params.limit)))));
  if (params?.offset) search.set("offset", String(Math.max(0, Math.trunc(params.offset))));
  const query = search.toString();
  return useQuery({
    queryKey: ["public", "collection", key, query],
    queryFn: () => apiGet<PublicCollectionResponse>(`/public/collections/${encodeURIComponent(key!)}${query ? `?${query}` : ""}`),
    enabled: Boolean(key),
    retry: false,
    staleTime: STALE,
  });
}

export function usePartners(): UseQueryResult<Partner[]> {
  return useQuery({
    queryKey: ["public", "partners"],
    queryFn: () => apiGet<Partner[]>("/public/partners"),
    retry: false,
    staleTime: STALE,
  });
}

export function usePracticum(): UseQueryResult<PracticumModule[]> {
  return useQuery({
    queryKey: ["public", "practicum"],
    queryFn: () => apiGet<Practicum[]>("/public/practicum"),
    retry: false,
    staleTime: STALE,
  });
}

export function useEquipment(params?: { category?: string; status?: string }): UseQueryResult<Equipment[]> {
  const query = new URLSearchParams();
  if (params?.category) query.set("category", params.category);
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  return useQuery({
    queryKey: ["public", "equipment", params?.category ?? "", params?.status ?? ""],
    queryFn: () => apiGet<Equipment[]>(`/public/equipment${qs ? `?${qs}` : ""}`),
    retry: false,
    staleTime: STALE,
  });
}

export function useMe(): UseQueryResult<AuthUser> {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiGet<AuthUser>("/auth/me"),
    retry: false,
    staleTime: 30_000,
  });
}

export function useSubmitRegistration(eventIdOrSlug: string) {
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch(apiUrl(`/registrations/${encodeURIComponent(eventIdOrSlug)}`), {
        method: "POST",
        body: formData,
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = (data as { detail?: unknown })?.detail;
        if (typeof detail === "string") throw new Error(detail);
        if (detail && typeof detail === "object") {
          const d = detail as { message?: string; missing?: string[]; errors?: string[] };
          const list = [...(d.missing ?? []).map((m) => `${m}: field wajib`), ...(d.errors ?? [])];
          throw new Error(list.join(". ") || d.message || "Pendaftaran gagal.");
        }
        throw new Error("Pendaftaran gagal.");
      }
      return data;
    },
  });
}
