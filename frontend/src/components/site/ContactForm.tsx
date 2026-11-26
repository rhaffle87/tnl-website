// Contact form with honeypot; messages land in the admin inbox (local advisor triages them).

import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { apiPost } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { SectionHeading } from "@/components/site/Primitives";

interface ContactResponse {
    ok: boolean;
    message: string;
}

export function ContactForm() {
    const { t } = useLocale();
    const [sending, setSending] = useState(false);
    const [done, setDone] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        const payload = {
            name: String(data.get("name") ?? "").trim(),
            email: String(data.get("email") ?? "").trim(),
            subject: String(data.get("subject") ?? "").trim(),
            message: String(data.get("message") ?? "").trim(),
            company_website: String(data.get("company_website") ?? ""),
        };
        const next: Record<string, string> = {};
        if (!payload.name) next.name = t("required_field");
        if (!payload.email) next.email = t("required_field");
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) next.email = t("invalid_email");
        if (!payload.subject) next.subject = t("required_field");
        if (!payload.message) next.message = t("required_field");
        const consent = data.get("consent");
        if (!consent) {
            next.consent = t("contact_consent_required");
        }
        setErrors(next);
        if (Object.keys(next).length) {
            const firstInvalid = (["name", "email", "subject", "message", "consent"] as const)
                .find((key) => next[key]);
            if (firstInvalid) {
                form.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
            }
            return;
        }

        setSending(true);
        try {
            const res = await apiPost<ContactResponse>("/contact", payload);
            setDone(true);
            toast.success(res.message || t("message_sent"));
            form.reset();
        } catch (err) {
            const message =
                err instanceof ApiError && typeof (err.body as { detail?: string })?.detail === "string"
                    ? (err.body as { detail: string }).detail
                    : t("no_backend_note");
            toast.error(message);
        } finally {
            setSending(false);
        }
    };

    return (
        <section className="tnl-section pt-0" data-testid="block-contact-form">
            <div className="tnl-container max-w-2xl">
                <SectionHeading title={t("send_message")} testId="contact-form-heading" />
                {done ? (
                    <div
                        className="tnl-card p-8 text-center"
                        style={{ borderColor: "var(--tnl-green)" }}
                        data-testid="contact-form-success"
                    >
                        <p className="text-[17px] font-bold">{t("message_sent")}</p>
                    </div>
                ) : null}
                <form onSubmit={onSubmit} className="tnl-card mt-4 space-y-4 p-6 sm:p-8" noValidate data-testid="contact-form">
                    {/* Honeypot: real people never fill this. */}
                    <div className="hidden" aria-hidden="true">
                        <label htmlFor="company_website">Company website</label>
                        <input id="company_website" name="company_website" type="text" tabIndex={-1} autoComplete="off" />
                    </div>

                    <div>
                        <label htmlFor="contact-name" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--tnl-heading)]">
                            {t("your_name")} <span style={{ color: "var(--tnl-danger)" }}>*</span>
                        </label>
                        <input
                            id="contact-name"
                            name="name"
                            type="text"
                            className="tnl-input min-h-[44px]"
                            required
                            aria-invalid={Boolean(errors.name)}
                            aria-describedby={errors.name ? "contact-name-error" : undefined}
                            data-testid="contact-name-input"
                        />
                        {errors.name ? (
                            <p
                                id="contact-name-error"
                                role="alert"
                                className="mt-1 text-xs font-medium"
                                style={{ color: "var(--tnl-danger)" }}
                                data-testid="contact-name-error"
                            >
                                {errors.name}
                            </p>
                        ) : null}
                    </div>

                    <div>
                        <label htmlFor="contact-email" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--tnl-heading)]">
                            {t("your_email")} <span style={{ color: "var(--tnl-danger)" }}>*</span>
                        </label>
                        <input
                            id="contact-email"
                            name="email"
                            type="email"
                            className="tnl-input min-h-[44px]"
                            required
                            aria-invalid={Boolean(errors.email)}
                            aria-describedby={errors.email ? "contact-email-error" : undefined}
                            data-testid="contact-email-input"
                        />
                        {errors.email ? (
                            <p
                                id="contact-email-error"
                                role="alert"
                                className="mt-1 text-xs font-medium"
                                style={{ color: "var(--tnl-danger)" }}
                                data-testid="contact-email-error"
                            >
                                {errors.email}
                            </p>
                        ) : null}
                    </div>

                    <div>
                        <label htmlFor="contact-subject" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--tnl-heading)]">
                            {t("subject")} <span style={{ color: "var(--tnl-danger)" }}>*</span>
                        </label>
                        <input
                            id="contact-subject"
                            name="subject"
                            type="text"
                            className="tnl-input min-h-[44px]"
                            required
                            aria-invalid={Boolean(errors.subject)}
                            aria-describedby={errors.subject ? "contact-subject-error" : undefined}
                            data-testid="contact-subject-input"
                        />
                        {errors.subject ? (
                            <p
                                id="contact-subject-error"
                                role="alert"
                                className="mt-1 text-xs font-medium"
                                style={{ color: "var(--tnl-danger)" }}
                                data-testid="contact-subject-error"
                            >
                                {errors.subject}
                            </p>
                        ) : null}
                    </div>

                    <div>
                        <label htmlFor="contact-message" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--tnl-heading)]">
                            {t("message")} <span style={{ color: "var(--tnl-danger)" }}>*</span>
                        </label>
                        <textarea
                            id="contact-message"
                            name="message"
                            className="tnl-input min-h-[44px]"
                            rows={5}
                            required
                            aria-invalid={Boolean(errors.message)}
                            aria-describedby={errors.message ? "contact-message-error" : undefined}
                            data-testid="contact-message-input"
                        />
                        {errors.message ? (
                            <p
                                id="contact-message-error"
                                role="alert"
                                className="mt-1 text-xs font-medium"
                                style={{ color: "var(--tnl-danger)" }}
                                data-testid="contact-message-error"
                            >
                                {errors.message}
                            </p>
                        ) : null}
                    </div>

                    <div className="rounded-xl border border-[var(--tnl-inverse-border)] bg-[var(--tnl-surface-2)] p-4 text-xs">
                        <label className="flex min-h-[44px] items-start gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                name="consent"
                                className="mt-2 h-5 w-5 shrink-0 rounded border-[var(--gsm-border-input)] text-[var(--gsm-primary)] focus:ring-[var(--gsm-primary)]"
                                aria-invalid={Boolean(errors.consent)}
                                aria-describedby={errors.consent ? "contact-consent-error" : undefined}
                                data-testid="contact-form-consent"
                            />
                            <span className="py-2 text-xs leading-relaxed text-[var(--tnl-body)]">
                                {t("contact_consent_label")}{" "}
                                <Link
                                    to="/privacy"
                                    className="font-semibold underline text-[var(--gsm-primary)] hover:opacity-80"
                                >
                                    {t("contact_privacy_link")}
                                </Link>
                                .
                            </span>
                        </label>
                        {errors.consent ? (
                            <p
                                id="contact-consent-error"
                                role="alert"
                                className="mt-1.5 text-xs font-medium pl-6"
                                style={{ color: "var(--tnl-danger)" }}
                                data-testid="contact-consent-error"
                            >
                                {errors.consent}
                            </p>
                        ) : null}
                    </div>

                    <button
                        type="submit"
                        className="w-full min-h-[48px] rounded-[10px] bg-[var(--gsm-primary)] hover:opacity-90 text-white dark:bg-[var(--gsm-accent)] dark:hover:bg-[var(--gsm-accent-hover)] dark:text-[var(--gsm-obsidian)] text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-all"
                        disabled={sending}
                        data-testid="contact-submit-button"
                    >
                        {sending ? t("sending") : t("send_message")}
                        {!sending ? <Send className="h-4 w-4" aria-hidden="true" /> : null}
                    </button>
                </form>
            </div>
        </section>
    );
}
