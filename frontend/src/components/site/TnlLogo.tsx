import { cn } from "@/lib/utils";

export interface TnlLogoProps {
    variant?: "white" | "dark" | "badge";
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    className?: string;
    imgClassName?: string;
    alt?: string;
    priority?: boolean;
}

const SIZE_MAP = {
    xs: "h-6 w-6",
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
    xl: "h-16 w-16",
};

export function TnlLogo({
    variant = "white",
    size = "md",
    className,
    imgClassName,
    alt = "Logo Laboratorium Jaringan Telekomunikasi ITS",
    priority = false,
}: TnlLogoProps) {
    const src =
        variant === "dark"
            ? "/assets/brand/tnl-logo-dark.png"
            : variant === "badge"
              ? "/assets/brand/tnl-logo-badge.png"
              : "/assets/brand/tnl-logo-white.png";

    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center justify-center overflow-hidden",
                SIZE_MAP[size],
                className
            )}
        >
            <img
                src={src}
                alt={alt}
                className={cn("h-full w-full object-contain", imgClassName)}
                fetchPriority={priority ? "high" : "auto"}
                loading={priority ? "eager" : "lazy"}
            />
        </span>
    );
}

export default TnlLogo;
