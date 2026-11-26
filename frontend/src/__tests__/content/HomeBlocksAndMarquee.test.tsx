import { afterEach, describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { BlockRenderer } from "@/components/site/Blocks";
import { renderWithProviders } from "./test-utils";

vi.mock("@/lib/api/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/hooks")>();
  return {
    ...actual,
    usePartners: vi.fn().mockReturnValue({
      data: [
        {
          id: "p1",
          name: "Indosat Ooredoo Hutchison",
          logo_url: "/logo.png",
          published: true,
        },
      ],
      isLoading: false,
    }),
  };
});

describe("Home Blocks & Marquee Components", () => {
  it("HeroBlock renders emblem, .tnl-eyebrow, and .tnl-hero-title", () => {
    const blocks = [
      {
        id: "hero-1",
        type: "hero" as const,
        hidden: false,
        props: {
          badge: "Telecommunication Network Laboratory",
          badge_id: "Laboratorium Jaringan Telekomunikasi",
          title: "Next-Gen Telecommunications & Cloud Infrastructure",
          title_id: "Infrastruktur Cloud & Telekomunikasi Generasi Baru",
          description: "Hands-on research and academic excellence in Room B-301.",
          description_id: "Riset terapan dan keunggulan akademik di Ruang B-301.",
        },
      },
    ];

    const { container } = renderWithProviders(<BlockRenderer blocks={blocks} />);
    const heroSection = screen.getByTestId("block-hero");
    expect(heroSection).toBeInTheDocument();

    // Verify .tnl-eyebrow and .tnl-hero-title typography classes
    const eyebrow = container.querySelector(".tnl-eyebrow");
    expect(eyebrow).toBeInTheDocument();

    const heroTitle = container.querySelector(".tnl-hero-title");
    expect(heroTitle).toBeInTheDocument();
  });

  it("AboutBlock provides readable non-justified editorial copy", () => {
    const blocks = [
      {
        id: "about-1",
        type: "about" as const,
        hidden: false,
        props: {
          badge: "About the Laboratory",
          badge_id: "Tentang Laboratorium",
          title: "Advancing Network Research",
          title_id: "Mendorong Riset Jaringan",
          description: "Established under the Department of Electrical Engineering ITS to foster academic and practical networking mastery.",
          description_id: "Didirikan di bawah Departemen Teknik Elektro ITS untuk mengembangkan penguasaan jaringan secara praktis dan akademis.",
        },
      },
    ];

    const { container } = renderWithProviders(<BlockRenderer blocks={blocks} />);
    const paragraph = container.querySelector(".signal-about-body");
    expect(paragraph).toBeInTheDocument();
    expect(paragraph).not.toHaveClass("text-justify");
  });

  it("PartnersBlock renders partner marquee container without truncation", () => {
    const blocks = [
      {
        id: "partners-1",
        type: "partners" as const,
        hidden: false,
        props: {
          title: "Industry & Academic Partners",
          title_id: "Mitra Industri & Akademik",
        },
      },
    ];

    const { container } = renderWithProviders(<BlockRenderer blocks={blocks} />);
    expect(screen.getByTestId("partners-heading")).toBeInTheDocument();

    // Verify partner name is rendered untruncated (multiple in marquee loop)
    expect(screen.getAllByText("Indosat Ooredoo Hutchison").length).toBeGreaterThan(0);

    // Verify marquee container has overflow-hidden
    const marqueeContainer = container.querySelector(".overflow-hidden");
    expect(marqueeContainer).toBeInTheDocument();
  });
});

