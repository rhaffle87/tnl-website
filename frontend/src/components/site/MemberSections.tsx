import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Mail,
  Linkedin,
  GraduationCap,
  Sparkles,
  ChevronRight,
  ExternalLink,
  BookOpen,
  Filter,
  Users,
  Instagram,
  UserCheck,
  Clock,
  X,
} from "lucide-react";
import { useMembers, usePublications } from "@/lib/hooks";
import type { Member } from "@/lib/types";

interface MemberSectionsProps {
  onSelectMember?: (member: Member) => void;
}

const DIVISION_LABELS: Record<string, { label: string; desc: string }> = {
  BPH: { label: "BPH", desc: "Badan Pengurus Harian — Lab Direction & Coordination" },
  Academic: { label: "Academic", desc: "Practicum Modules, Grading & Academic Support" },
  Research: { label: "Research", desc: "Scientific Inquiries, Papers & Testbed Development" },
  Social: { label: "Social", desc: "Community Outreach, Social Media & Public Relations" },
  Internal: { label: "Internal", desc: "Inventory, Server Maintenance & Room Operations" },
  External: { label: "External", desc: "Industrial Ties, Alumni Network & External Relations" },
};

function formatInstagramHandle(raw?: string | null): { handle: string; url: string } | null {
  if (!raw) return null;
  const clean = raw.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "");
  if (!clean) return null;
  return {
    handle: `@${clean}`,
    url: `https://instagram.com/${clean}`,
  };
}

