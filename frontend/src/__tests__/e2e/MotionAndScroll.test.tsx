import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LazyMotion, domAnimation } from "motion/react";
import { ReadingProgressBar } from "@/components/site/ReadingProgressBar";
import { SmoothScrollProvider, useSmoothScroll } from "@/components/site/SmoothScrollProvider";
import { SpotlightCard, handleSpotlightPointerMove } from "@/components/site/SpotlightCard";

vi.mock("lenis", () => {
    return {
        default: class MockLenis {
            raf = vi.fn();
            scrollTo = vi.fn();
            stop = vi.fn();
            start = vi.fn();
            destroy = vi.fn();
        },
    };
});

describe("Precision Engineering Motion Suite", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: desktop with fine pointer, no reduced motion
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("ReadingProgressBar Component", () => {
        it("renders on legal pages (/privacy and /terms)", () => {
            const { unmount } = render(
                <MemoryRouter initialEntries={["/privacy"]}>
                    <ReadingProgressBar />
                </MemoryRouter>,
            );

            const bar = screen.getByTestId("reading-progress-bar");
            expect(bar).toBeInTheDocument();
            expect(bar).toHaveClass("tnl-reading-progress");
            expect(bar).toHaveClass("print:hidden");
            expect(bar).toHaveClass("motion-reduce:hidden");
            unmount();
        });

        it("renders on article detail routes (/news/:slug)", () => {
            render(
                <MemoryRouter initialEntries={["/news/advanced-5g-research"]}>
                    <ReadingProgressBar />
                </MemoryRouter>,
            );

            expect(screen.getByTestId("reading-progress-bar")).toBeInTheDocument();
        });

        it("does NOT render on non-reading pages like home (/) or news index (/news)", () => {
            const { unmount } = render(
                <MemoryRouter initialEntries={["/"]}>
                    <ReadingProgressBar />
                </MemoryRouter>,
            );

            expect(screen.queryByTestId("reading-progress-bar")).not.toBeInTheDocument();
            unmount();

            render(
                <MemoryRouter initialEntries={["/news"]}>
                    <ReadingProgressBar />
                </MemoryRouter>,
            );

            expect(screen.queryByTestId("reading-progress-bar")).not.toBeInTheDocument();
        });
    });

    describe("SmoothScrollProvider Component", () => {
        it("initializes Lenis on public desktop routes", async () => {
            function TestConsumer() {
                const { lenis } = useSmoothScroll();
                return <div data-testid="lenis-status">{lenis ? "active" : "inactive"}</div>;
            }

            render(
                <MemoryRouter initialEntries={["/"]}>
                    <SmoothScrollProvider>
                        <TestConsumer />
                    </SmoothScrollProvider>
                </MemoryRouter>,
            );

            expect(screen.getByTestId("lenis-status").textContent).toBe("active");
        });

        it("does NOT initialize Lenis on admin routes (/admin/*)", () => {
            function TestConsumer() {
                const { lenis } = useSmoothScroll();
                return <div data-testid="lenis-status">{lenis ? "active" : "inactive"}</div>;
            }

            render(
                <MemoryRouter initialEntries={["/admin/dashboard"]}>
                    <SmoothScrollProvider>
                        <TestConsumer />
                    </SmoothScrollProvider>
                </MemoryRouter>,
            );

            expect(screen.getByTestId("lenis-status").textContent).toBe("inactive");
        });

        it("does NOT initialize Lenis when prefers-reduced-motion is active", () => {
            window.matchMedia = vi.fn().mockImplementation((query: string) => ({
                matches: query.includes("prefers-reduced-motion: reduce"),
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }));

            function TestConsumer() {
                const { lenis } = useSmoothScroll();
                return <div data-testid="lenis-status">{lenis ? "active" : "inactive"}</div>;
            }

            render(
                <MemoryRouter initialEntries={["/"]}>
                    <SmoothScrollProvider>
                        <TestConsumer />
                    </SmoothScrollProvider>
                </MemoryRouter>,
            );

            expect(screen.getByTestId("lenis-status").textContent).toBe("inactive");
        });

        it("does NOT initialize Lenis on coarse pointer touch devices", () => {
            window.matchMedia = vi.fn().mockImplementation((query: string) => ({
                matches: query.includes("pointer: coarse"),
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }));

            function TestConsumer() {
                const { lenis } = useSmoothScroll();
                return <div data-testid="lenis-status">{lenis ? "active" : "inactive"}</div>;
            }

            render(
                <MemoryRouter initialEntries={["/"]}>
                    <SmoothScrollProvider>
                        <TestConsumer />
                    </SmoothScrollProvider>
                </MemoryRouter>,
            );

            expect(screen.getByTestId("lenis-status").textContent).toBe("inactive");
        });

        it("calls lenis.destroy() on component unmount", () => {
            let capturedLenis: unknown = null;
            function TestConsumer() {
                const { lenis } = useSmoothScroll();
                capturedLenis = lenis;
                return <div>Content</div>;
            }

            const { unmount } = render(
                <MemoryRouter initialEntries={["/"]}>
                    <SmoothScrollProvider>
                        <TestConsumer />
                    </SmoothScrollProvider>
                </MemoryRouter>,
            );

            expect(capturedLenis).not.toBeNull();
            const destroySpy = vi.spyOn(capturedLenis as { destroy: () => void }, "destroy");
            unmount();
            expect(destroySpy).toHaveBeenCalled();
        });
    });

    describe("Cursor Spotlight & Micro-Interactions", () => {
        it("handleSpotlightPointerMove sets --spot-x and --spot-y on element style directly", () => {
            const el = document.createElement("div");
            el.getBoundingClientRect = () => ({
                left: 100,
                top: 50,
                width: 200,
                height: 100,
                right: 300,
                bottom: 150,
                x: 100,
                y: 50,
                toJSON: () => {},
            });

            const fakeEvent = {
                clientX: 150,
                clientY: 90,
                currentTarget: el,
            } as unknown as React.PointerEvent<HTMLElement>;

            handleSpotlightPointerMove(fakeEvent);

            expect(el.style.getPropertyValue("--spot-x")).toBe("50px");
            expect(el.style.getPropertyValue("--spot-y")).toBe("40px");
        });

        it("SpotlightCard renders with hairline spotlight classes and updates CSS vars on pointer move", () => {
            render(
                <LazyMotion features={domAnimation} strict>
                    <SpotlightCard data-testid="test-spotlight-card">
                        <span>Card Content</span>
                    </SpotlightCard>
                </LazyMotion>,
            );

            const card = screen.getByTestId("test-spotlight-card");
            expect(card).toHaveClass("tnl-card-spotlight");
            expect(card).toHaveClass("tnl-scroll-reveal");

            card.getBoundingClientRect = () => ({
                left: 0,
                top: 0,
                width: 300,
                height: 200,
                right: 300,
                bottom: 200,
                x: 0,
                y: 0,
                toJSON: () => {},
            });

            fireEvent.pointerMove(card, { clientX: 75, clientY: 45 });

            expect(card.style.getPropertyValue("--spot-x")).toBe("75px");
            expect(card.style.getPropertyValue("--spot-y")).toBe("45px");
        });
    });
});
