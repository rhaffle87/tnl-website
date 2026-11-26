import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { BlockRenderer } from "@/components/site/Blocks";
import { renderWithProviders } from "./test-utils";
vi.mock("@/components/site/MemberSections", () => ({ MemberSections: () => null, MemberSectionsPlaceholder: () => null }));
vi.mock("@/lib/api/hooks", () => ({ useSettings: vi.fn(), usePosts: vi.fn(), useMembers: vi.fn(), usePartners: vi.fn(), useStats: vi.fn() }));
import { useSettings, usePosts, useMembers, usePartners, useStats } from "@/lib/api/hooks";
const hero = { badge: "ITS / Research", title_before: "Connected", title_before_id: "Riset", title_accent: "research", title_accent_id: "terhubung", intro: "CMS subtitle", primary_label: "Explore", primary_url: "/activity?tab=rd", secondary_label: "Contact", secondary_href: "/contact" };
describe("Signal Editorial CMS blocks", () => {
 beforeEach(() => {
  localStorage.setItem("tnl-locale", "en");
  vi.mocked(useSettings).mockReturnValue({ data: { site_title: "CMS Laboratory" } } as never);
  vi.mocked(usePosts).mockReturnValue({ data: { items: [], total: 0 }, isLoading: false } as never);
  vi.mocked(useMembers).mockReturnValue({ data: [], isLoading: false } as never);
  vi.mocked(usePartners).mockReturnValue({ data: [], isLoading: false } as never);
  vi.mocked(useStats).mockReturnValue({ data: { members: 4, lecturers: 2, students: 2, alumni: 0, posts: 3, activities: 2, research: 1, practicum: 0, modules: 0 } } as never);
 });
 it("renders CMS hero copy and links with an explicitly illustrative fallback", () => {
  renderWithProviders(<BlockRenderer blocks={[{ id: "h", hidden: false, type: "hero", props: hero }]} />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Connected research");
  expect(screen.getByRole("link", { name: /Explore/ })).toHaveAttribute("href", "/activity?tab=rd");
  expect(screen.getByTestId("hero-network-illustration")).toBeInTheDocument();
  expect(screen.getByText(/Network illustration/)).toBeInTheDocument();
 });
 it("uses existing CMS hero image fields instead of a hardcoded stock image", () => {
  renderWithProviders(<BlockRenderer blocks={[{ id: "h", hidden: false, type: "hero", props: { ...hero, image_url: "/uploads/lab.webp", image_alt: "TNL testbed", image_caption: "Private cloud facility" } }]} />);
  expect(screen.getByRole("img", { name: "TNL testbed" })).toHaveAttribute("src", "/uploads/lab.webp");
  expect(screen.getByText("Private cloud facility")).toBeInTheDocument();
  expect(screen.queryByTestId("hero-network-illustration")).not.toBeInTheDocument();
 });
 it("keeps locale content editable for the new hero", () => {
  localStorage.setItem("tnl-locale", "id");
  renderWithProviders(<BlockRenderer blocks={[{ id: "h", hidden: false, type: "hero", props: hero }]} />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Riset terhubung");
 });
 it("renders gallery notes and dismisses its labelled lightbox with Escape", async () => {
  renderWithProviders(<BlockRenderer blocks={[{ id: "g", hidden: false, type: "gallery", props: { heading: "Inside the lab", note: "CMS gallery note", images: [{ url: "/lab.webp", alt: "Cloud rack", caption: "Cloud testbed" }] } }]} />);
  expect(screen.getByText("CMS gallery note")).toBeInTheDocument();
  const trigger = screen.getByTestId("gallery-item-0");
  await userEvent.click(trigger);
  expect(screen.getByRole("dialog", { name: "Cloud testbed" })).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
 });
 it("extends editorial treatment to remaining CMS section types", () => {
  renderWithProviders(<BlockRenderer blocks={[
   { id: "a", hidden: false, type: "about", props: { heading: "About", body: "CMS mission", tiles: [] } },
   { id: "c", hidden: false, type: "carousel", props: { slides: [{ title: "Optical", description: "CMS track" }] } },
   { id: "q", hidden: false, type: "quick_links", props: { cards: [{ title: "Contact", url: "/contact" }] } },
  ]} />);
  expect(screen.getByTestId("block-about")).toHaveClass("signal-about");
  expect(screen.getByTestId("carousel-slide")).toHaveClass("signal-study-slide");
  expect(screen.getByTestId("quick-link-card-0")).toHaveClass("signal-directory-link");
 });
 it("uses readable About copy rather than forced justification", () => {
  renderWithProviders(<BlockRenderer blocks={[{ id: "a", hidden: false, type: "about", props: { heading: "About", body: "CMS mission", tiles: [] } }]} />);
  expect(screen.getByTestId("about-body")).not.toHaveClass("text-justify");
 });
 it("presents authored study tracks with accessible direct selection and compact position", async () => {
  renderWithProviders(<BlockRenderer blocks={[{ id: "c", hidden: false, type: "carousel", props: { heading: "Study tracks", slides: [{ title: "Optical", description: "Fibre research" }, { title: "Wireless", description: "Radio research" }] } }]} />);
  expect(screen.getByTestId("carousel-slide")).toHaveTextContent("Optical");
  expect(screen.getByTestId("carousel-position")).toHaveTextContent("01 / 02");
  await userEvent.click(screen.getByRole("button", { name: "Wireless" }));
  expect(screen.getByTestId("carousel-slide")).toHaveTextContent("Radio research");
  expect(screen.getByTestId("carousel-position")).toHaveTextContent("02 / 02");
  await userEvent.click(screen.getByTestId("carousel-next-button"));
  expect(screen.getByTestId("carousel-slide")).toHaveTextContent("Fibre research");
 });
 it("renders CMS research descriptions as editorial rows", () => {
  renderWithProviders(<BlockRenderer blocks={[{ id: "r", hidden: false, type: "numbered_cards", props: { heading: "Research", cards: [{ name: "Cloud networking", description: "CMS controlled area", url: "/activity?tab=rd" }] } }]} />);
  expect(screen.getByText("CMS controlled area")).toBeInTheDocument();
  expect(screen.getByTestId("numbered-card-0")).toHaveClass("signal-research-row");
 });
});
