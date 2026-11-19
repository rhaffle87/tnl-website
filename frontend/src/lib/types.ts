// Hand-written mirrors of the backend Pydantic models (backend/models/*.py).
// Nothing infers across the Python boundary — when a model changes, change its
// interface here in the same edit.

export interface MemberSocial {
  scholar?: string | null;
  sinta?: string | null;
  scopus?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
  github?: string | null;
  cv_url?: string | null;
}

export interface Member {
  id: string;
  name: string;
  title_prefix?: string | null;
  role: string;
  position?: string | null;
  position_label?: string | null;
  division?: string | null;
  batch?: string | null;
  bio?: string | null;
  bio_id?: string | null;
  email_public?: string | null;
  email_personal?: string | null;
  phone?: string | null;
  nim?: string | null;
  show_nim: boolean;
  show_personal_email: boolean;
  photo_url?: string | null;
  photo_alt?: string | null;
  expertise: string[];
  social: MemberSocial;
  is_head: boolean;
  quote?: string | null;
  quote_id?: string | null;
  status: string;
  order: number;
  published: boolean;
  needs_review: boolean;
  issues: QualityIssue[];
  created_at: string;
  updated_at: string;
}

export interface QualityIssue {
  field: string;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  hint?: string;
}

export interface PostSEO {
  title?: string | null;
  description?: string | null;
  og_image_url?: string | null;
}

export interface Post {
  id: string;
  title: string;
  title_id?: string | null;
  slug?: string | null;
  excerpt?: string | null;
  excerpt_id?: string | null;
  body: string;
  body_id: string;
  category: string;
  tags: string[];
  cover_url?: string | null;
  cover_alt?: string | null;
  author?: string | null;
  status: string;
  published_at?: string | null;
  seo: PostSEO;
  needs_review: boolean;
  issues: QualityIssue[];
  created_at: string;
  updated_at: string;
  related?: Post[];
}

export interface EventModule {
  title: string;
  title_id?: string | null;
  detail?: string | null;
  detail_id?: string | null;
  date?: string | null;
}

export interface EventContact {
  name: string;
  phone?: string | null;
  email?: string | null;
}

export interface FormField {
  type: string;
  label: string;
  required: boolean;
  options: string[];
  show_if_field?: string | null;
  show_if_value?: string | null;
}

export interface MediaItemRef {
  url: string;
  alt: string;
}

export interface LabEvent {
  id: string;
  title: string;
  title_id?: string | null;
  slug?: string | null;
  type: string;
  description: string;
  description_id: string;
  cover_image?: string | null;
  poster_urls: string[];
  gallery_images?: string[];
  spreadsheet_webhook_url?: string | null;
  documentation: MediaItemRef[];
  start_date?: string | null;
  end_date?: string | null;
  reg_open_date?: string | null;
  reg_close_date?: string | null;
  capacity: number;
  price: number;
  location?: string | null;
  location_id?: string | null;
  modules: EventModule[];
  contacts: EventContact[];
  form_fields: FormField[];
  status: string;
  needs_review: boolean;
  issues: QualityIssue[];
  created_at: string;
  updated_at: string;
  // Computed server-side:
  reg_status?: "open" | "upcoming" | "closed" | "past" | "full";
  seats_left?: number | null;
}

export interface Activity {
  id: string;
  title: string;
  title_id?: string | null;
  category: string;
  description: string;
  description_id: string;
  cover_image?: string | null;
  gallery_images?: string[];
  date?: string | null;
  images: MediaItemRef[];
  order: number;
  published: boolean;
  needs_review: boolean;
  issues: QualityIssue[];
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  kind: string;
  title: string;
  title_id?: string | null;
  year?: string | null;
  location?: string | null;
  participants?: string | null;
  focus?: string | null;
  description: string;
  description_id: string;
  background: string;
  modules: EventModule[];
  impact: EventModule[];
  images: MediaItemRef[];
  cluster?: string | null;
  tags: string[];
  is_testbed: boolean;
  status: string;
  verified: boolean;
  verified_by?: string | null;
  verified_date?: string | null;
  needs_review: boolean;
  issues: QualityIssue[];
  created_at: string;
  updated_at: string;
}

