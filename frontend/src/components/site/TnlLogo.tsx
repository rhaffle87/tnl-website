import { cn } from "@/lib/utils/utils";

export interface TnlLogoProps {
    variant?: "auto" | "light" | "dark" | "white" | "badge";
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
    variant = "auto",
    size = "md",
    className,
    imgClassName,
    alt = "Logo Laboratorium Jaringan Telekomunikasi ITS",
    priority = false,
}: TnlLogoProps) {
    if (variant === "auto") {
        return (
            <span
                className={cn(
                    "inline-flex shrink-0 items-center justify-center",
                    SIZE_MAP[size],
                    className
                )}
            >
                {/* Dark logo on light background (Light mode) */}
                <img
                    src="/assets/brand/tnl-logo-dark.svg"
                    alt={alt}
                    className={cn("block dark:hidden h-full w-full object-contain", imgClassName)}
                    fetchPriority={priority ? "high" : "auto"}
                    loading={priority ? "eager" : "lazy"}
                />
                {/* White logo on dark background (Dark mode) */}
                <img
                    src="/assets/brand/tnl-logo-white.svg"
                    alt={alt}
                    className={cn("hidden dark:block h-full w-full object-contain", imgClassName)}
                    fetchPriority={priority ? "high" : "auto"}
                    loading={priority ? "eager" : "lazy"}
                />
            </span>
        );
    }

    const src =
        variant === "dark"
            ? "/assets/brand/tnl-logo-dark.svg"
            : variant === "badge"
              ? "/assets/brand/tnl-logo-badge.png"
              : "/assets/brand/tnl-logo-white.svg"; // "light" or "white"

    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center justify-center",
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
