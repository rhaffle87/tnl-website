// Block-driven public pages. Each reads its page record from the CMS and renders
// the authored blocks; static chrome renders even when the fetch fails.

import { usePage } from "@/lib/hooks";
import { useLocale } from "@/lib/i18n";
import { BlockRenderer } from "@/components/site/Blocks";
import { EmptyState, Spinner } from "@/components/site/Primitives";

export function CmsPage({ slug, testId }: { slug: string; testId: string }) {
    const { t } = useLocale();
    const { data: page, isLoading, isError } = usePage(slug);

    if (isLoading) {
        return (
            <div className="tnl-container tnl-section" data-testid={`${testId}-loading`}>
                <Spinner label={t("loading")} />
            </div>
        );
    }

    if (isError || !page) {
        return (
            <div className="tnl-container tnl-section" data-testid={`${testId}-empty`}>
                <EmptyState title={t("coming_soon")} body={t("coming_soon_body")} testId={`${testId}-empty-state`} />
            </div>
        );
    }

    return (
        <div data-testid={testId}>
            <BlockRenderer blocks={page.blocks ?? []} />
        </div>
    );
}

export default function Home() {
    return <CmsPage slug="home" testId="home-page" />;
}