export interface Publication {
  id: string;
  title: string;
  authors?: string | null;
  venue?: string | null;
  year?: number | null;
  ptype: string;
  url?: string | null;
  doi?: string | null;
  abstract: string;
  tags: string[];
  linked_member_ids?: string[];
  linked_members?: { id: string; name: string; role: string; division?: string | null }[];
  status: string;
  needs_review: boolean;
  issues: QualityIssue[];
  created_at: string;
  updated_at: string;
}

export interface Partner {
  id: string;
  name: string;
  url?: string | null;
  logo_url?: string | null;
  order: number;
  published: boolean;
  needs_review: boolean;
  issues: QualityIssue[];
  created_at: string;
  updated_at: string;
}

export interface PracticumResource {
  id?: string;
  title: string;
  file_url: string;
  file_type?: string;
  size_bytes?: number | null;
  updated_at?: string;
}

export interface PracticumShift {
  id?: string;
  day: string;
  time_slot: string;
  coordinator_name: string;
  quota?: number;
  room?: string;
  notes?: string | null;
}

export interface PracticumModule {
  id: string;
  code?: string | null;
  name: string;
  name_id?: string | null;
  description: string;
  description_id: string;
  cover_image?: string | null;
  gallery_images?: string[];
  semester?: string | null;
  resources?: PracticumResource[];
  shifts?: PracticumShift[];
  order: number;
  published: boolean;
  needs_review: boolean;
  issues: QualityIssue[];
  created_at: string;
  updated_at: string;
}

export interface Equipment {
  id: string;
  name: string;
  name_id?: string | null;
  category: "server" | "sdr" | "networking" | "optical" | "test_tool" | "other" | string;
  specs: string;
  specs_id?: string | null;
  photo_url?: string | null;
  photo_alt?: string | null;
  gallery_images?: string[];
  quantity: number;
  location: string;
  status: "available" | "in_use" | "maintenance" | string;
  serial_number?: string | null;
  asset_code?: string | null;
  internal_notes?: string | null;
  order: number;
  published: boolean;
  needs_review?: boolean;
  issues?: QualityIssue[];
  created_at: string;
  updated_at: string;
}

export interface Block {
  id: string;
  type: string;
  props: Record<string, unknown>;
  hidden: boolean;
}

export interface PageRevisionBrief {
  id: string;
  saved_at: string;
  saved_by: string;
  title: string;
  block_count: number;
}

export interface PageDoc {
  id: string;
  slug: string;
  title: string;
  title_id?: string | null;
  blocks: Block[];
  status: string;
  is_system: boolean;
  needs_review: boolean;
  issues: QualityIssue[];
  created_at: string;
  updated_at: string;
}

export interface ContactInfo {
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  address_id?: string | null;
  room: string;
  maps_url?: string | null;
}

export interface SocialLinks {
  instagram?: string | null;
  youtube?: string | null;
  linkedin?: string | null;
  github?: string | null;
}

export interface SeoDefaults {
  title_template: string;
  default_description?: string | null;
  og_image_url?: string | null;
}

export interface FocusArea {
  name: string;
  name_id?: string | null;
}

export interface AnnouncementSettings {
  enabled: boolean;
  title?: string | null;
  title_id?: string | null;
  body?: string | null;
  body_id?: string | null;
  version: number;
}

export interface ThemeTokens {
  color_black: string;
  color_tan: string;
  color_tan_text: string;
  color_green: string;
  color_green_hover: string;
  color_surface: string;
  color_border: string;
  color_body: string;
  font_heading: string;
  font_body: string;
  radius_card: number;
  radius_button: number;
  section_spacing: number;
  // Semantic GSM tokens for cross-period sustainability
  primary_color?: string;
  emerald_color?: string;
  obsidian_color?: string;
  accent_color?: string;
  accent_hover_color?: string;
  gsm_edition_label?: string;
}

export interface SiteSettings {
  id: string;
  site_title: string;
  site_title_id: string;
  short_name: string;
  logo_url?: string | null;
  logo_url_dark?: string | null;
  its_logo_url?: string | null;
  contact: ContactInfo;
  social: SocialLinks;
  seo: SeoDefaults;
  focus_areas: FocusArea[];
  language_default: string;
  analytics_snippet: string;
  maintenance_mode: boolean;
  announcement: AnnouncementSettings;
  theme_tokens?: ThemeTokens;
  retention_days: number;
  updated_at: string;
  server_today?: string;
}

