import { Link, useParams } from "react-router-dom";
import { useEvent } from "@/lib/api/hooks";
import { useLocale } from "@/lib/i18n/i18n";
import { EmptyState, Spinner } from "@/components/site/Primitives";
import { EventCard } from "@/pages/ActivityPage";
import "@/pages/activity-editorial.css";

/** Public CMS event detail. The existing API accepts either slug or public ID. */
export default function EventDetailPage() {
    const { slug } = useParams<{ slug: string }>();
    const { locale, t } = useLocale();
    const { data: event, isLoading, isError } = useEvent(slug);

    return (
        <div className="event-detail-editorial" data-testid="event-detail-page">
            <header className="event-detail-header">
                <div className="tnl-container">
                    <Link to="/activity?tab=events" className="activity-detail-link" data-testid="event-detail-back">
                        ← {locale === "id" ? "Semua acara" : "All events"}
                    </Link>
                    <p className="event-detail-kicker mt-4">TNL / {t("nav_events")}</p>
                </div>
            </header>
            <section className="tnl-container tnl-section event-detail-content" aria-label={t("nav_events")} aria-busy={isLoading}>
                {isLoading ? (
                    <div data-testid="event-detail-loading"><Spinner label={t("loading")} /></div>
                ) : isError || !event ? (
                    <EmptyState
                        title={locale === "id" ? "Acara tidak tersedia" : "Event unavailable"}
                        body={locale === "id" ? "Acara ini tidak ditemukan atau belum dipublikasikan. Kembali ke daftar acara untuk melihat kegiatan lainnya." : "This event could not be found or is not published. Return to all events to browse other activities."}
                        testId="event-detail-unavailable"
                    />
                ) : (
                    <EventCard key={event.id} event={event} detail />
                )}
            </section>
        </div>
    );
}
