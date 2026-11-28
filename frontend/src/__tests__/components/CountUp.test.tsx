import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { CountUp } from "@/components/site/CountUp";

const originalIO = global.IntersectionObserver;
const originalMatchMedia = window.matchMedia;

function mockMatchMedia(reduce: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: reduce && query.includes("reduce"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
}

function mockVisibleObserver() {
    global.IntersectionObserver = class {
        private cb: IntersectionObserverCallback;
        constructor(cb: IntersectionObserverCallback) {
            this.cb = cb;
        }
        observe() {
            this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
        }
        disconnect() {}
        unobserve() {}
        takeRecords() {
            return [];
        }
    } as unknown as typeof IntersectionObserver;
}

afterEach(() => {
    global.IntersectionObserver = originalIO;
    window.matchMedia = originalMatchMedia;
    vi.useRealTimers();
});

describe("CountUp", () => {
    it("keeps the final value for screen readers and shows it instantly when nothing triggers the animation", () => {
        mockMatchMedia(false);
        render(<div data-testid="host"><CountUp value="25" /></div>);
        const host = screen.getByTestId("host");
        expect(host.querySelector("[aria-hidden='true']")).toHaveTextContent("25");
        expect(host.querySelector(".sr-only")).toHaveTextContent("25");
    });

    it("skips the animation for reduced-motion users", () => {
        mockMatchMedia(true);
        mockVisibleObserver();
        render(<div data-testid="host"><CountUp value="25" /></div>);
        expect(screen.getByTestId("host").querySelector("[aria-hidden='true']")).toHaveTextContent("25");
    });

    it("counts up to the final value once visible and never animates non-numeric values", async () => {
        mockMatchMedia(false);
        mockVisibleObserver();
        vi.useFakeTimers();
        const { rerender, container } = render(<CountUp value="40" />);
        const ticking = container.querySelector("[aria-hidden='true']") as HTMLElement;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1400);
        });
        expect(ticking).toHaveTextContent("40");
        expect(container.querySelector(".sr-only")).toHaveTextContent("40");
        rerender(<CountUp value="B-301" />);
        expect(container.querySelector("[aria-hidden='true']")).toHaveTextContent("B-301");
    });
});