export interface PublicStats {
  lecturers: number;
  assistants: number;
  research_tracks: number;
  room: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "editor" | "contributor" | "registrar" | "viewer";
  divisions: string[];
  active: boolean;
  totp_enabled: boolean;
  created_at?: string | null;
  last_login_at?: string | null;
}

export interface GoogleAuthConfig {
  enabled: boolean;
  allowed_domains: string[];
  allowed_emails: string[];
  auth_base: string;
}

export interface AiTriage {
  ai_ok: boolean;
  category?: string;
  category_confidence?: number;
  urgency_level?: number;
  urgency_label?: string;
  spam_probability?: number;
}

export interface AiScore {
  ai_ok: boolean;
  fit_level?: number;
  fit_label?: string;
  fit_score?: number;
  junk_probability?: number;
}

export interface AiReview {
  ai_ok: boolean;
  substance_level?: number;
  substance_label?: string;
  placeholder_probability?: number;
  claim_probability?: number;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  body: string;
  status: "new" | "replied" | "archived";
  created_at: string;
  replied_at?: string | null;
  triage?: AiTriage;
}

export interface Registration {
  id: string;
  event_id: string;
  event_title: string;
  data: Record<string, string | { url: string; name: string }>;
  email: string;
  nim: string;
  status: "pending" | "accepted" | "rejected" | "attended" | "waitlisted";
  consent: boolean;
  certificate_code?: string | null;
  notes: string;
  created_at: string;
  display_name?: string;
  ai_score?: AiScore;
  anonymized?: boolean;
}

export interface MediaAsset {
  id: string;
  filename: string;
  url: string;
  key: string;
  alt: string;
  folder: string;
  kind: "image" | "video" | "document";
  content_type: string;
  bytes: number;
  created_at: string;
  width?: number;
  height?: number;
  webp_url?: string;
  sizes?: Record<string, string>;
  youtube_id?: string;
  thumbnail?: string;
  used_in?: number;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  scopes: string[];
  prefix: string;
  active: boolean;
  calls: number;
  created_at: string;
  last_used_at?: string | null;
  key?: string;
}

export interface AuditEntry {
  id: string;
  actor_id: string;
  actor_email: string;
  action: string;
  resource: string;
  target_id?: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface DashboardStats {
  posts: number;
  published_posts: number;
  members: number;
  events: number;
  open_events: number;
  registrations: number;
  pending_registrations: number;
  new_messages: number;
  media: number;
  needs_review: number;
}

export interface ContrastCheck {
  label: string;
  foreground: string;
  background: string;
  ratio: number;
  required: number;
  passes: boolean;
}

export interface ThemeResponse {
  draft: ThemeTokens;
  published: ThemeTokens;
  contrast: ContrastCheck[];
  default: ThemeTokens;
}

export interface ListResponse<T> {
  items: T[];
  total?: number;
}

export interface ReviewQueueItem {
  resource: string;
  id: string;
  title: string;
  issues: QualityIssue[];
}

export interface CollectionDef {
  id: string;
  key: string;
  name: string;
  fields: { key: string; label: string; type: string; required?: boolean }[];
  template: string;
  created_at: string;
}

export interface SavedBlock {
  id: string;
  name: string;
  block: Block;
  created_at: string;
}

export interface LabPhotoSlot {
  id: string;
  label: string;
  hint: string;
  url?: string | null;
  alt?: string | null;
  is_illustrative: boolean;
  has_photo: boolean;
}

export interface LabPhotoSlots {
  slots: LabPhotoSlot[];
  illustrative_count: number;
}

export interface CrossrefHit {
  doi: string;
  title: string;
  authors: string;
  venue: string;
  year?: number | null;
  ptype: string;
  abstract: string;
  citations: number;
  already_imported?: boolean;
}

export interface CrossrefSearch {
  items: CrossrefHit[];
  total: number;
}

export interface ImportResult {
  imported: { id: string; title: string; year: number; doi: string; blocking_issues: number }[];
  duplicates: string[];
  failed: string[];
  message: string;
}

