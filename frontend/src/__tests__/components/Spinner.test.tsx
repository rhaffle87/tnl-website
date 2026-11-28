import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner } from "@/components/site/Primitives";

describe("Spinner", () => {
    it("keeps the inline spinner as the default with its accessible label", () => {
        render(<Spinner label="Loading" />);
        const status = screen.getByTestId("loading-spinner");
        expect(status).toHaveAttribute("role", "status");
        expect(status).toHaveTextContent("Loading");
        expect(status.querySelector(".animate-spin")).toBeInTheDocument();
        expect(status.querySelector(".tnl-skeleton")).toBeNull();
    });

    it("renders skeleton cards as a busy status region, hiding the placeholders from assistive tech", () => {
        render(<Spinner variant="cards" label="Loading" />);
        const status = screen.getByTestId("loading-spinner");
        expect(status).toHaveAttribute("role", "status");
        expect(status).toHaveAttribute("aria-busy", "true");
        expect(status.querySelector(".sr-only")).toHaveTextContent("Loading");
        expect(status.querySelectorAll(".tnl-skeleton-card")).toHaveLength(3);
        expect(status.querySelector(".tnl-skeleton-card")?.closest("[aria-hidden='true']")).not.toBeNull();
        expect(status.querySelector(".animate-spin")).toBeNull();
    });
});
