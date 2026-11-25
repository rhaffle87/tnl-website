import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SectionHeading } from "./Primitives";
import { pick, pickProp, useLocale } from "@/lib/i18n";
import "./signal-editorial.css";

type Photo = { url: string; alt?: string; caption?: string; caption_id?: string };
export function SignalGallery({ props }: { props: Record<string, unknown> }) {
    const { locale } = useLocale();
    const images = Array.isArray(props.images) ? (props.images as Photo[]).filter(image => image && typeof image.url === "string" && image.url) : [];
    const [selected, setSelected] = useState<number | null>(null);
    const trigger = useRef<HTMLButtonElement | null>(null);
    const photo = selected !== null ? images[selected] : undefined;
    const label = (image: Photo) => pick(locale, image.caption || image.alt, image.caption_id || image.alt);
    if (!images.length) return null;
    return (
        <section className="tnl-section signal-gallery" data-testid="block-gallery">
            <div className="tnl-container">
                {pickProp(locale, props, "heading") && <SectionHeading title={pickProp(locale, props, "heading")} testId="gallery-heading" />}
                {pickProp(locale, props, "note") && <p className="signal-gallery-note">{pickProp(locale, props, "note")}</p>}
                <div className="signal-gallery-grid">
                    {images.map((image, index) => (
                        <button key={`${image.url}-${index}`} type="button" className="signal-gallery-item inline-flex min-h-[44px] w-full flex-col" data-testid={`gallery-item-${index}`} onClick={event => { trigger.current = event.currentTarget; setSelected(index); }}>
                            <span className="signal-gallery-media block w-full overflow-hidden" style={{ aspectRatio: "16 / 9" }}><img src={image.url} alt={image.alt || label(image)} width="1600" height="900" className="h-full w-full object-cover" loading="lazy" /></span>
                            <span className="signal-gallery-caption"><span><span className="signal-photo-index">{String(index + 1).padStart(2, "0")} / </span>{label(image)}</span><span aria-hidden="true">↗</span></span>
                        </button>
                    ))}
                </div>
                <Dialog open={!!photo} onOpenChange={open => { if (!open) setSelected(null); }}>
                    <DialogContent className="signal-lightbox" data-testid="gallery-lightbox" finalFocus={trigger}>
                        <DialogTitle className="sr-only">{photo ? label(photo) : ""}</DialogTitle>
                        {photo && <figure><img src={photo.url} alt={photo.alt || label(photo)} width="1600" height="900" /><figcaption>{label(photo)}</figcaption></figure>}
                    </DialogContent>
                </Dialog>
            </div>
        </section>
    );
}
