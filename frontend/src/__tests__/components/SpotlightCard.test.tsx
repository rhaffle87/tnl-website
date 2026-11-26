import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import {
    SpotlightCard,
    cancelSpotlightFrame,
    handleSpotlightPointerEnter,
    handleSpotlightPointerMove,
} from "@/components/site/SpotlightCard";

const rect = {
    left: 10,
    top: 20,
    width: 100,
    height: 50,
    right: 110,
    bottom: 70,
    x: 10,
    y: 20,
    toJSON: () => ({}),
} as DOMRect;

let frames: FrameRequestCallback[] = [];
let cancelled: number[] = [];

beforeEach(() => {
    frames = [];
    cancelled = [];
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => { cancelled.push(id); }));
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const move = (element: HTMLElement, clientX: number, clientY: number) =>
    handleSpotlightPointerMove({ currentTarget: element, clientX, clientY } as never);

describe("spotlight pointer helper", () => {
    it("caches the rect on pointerenter and throttles writes with rAF", () => {
        const element = document.createElement("div");
        handleSpotlightPointerEnter({ currentTarget: element } as never);
        move(element, 35, 50);
        move(element, 45, 60);

        expect(HTMLElement.prototype.getBoundingClientRect).toHaveBeenCalledTimes(1);
        expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
        expect(element.style.getPropertyValue("--spot-x")).toBe("25px");

        frames[0](0);
        expect(element.style.getPropertyValue("--spot-x")).toBe("35px");
        expect(element.style.getPropertyValue("--spot-y")).toBe("40px");
    });

    it("keeps the first paint synchronous and coalesces later moves in rAF", () => {
        const element = document.createElement("div");
        handleSpotlightPointerEnter({ currentTarget: element } as never);
        move(element, 35, 50);
        expect(element.style.getPropertyValue("--spot-x")).toBe("25px");

        move(element, 45, 60);
        expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
        expect(element.style.getPropertyValue("--spot-x")).toBe("25px");
        frames[0](0);
        expect(element.style.getPropertyValue("--spot-x")).toBe("35px");
        expect(element.style.getPropertyValue("--spot-y")).toBe("40px");
    });

    it("keeps the reduced-motion guard", () => {
        vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
        const element = document.createElement("div");
        handleSpotlightPointerEnter({ currentTarget: element } as never);
        move(element, 35, 50);

        expect(requestAnimationFrame).not.toHaveBeenCalled();
        expect(element.style.getPropertyValue("--spot-x")).toBe("");
    });

    it("cancels a pending frame", () => {
        const element = document.createElement("div");
        handleSpotlightPointerEnter({ currentTarget: element } as never);
        move(element, 35, 50);
        cancelSpotlightFrame(element);

        expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
        move(element, 45, 60);
        expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    });

    it("cancels the pending frame when the card unmounts", () => {
        const { container, unmount } = render(<SpotlightCard>content</SpotlightCard>);
        const card = container.firstElementChild as HTMLElement;
        fireEvent.pointerOver(card, { clientX: 35, clientY: 50 });
        fireEvent.pointerMove(card, { clientX: 35, clientY: 50 });
        expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

        unmount();
        expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    });
});
