import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { pickProp, useLocale } from "@/lib/i18n";
import "./signal-editorial.css";

const text = (props: Record<string, unknown>, key: string, fallback = "") => typeof props[key] === "string" ? props[key] as string : fallback;

export function SignalHero({ props }: { props: Record<string, unknown> }) {
    const { locale, t } = useLocale();
    const image = text(props, "image_url");
    const caption = pickProp(locale, props, "image_caption");
    return (
        <section className="signal-hero" data-testid="block-hero">
            <div className="tnl-container signal-hero-layout">
                <div className="signal-hero-copy">
                    {text(props, "badge") && <p className="tnl-eyebrow signal-kicker" data-testid="hero-badge"><span aria-hidden="true" />{pickProp(locale, props, "badge")}</p>}
                    <h1 className="tnl-hero-title" data-testid="hero-title">{pickProp(locale, props, "title_before")}{" "}<em>{pickProp(locale, props, "title_accent")}</em>{" "}{pickProp(locale, props, "title_after")}</h1>
                    <p className="signal-hero-intro" data-testid="hero-intro">{pickProp(locale, props, "intro")}</p>
                    <div className="signal-hero-actions">
                        <Link to={text(props, "primary_url", "/activity")} viewTransition className="tnl-btn tnl-btn-tan" data-testid="hero-primary-cta-button">{pickProp(locale, props, "primary_label") || t("see_all")}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
                        <Link to={text(props, "secondary_url", "/contact")} viewTransition className="tnl-btn tnl-btn-ghost-light" data-testid="hero-secondary-cta-button">{pickProp(locale, props, "secondary_label") || t("join_us")}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
                    </div>
                </div>
                <figure className="signal-hero-figure" data-testid="hero-emblem-container">
                    {image ? <>
                        <img className="signal-hero-photo" src={image} alt={pickProp(locale, props, "image_alt")} fetchPriority="high" width="960" height="1080" />
                        {caption && <figcaption>{caption}</figcaption>}
                    </> : <>
                        <div className="signal-network" data-testid="hero-network-illustration" aria-hidden="true">
                            <div className="signal-network-top"><span>NETWORK / TNL</span><span>01 — 04</span></div>
                            <svg viewBox="0 0 520 430" fill="none">
                                <g className="signal-network-grid" stroke="currentColor" strokeWidth=".6">{[80,160,240,320,400,480].map(x => <path key={`v${x}`} d={`M${x} 0V430`} />)}{[55,135,215,295,375].map(y => <path key={`h${y}`} d={`M0 ${y}H520`} />)}</g>
                                <g stroke="currentColor" strokeWidth="1.5"><path d="M80 295L240 135L400 215L240 375L80 295L80 135L240 55L400 135L400 215M240 135V375M80 135L240 215L400 135M240 55V135M240 215L80 295" /></g>
                                <g className="signal-network-orbit" stroke="currentColor"><ellipse cx="240" cy="215" rx="185" ry="185" strokeDasharray="3 9" /></g>
                                {[[80,295],[240,135],[400,215],[240,375],[80,135],[240,55],[400,135],[240,215]].map(([cx,cy], index) => <g key={index}><circle cx={cx} cy={cy} r={index === 1 ? 10 : 5} fill="currentColor" /><circle cx={cx} cy={cy} r={index === 1 ? 19 : 12} stroke="currentColor" strokeOpacity=".3" /></g>)}
                                <g fill="currentColor" fontSize="10" fontFamily="monospace"><text x="96" y="119">01 / ACCESS</text><text x="260" y="127">02 / COMPUTE</text><text x="415" y="240">03 / EDGE</text><text x="259" y="395">04 / CLOUD</text></g>
                            </svg>
                            <div className="signal-network-bottom"><span>TELECOMMUNICATION<br />NETWORKS LABORATORY</span><span aria-hidden="true">↗</span></div>
                        </div>
                        <figcaption>{locale === "id" ? "Ilustrasi jaringan · bukan telemetri langsung" : "Network illustration · not live telemetry"}</figcaption>
                    </>}
                </figure>
            </div>
        </section>
    );
}