function getInitials(name: string): string {
  if (!name) return "TNL";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const MonogramPlaceholder: React.FC<{ name: string; batch?: string; size?: "sm" | "md" | "lg" }> = ({
  name,
  batch = "2024",
}) => {
  const initials = getInitials(name);
  return (
    <div
      className="w-full h-full aspect-[3/4] rounded-t-xl bg-gradient-to-b from-[#2C3E35] via-[#202C26] to-[#17221C] flex flex-col items-center justify-between p-6 relative overflow-hidden select-none border-b border-[#2C3E35]/40"
      aria-label={`Avatar placeholder for ${name}`}
    >
      {/* Decorative Rings & Subtle Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#A8977B_1px,transparent_1px)] [background-size:16px_16px] opacity-10 pointer-events-none" />
      <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-[#A8977B]/10 blur-2xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-[#2C3E35] blur-xl pointer-events-none" />

      {/* Top Laboratory Tag */}
      <div className="w-full flex items-center justify-between text-[10px] font-mono tracking-wider text-[#A8977B]/80 z-10 uppercase">
        <span className="font-semibold">TNL · B-301</span>
        <span>{batch}</span>
      </div>

      {/* Monogram Seal */}
      <div className="flex flex-col items-center justify-center my-auto z-10">
        <div className="w-20 h-20 rounded-full bg-[#1F2B25] border-2 border-[#A8977B]/50 flex items-center justify-center shadow-lg relative group-hover:border-[#A8977B] transition-colors">
          <div className="absolute inset-1 rounded-full border border-dashed border-[#A8977B]/30" />
          <span className="text-2xl font-serif font-bold text-[#F5F2EB] tracking-wider">
            {initials}
          </span>
        </div>
      </div>

      {/* Bottom Status Pill */}
      <div className="w-full z-10 flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#16201B]/90 border border-[#A8977B]/30 text-[10px] font-medium text-[#C2B59B]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A8977B] animate-pulse" />
          Batch {batch} · Photo Pending
        </span>
      </div>
    </div>
  );
};

export const MemberSections: React.FC<MemberSectionsProps> = ({ onSelectMember }) => {
  // Always query without filtering status from the server so Lecturers/Head NEVER disappear when switching to Alumni
  const { data: members } = useMembers();

  const [assistantStatus, setAssistantStatus] = useState<"active" | "alumni">("active");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");

  // Auto-highlight member from query parameter if provided
  useEffect(() => {
    if (highlightId && members && members.length > 0) {
      const found = members.find((m) => m.id === highlightId);
      if (found) setSelectedMember(found);
    }
  }, [highlightId, members]);

  // 1. Head of Lab is strictly active lecturer/head
  const headOfLab = useMemo(() => {
    if (!members) return null;
    return (
      members.find(
        (m) =>
          (m.is_head || m.role === "head" || (m.position || "").toLowerCase().includes("head of lab")) &&
          m.status === "active"
      ) || null
    );
  }, [members]);

  // 2. Lecturers & Researchers (always active, excluded head)
  const lecturers = useMemo(() => {
    if (!members) return [];
    return members
      .filter(
        (m) =>
          (m.role === "lecturer" || m.role === "researcher") &&
          !m.is_head &&
          m.id !== headOfLab?.id &&
          m.status === "active"
      )
      .sort((a, b) => a.order - b.order);
  }, [members, headOfLab]);

  // 3. Assistants pool (active or alumni)
  const allAssistants = useMemo(() => {
    if (!members) return [];
    return members.filter((m) => m.role === "assistant" || m.role === "alumni");
  }, [members]);

  const activeAssistants = useMemo(() => {
    return allAssistants.filter((m) => m.status === "active");
  }, [allAssistants]);

  const alumniAssistants = useMemo(() => {
    return allAssistants.filter((m) => m.status === "alumni");
  }, [allAssistants]);

  // Filtered assistants based on current tabs, division, and search
  const displayedAssistants = useMemo(() => {
    let list = assistantStatus === "active" ? activeAssistants : alumniAssistants;

    if (divisionFilter !== "all") {
      list = list.filter((m) => (m.division || "").toLowerCase() === divisionFilter.toLowerCase());
    }

    if (assistantStatus === "active" && batchFilter !== "all") {
      list = list.filter((m) => (m.batch || "") === batchFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.division && m.division.toLowerCase().includes(q)) ||
          (m.position && m.position.toLowerCase().includes(q)) ||
          (m.nim && m.nim.includes(q)) ||
          (m.expertise && m.expertise.some((e) => e.toLowerCase().includes(q)))
      );
    }

    return list.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      if (a.batch !== b.batch) return (b.batch || "").localeCompare(a.batch || "");
      return a.name.localeCompare(b.name);
    });
  }, [assistantStatus, activeAssistants, alumniAssistants, divisionFilter, batchFilter, searchQuery]);

  const openModal = (m: Member) => {
    setSelectedMember(m);
    if (onSelectMember) onSelectMember(m);
  };

  const closeModal = () => setSelectedMember(null);

  // Selected member publications
  const { data: memberPubs } = usePublications(
    selectedMember ? { member_id: selectedMember.id } : undefined
  );

  return (
    <div className="space-y-16">
      {/* ======================================================== */}
      {/* 1. HEAD OF LABORATORY BANNER                            */}
      {/* ======================================================== */}
      {headOfLab && (
        <section
          aria-labelledby="head-of-lab-heading"
          data-testid="head-of-lab-banner"
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1E2B25] via-[#24332C] to-[#1A2420] text-[#F5F2EB] border border-[#2C3E35] p-8 md:p-10 shadow-xl"
        >
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-[#A8977B]/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 -mb-20 w-64 h-64 rounded-full bg-[#2C3E35]/40 blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row items-center gap-8 md:gap-12">
            {/* Portrait */}
            <div className="relative flex-shrink-0 group">
              <div className="w-44 h-56 md:w-52 md:h-64 rounded-xl overflow-hidden border-2 border-[#A8977B] shadow-2xl bg-[#17221C]">
                {headOfLab.photo_url ? (
                  <img
                    src={headOfLab.photo_url}
                    alt={headOfLab.photo_alt || headOfLab.name}
                    className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <MonogramPlaceholder name={headOfLab.name} batch="Head" />
                )}
              </div>
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#A8977B] text-[#1E2B25] text-xs font-bold font-mono tracking-wider px-3 py-1 rounded-full shadow-md uppercase">
                Head of Laboratory
              </div>
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center md:text-left space-y-4">
              <div>
                <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium tracking-widest uppercase text-[#A8977B] bg-[#2C3E35]/60 px-3 py-1 rounded-full mb-3 border border-[#A8977B]/30">
                  <Sparkles className="w-3.5 h-3.5" /> Department of Electrical Engineering · ITS
                </span>
                <h2
                  id="head-of-lab-heading"
                  data-testid="head-of-lab-name"
                  className="text-2xl md:text-3xl lg:text-4xl font-serif font-bold text-[#F5F2EB] tracking-tight leading-tight"
                >
                  {headOfLab.name}
                </h2>
                <p className="text-sm md:text-base font-sans text-[#D1C7B7] mt-1">
                  {headOfLab.position || "Head of Laboratory"}
                </p>
                {headOfLab.show_nim && headOfLab.nim && (
                  <p className="text-xs font-mono text-[#A8977B] mt-0.5">NIP: {headOfLab.nim}</p>
                )}
              </div>

              {headOfLab.bio && (
                <p className="text-sm md:text-base text-[#DCD6CA] leading-relaxed max-w-3xl line-clamp-3 md:line-clamp-4">
                  {headOfLab.bio}
                </p>
              )}

              {/* Research Expertise Chips */}
              {headOfLab.expertise && headOfLab.expertise.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center md:justify-start pt-1">
                  {headOfLab.expertise.map((exp, idx) => (
                    <span
                      key={idx}
                      className="text-xs font-medium px-2.5 py-1 rounded-md bg-[#2C3E35]/70 text-[#F5F2EB] border border-[#A8977B]/40"
                    >
                      {exp}
                    </span>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-3">
                {headOfLab.email_public && (
                  <a
                    href={`mailto:${headOfLab.email_public}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2C3E35] hover:bg-[#395045] text-xs font-medium text-[#F5F2EB] transition-colors border border-[#A8977B]/30"
                  >
                    <Mail className="w-3.5 h-3.5 text-[#A8977B]" /> {headOfLab.email_public}
                  </a>
                )}
                {headOfLab.social?.scholar && (
                  <a
                    href={headOfLab.social.scholar}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2C3E35] hover:bg-[#395045] text-xs font-medium text-[#F5F2EB] transition-colors border border-[#A8977B]/30"
                  >
                    <GraduationCap className="w-3.5 h-3.5 text-[#A8977B]" /> Google Scholar
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => openModal(headOfLab)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#A8977B] hover:bg-[#8F8065] text-xs font-semibold text-[#1E2B25] transition-colors shadow-sm ml-auto md:ml-0"
                >
                  View Full Profile <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ======================================================== */}
      {/* 2. LECTURERS & RESEARCHERS SECTION                      */}
      {/* ======================================================== */}
      <section aria-labelledby="lecturers-heading" data-testid="lecturers-section">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 pb-4 border-b border-[#2C3E35]/20">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-[#A8977B] mb-1">
              <GraduationCap className="w-4 h-4 text-[#2C3E35]" /> Faculty & Research Staff
            </div>
            <h2 id="lecturers-heading" className="text-2xl md:text-3xl font-serif font-bold text-[#1E2B25]">
              Lecturers & Researchers
            </h2>
            <p className="text-sm text-neutral-600 mt-1 max-w-2xl">
              Academic advisors, telecommunication network specialists, and lead investigators driving research at Room B-301.
            </p>
          </div>
          <div className="mt-4 md:mt-0 text-xs font-mono text-neutral-500">
            {lecturers.length} Faculty Members
          </div>
        </div>

        {/* 3-Column Balanced Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {lecturers.map((lecturer) => (
            <div
              key={lecturer.id}
              className="group bg-white rounded-xl border border-neutral-200 overflow-hidden hover:shadow-lg hover:border-[#A8977B]/60 transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                {/* Photo Aspect Ratio 3:4 */}
                <div className="relative w-full aspect-[3/4] bg-neutral-100 overflow-hidden">
                  {lecturer.photo_url ? (
                    <img
                      src={lecturer.photo_url}
                      alt={lecturer.photo_alt || lecturer.name}
                      className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <MonogramPlaceholder name={lecturer.name} batch="Staff" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <span className="text-xs text-white font-medium flex items-center gap-1">
                      Click to view publications & bio <ExternalLink className="w-3 h-3" />
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5">
                  <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#A8977B] mb-1">
                    {lecturer.position_label || lecturer.position || "Lecturer"}
                  </div>
                  <h3 className="font-serif font-bold text-lg text-[#1E2B25] group-hover:text-[#2C3E35] transition-colors leading-snug">
                    {lecturer.name}
                  </h3>
                  {lecturer.show_nim && lecturer.nim && (
                    <p className="text-xs font-mono text-neutral-500 mt-0.5">NIP: {lecturer.nim}</p>
                  )}

                  {lecturer.bio && (
                    <p className="text-xs text-neutral-600 mt-2.5 line-clamp-3 leading-relaxed">
                      {lecturer.bio}
                    </p>
                  )}

                  {/* Expertise Chips */}
                  {lecturer.expertise && lecturer.expertise.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3.5">
                      {lecturer.expertise.slice(0, 3).map((exp, idx) => (
                        <span
                          key={idx}
                          className="text-[11px] font-medium px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200"
                        >
                          {exp}
                        </span>
                      ))}
                      {lecturer.expertise.length > 3 && (
                        <span className="text-[11px] font-mono text-neutral-500 self-center">
                          +{lecturer.expertise.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Card Footer */}
              <div className="px-5 py-3.5 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {lecturer.email_public && (
                    <a
                      href={`mailto:${lecturer.email_public}`}
                      title={lecturer.email_public}
                      className="text-neutral-500 hover:text-[#2C3E35] transition-colors p-1"
                    >
                      <Mail className="w-4 h-4" />
                    </a>
                  )}
                  {lecturer.social?.scholar && (
                    <a
                      href={lecturer.social.scholar}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Google Scholar"
                      className="text-neutral-500 hover:text-[#2C3E35] transition-colors p-1"
                    >
                      <GraduationCap className="w-4 h-4" />
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openModal(lecturer)}
                  className="font-medium text-[#2C3E35] hover:text-[#A8977B] transition-colors flex items-center gap-1"
                >
                  Detail <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ======================================================== */}
      {/* 3. LABORATORY ASSISTANTS (ACTIVE & ALUMNI)              */}
      {/* ======================================================== */}
      <section aria-labelledby="assistants-heading" data-testid="assistants-section" className="pt-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 pb-4 border-b border-[#2C3E35]/20 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-[#A8977B] mb-1">
              <Users className="w-4 h-4 text-[#2C3E35]" /> Laboratory Operations & Research Cadre
            </div>
            <h2 id="assistants-heading" className="text-2xl md:text-3xl font-serif font-bold text-[#1E2B25]">
              Laboratory Assistants
            </h2>
            <p className="text-sm text-neutral-600 mt-1 max-w-2xl">
              Undergraduate engineering students responsible for day-to-day practicum supervision, network testbeds, server infrastructure, and academic activities.
            </p>
          </div>

          {/* Active vs Alumni Status Toggle */}
          <div className="flex items-center p-1 bg-neutral-100 rounded-lg border border-neutral-200 self-start md:self-end">
            <button
              type="button"
              data-testid="member-status-active-filter"
              onClick={() => {
                setAssistantStatus("active");
                setDivisionFilter("all");
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-all ${
                assistantStatus === "active"
                  ? "bg-[#2C3E35] text-white shadow-sm font-semibold"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              Active Cadre ({activeAssistants.length})
            </button>
            <button
              type="button"
              data-testid="member-status-alumni-filter"
              onClick={() => {
                setAssistantStatus("alumni");
                setDivisionFilter("all");
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-all ${
                assistantStatus === "alumni"
                  ? "bg-[#2C3E35] text-white shadow-sm font-semibold"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Alumni ({alumniAssistants.length})
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-4 mb-8 space-y-4">
          {/* Active Batch Sub-Filter (Only shown when active is selected) */}
          {assistantStatus === "active" && (
            <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-neutral-200/60">
              <span className="text-xs font-mono font-medium text-neutral-500 mr-2 flex items-center gap-1">
                Generation:
              </span>
              {[
                { key: "all", label: `All Active (${activeAssistants.length})` },
                {
                  key: "2023",
                  label: `Batch 2023 · Heads & BPH (${activeAssistants.filter((a) => a.batch === "2023").length})`,
                },
                {
                  key: "2024",
                  label: `Batch 2024 · Staff (${activeAssistants.filter((a) => a.batch === "2024").length})`,
                },
              ].map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setBatchFilter(b.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    batchFilter === b.key
                      ? "bg-[#A8977B] text-white font-semibold"
                      : "bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          )}

          {/* Division Pills & Search Input */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Division Quick Filters */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDivisionFilter("all")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  divisionFilter === "all"
                    ? "bg-[#2C3E35] text-white"
                    : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-100"
                }`}
              >
                All Divisions
              </button>
              {Object.keys(DIVISION_LABELS).map((div) => {
                const count = (
                  assistantStatus === "active" ? activeAssistants : alumniAssistants
                ).filter((a) => (a.division || "").toLowerCase() === div.toLowerCase()).length;
                if (count === 0 && assistantStatus === "alumni") return null;
                return (
                  <button
                    key={div}
                    type="button"
                    onClick={() => setDivisionFilter(div)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      divisionFilter.toLowerCase() === div.toLowerCase()
                        ? "bg-[#2C3E35] text-white"
                        : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-100"
                    }`}
                  >
                    {div} {count > 0 && `(${count})`}
                  </button>
                );
              })}
            </div>

            {/* Live Search Box */}
            <div className="relative min-w-[220px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search assistant, NRP, skill..."
                className="w-full text-xs px-3 py-1.5 pl-8 rounded-md border border-neutral-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#2C3E35] focus:border-[#2C3E35]"
              />
              <Filter className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-xs"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Assistants Cards Grid */}
        {displayedAssistants.length === 0 ? (
          <div className="bg-neutral-50 rounded-xl border border-dashed border-neutral-300 p-12 text-center">
            <Users className="w-10 h-10 text-neutral-400 mx-auto mb-3" />
            <h3 className="text-base font-medium text-neutral-800">No assistants found</h3>
            <p className="text-xs text-neutral-500 mt-1">
              Try resetting your division, generation filter, or search keywords.
            </p>
            <button
              type="button"
              onClick={() => {
                setDivisionFilter("all");
                setBatchFilter("all");
                setSearchQuery("");
              }}
              className="mt-4 px-4 py-1.5 text-xs font-medium text-[#2C3E35] border border-[#2C3E35] rounded-md hover:bg-[#2C3E35] hover:text-white transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-5">
            {displayedAssistants.map((assistant) => {
              const ig = formatInstagramHandle(assistant.social?.instagram);
              const isBphOrHead =
                assistant.division === "BPH" ||
                (assistant.position || "").toLowerCase().includes("coordinator") ||
                (assistant.position || "").toLowerCase().includes("head") ||
                (assistant.position || "").toLowerCase().includes("lead");

              return (
                <div
                  key={assistant.id}
                  data-testid={`assistant-card-${assistant.id}`}
                  onClick={() => openModal(assistant)}
                  className="group bg-white rounded-xl border border-neutral-200 overflow-hidden hover:shadow-md hover:border-[#A8977B]/70 transition-all duration-300 flex flex-col justify-between cursor-pointer"
                >
                  <div>
                    {/* Portrait container with 3:4 aspect ratio */}
                    <div className="relative w-full aspect-[3/4] bg-neutral-100 overflow-hidden">
                      {assistant.photo_url ? (
                        <img
                          src={assistant.photo_url}
                          alt={assistant.photo_alt || assistant.name}
                          className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <MonogramPlaceholder
                          name={assistant.name}
                          batch={assistant.batch || "2024"}
                        />
                      )}

                      {/* Division Pill overlay */}
                      {assistant.division && (
                        <div className="absolute top-2.5 left-2.5 z-10">
                          <span
                            className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded shadow-sm backdrop-blur-sm ${
                              isBphOrHead
                                ? "bg-[#1E2B25]/90 text-[#F5F2EB] border border-[#A8977B]/40"
                                : "bg-white/95 text-neutral-800 border border-neutral-200"
                            }`}
                          >
                            {assistant.division}
                          </span>
                        </div>
                      )}

                      {/* Batch badge */}
                      {assistant.batch && (
                        <div className="absolute top-2.5 right-2.5 z-10">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm">
                            '{assistant.batch.substring(2)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Meta info */}
                    <div className="p-3.5">
                      <h4 className="font-serif font-bold text-sm text-[#1E2B25] group-hover:text-[#2C3E35] transition-colors leading-tight line-clamp-1">
                        {assistant.name}
                      </h4>
                      <p className="text-[11px] text-neutral-600 mt-1 font-sans line-clamp-1">
                        {assistant.position_label || assistant.position || "Assistant"}
                      </p>

                      {assistant.show_nim && assistant.nim && (
                        <p className="text-[10px] font-mono text-neutral-400 mt-0.5">
                          NRP: {assistant.nim}
                        </p>
                      )}

                      {/* Expertise Badges */}
                      {assistant.expertise && assistant.expertise.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2.5">
                          {assistant.expertise.slice(0, 2).map((exp, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600"
                            >
                              {exp}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div
                    className="px-3.5 py-2 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between text-[11px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      {assistant.email_public && (
                        <a
                          href={`mailto:${assistant.email_public}`}
                          title={assistant.email_public}
                          className="text-neutral-400 hover:text-[#2C3E35] transition-colors"
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {ig && (
                        <a
                          href={ig.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={ig.handle}
                          className="text-neutral-400 hover:text-pink-600 transition-colors"
                        >
                          <Instagram className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {assistant.social?.linkedin && (
                        <a
                          href={assistant.social.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="LinkedIn"
                          className="text-neutral-400 hover:text-blue-700 transition-colors"
                        >
                          <Linkedin className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openModal(assistant)}
                      className="text-[10px] font-medium text-[#2C3E35] hover:text-[#A8977B] transition-colors"
                    >
                      Profile →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ======================================================== */}
      {/* 4. MODAL DETAIL POPUP                                    */}
      {/* ======================================================== */}
      {selectedMember && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="member-detail-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-neutral-200 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header / Banner */}
            <div className="relative bg-gradient-to-r from-[#1E2B25] to-[#2C3E35] text-white p-6 md:p-8">
              <button
                type="button"
                onClick={closeModal}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition-colors text-sm"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <div className="w-28 h-36 rounded-xl overflow-hidden border-2 border-[#A8977B] flex-shrink-0 bg-[#16201B] shadow-md">
                  {selectedMember.photo_url ? (
                    <img
                      src={selectedMember.photo_url}
                      alt={selectedMember.photo_alt || selectedMember.name}
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <MonogramPlaceholder
                      name={selectedMember.name}
                      batch={selectedMember.batch || "2024"}
                    />
                  )}
                </div>

                <div className="text-center sm:text-left space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#A8977B] text-[#1E2B25] font-bold uppercase tracking-wider">
                      {selectedMember.division || selectedMember.role}
                    </span>
                    {selectedMember.batch && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/20 text-white">
                        Batch {selectedMember.batch}
                      </span>
                    )}
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                        selectedMember.status === "active"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-neutral-500/20 text-neutral-300"
                      }`}
                    >
                      {selectedMember.status === "active" ? "Active" : "Alumni"}
                    </span>
                  </div>

                  <h3 className="text-xl md:text-2xl font-serif font-bold text-white leading-tight pt-1">
                    {selectedMember.name}
                  </h3>
                  <p className="text-sm text-[#D1C7B7]">
                    {selectedMember.position_label || selectedMember.position || "Member"}
                  </p>
                  {selectedMember.show_nim && selectedMember.nim && (
                    <p className="text-xs font-mono text-[#A8977B]">
                      {selectedMember.role === "lecturer" ? "NIP" : "NRP"}: {selectedMember.nim}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 md:p-8 space-y-6 max-h-[60vh] overflow-y-auto">
              {/* Bio */}
              {selectedMember.bio && (
                <div>
                  <h5 className="text-xs font-mono uppercase tracking-wider text-neutral-500 font-semibold mb-2">
                    Biography / Focus
                  </h5>
                  <p className="text-sm text-neutral-700 leading-relaxed">{selectedMember.bio}</p>
                </div>
              )}

              {/* Research & Technical Expertise */}
              {selectedMember.expertise && selectedMember.expertise.length > 0 && (
                <div>
                  <h5 className="text-xs font-mono uppercase tracking-wider text-neutral-500 font-semibold mb-2">
                    Areas of Expertise
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedMember.expertise.map((exp: string, idx: number) => (
                      <span
                        key={idx}
                        className="text-xs px-2.5 py-1 rounded-md bg-[#2C3E35]/10 text-[#2C3E35] font-medium border border-[#2C3E35]/20"
                      >
                        {exp}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected Publications at TNL */}
              {memberPubs && memberPubs.length > 0 && (
                <div
                  className="border-t pt-4"
                  style={{ borderColor: "var(--tnl-border)" }}
                  data-testid={`member-publications-${selectedMember.id}`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2C3E35] mb-2.5">
                    <BookOpen className="h-3.5 w-3.5 text-[#A8977B]" aria-hidden="true" />
                    Selected Publications at TNL ({memberPubs.length})
                  </div>
                  <div className="space-y-2">
                    {memberPubs.map((pub) => (
                      <div
                        key={pub.id}
                        className="rounded-lg border border-neutral-200 p-3 text-xs transition-colors hover:border-[#2C3E35] bg-neutral-50"
                      >
                        <p className="font-semibold text-neutral-800 leading-snug">{pub.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-neutral-500">
                          <span>{pub.year}</span>
                          {pub.venue && <span>· {pub.venue}</span>}
                          {pub.doi && (
                            <a
                              href={`https://doi.org/${pub.doi}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-semibold text-[#2C3E35] hover:underline"
                            >
                              DOI <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Public Contact & Social Links */}
              <div>
                <h5 className="text-xs font-mono uppercase tracking-wider text-neutral-500 font-semibold mb-2">
                  Contact & Profiles
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {selectedMember.email_public && (
                    <a
                      href={`mailto:${selectedMember.email_public}`}
                      className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-700 transition-colors"
                    >
                      <Mail className="w-4 h-4 text-[#A8977B]" />
                      <span className="truncate">{selectedMember.email_public}</span>
                    </a>
                  )}

                  {selectedMember.social?.instagram && (
                    <a
                      href={formatInstagramHandle(selectedMember.social.instagram)?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-700 transition-colors"
                    >
                      <Instagram className="w-4 h-4 text-pink-600" />
                      <span>{formatInstagramHandle(selectedMember.social.instagram)?.handle}</span>
                    </a>
                  )}

                  {selectedMember.social?.linkedin && (
                    <a
                      href={selectedMember.social.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-700 transition-colors"
                    >
                      <Linkedin className="w-4 h-4 text-blue-700" />
                      <span>LinkedIn Profile</span>
                    </a>
                  )}

                  {selectedMember.social?.scholar && (
                    <a
                      href={selectedMember.social.scholar}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-700 transition-colors"
                    >
                      <GraduationCap className="w-4 h-4 text-[#2C3E35]" />
                      <span>Google Scholar</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Close Button */}
              <div className="pt-4 border-t border-neutral-200 flex justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-neutral-800 transition-colors"
                >
                  Close Window
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export function MemberSectionsPlaceholder() {
  return null;
}