describe("AboutBlock editorial layout", () => {
  afterEach(() => {
    localStorage.removeItem("tnl-locale");
  });

  const leadEn = "A teaching and applied research laboratory at the Department of Electrical Engineering, ITS. Run by faculty, researchers, and student assistants, TNL bridges undergraduate network practicum, core infrastructure research, and industry training.";
  const leadId = "Laboratorium pengajaran dan riset terapan di Departemen Teknik Elektro ITS. Dikelola oleh dosen, peneliti, dan asisten mahasiswa, TNL menjembatani praktikum jaringan, riset infrastruktur inti, serta pelatihan industri.";
  const hardwareEn = [
    "3-Node Proxmox Cloud Cluster",
    "Cisco & MikroTik Core Racks",
    "Optical Fusion Splicing Benches",
    "Ettus USRP B210 SDR",
  ];
  const hardwareId = [
    "Klaster Cloud Proxmox 3 Node",
    "Rak Routing Cisco & MikroTik",
    "Meja Splicing Serat Optik",
    "SDR Ettus USRP B210",
  ];

  const block = (legacy = false) => [
    {
      id: "about-1",
      type: "about" as const,
      hidden: false,
      props: {
        heading: "About the Laboratory",
        heading_id: "Tentang Laboratorium",
        body: leadEn,
        body_id: leadId,
        location: "Room B-301, Building B (3rd Floor) · Electrical Engineering, ITS",
        location_id: "Ruang B-301, Gedung B (Lt. 3) · Teknik Elektro ITS",
        tiles: [
          {
            name: "Vision",
            name_id: "Visi",
            eyebrow: "01 · VISION",
            eyebrow_id: "01 · VISI",
            description: "Advancing industry-grade network practicum and applied research across enterprise networking, optical fiber transport, and cloud infrastructure.",
            description_id: "Mengembangkan praktikum jaringan berstandar industri dan riset terapan di bidang jaringan enterprise, fiber optik, serta infrastruktur cloud.",
          },
          legacy
            ? {
                name: "Room B-301 Facilities & Testbeds",
                name_id: "Fasilitas & Testbed Ruang B-301",
                description: "Integrated laboratory hosting a 3-Node Proxmox Cloud Cluster, Cisco & MikroTik Core Racks, Optical Fusion Splicing Benches, and Ettus USRP B210 SDR.",
              }
            : {
                name: "Testbeds & Hardware",
                name_id: "Fasilitas & Testbed",
                eyebrow: "02 · TESTBEDS & HARDWARE",
                eyebrow_id: "02 · FASILITAS & TESTBED",
                items: hardwareEn,
                items_id: hardwareId,
              },
        ],
      },
    },
  ];

  it("renders concise EN editorial copy, four hardware items, and no decorative check icon", () => {
    localStorage.setItem("tnl-locale", "en");
    const { container } = renderWithProviders(<BlockRenderer blocks={block()} />);

    expect(screen.getByTestId("about-body")).toHaveTextContent(leadEn.slice(0, 60));
    expect(screen.getByText("01 · VISION")).toBeInTheDocument();
    expect(screen.getByText("02 · TESTBEDS & HARDWARE")).toBeInTheDocument();
    hardwareEn.forEach((item) => expect(screen.getByText(item)).toBeInTheDocument());
    expect(screen.getByTestId("about-location-line")).toHaveTextContent("Room B-301, Building B (3rd Floor)");
    expect(container.querySelector(".lucide-circle-check-big")).toBeNull();
    expect(screen.getByTestId("block-about")).not.toHaveTextContent("5G/6G");
    expect(screen.getByTestId("block-about")).not.toHaveTextContent("IoT");
  });

  it("renders the Indonesian copy and bilingual hardware list", () => {
    localStorage.setItem("tnl-locale", "id");
    renderWithProviders(<BlockRenderer blocks={block()} />);

    expect(screen.getByTestId("about-body")).toHaveTextContent(leadId.slice(0, 50));
    expect(screen.getByText("01 · VISI")).toBeInTheDocument();
    expect(screen.getByText("02 · FASILITAS & TESTBED")).toBeInTheDocument();
    hardwareId.forEach((item) => expect(screen.getByText(item)).toBeInTheDocument());
    expect(screen.getByTestId("about-location-line")).toHaveTextContent("Ruang B-301, Gedung B (Lt. 3)");
  });

  it("parses a legacy CMS paragraph into a compact spec list without crashing", () => {
    localStorage.setItem("tnl-locale", "en");
    renderWithProviders(<BlockRenderer blocks={block(true)} />);

    const items = screen.getAllByTestId(/about-testbed-item-/);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.map((item) => item.textContent).join(" ")).toContain("Proxmox");
  });
});
