// Contact form with honeypot; messages land in the admin inbox (Jev triages them).

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
    const { t, locale } = useLocale();
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
            next.consent =
                locale === "id"
                    ? "Persetujuan UU PDP No. 27/2022 wajib dicentang."
                    : "You must consent to data processing under PDP Law No. 27/2022.";
        }
        setErrors(next);
        if (Object.keys(next).length) return;

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
                        <label htmlFor="contact-name" className="mb-1.5 block text-sm font-medium">
                            {t("your_name")}
                        </label>
                        <input id="contact-name" name="name" type="text" className="tnl-field" required data-testid="contact-name-input" />
                        {errors.name ? (
                            <p className="mt-1 text-xs" style={{ color: "#b91c1c" }} data-testid="contact-name-error">
                                {errors.name}
                            </p>
                        ) : null}
                    </div>

                    <div>
                        <label htmlFor="contact-email" className="mb-1.5 block text-sm font-medium">
                            {t("your_email")}
                        </label>
                        <input id="contact-email" name="email" type="email" className="tnl-field" required data-testid="contact-email-input" />
                        {errors.email ? (
                            <p className="mt-1 text-xs" style={{ color: "#b91c1c" }} data-testid="contact-email-error">
                                {errors.email}
                            </p>
                        ) : null}
                    </div>

                    <div>
                        <label htmlFor="contact-subject" className="mb-1.5 block text-sm font-medium">
                            {t("subject")}
                        </label>
                        <input id="contact-subject" name="subject" type="text" className="tnl-field" required data-testid="contact-subject-input" />
                        {errors.subject ? (
                            <p className="mt-1 text-xs" style={{ color: "#b91c1c" }} data-testid="contact-subject-error">
                                {errors.subject}
                            </p>
                        ) : null}
                    </div>

                    <div>
                        <label htmlFor="contact-message" className="mb-1.5 block text-sm font-medium">
                            {t("message")}
                        </label>
                        <textarea id="contact-message" name="message" className="tnl-field" rows={5} required data-testid="contact-message-input" />
                        {errors.message ? (
                            <p className="mt-1 text-xs" style={{ color: "#b91c1c" }} data-testid="contact-message-error">
                                {errors.message}
                            </p>
                        ) : null}
                    </div>

                    <div className="rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-3 text-xs">
                        <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                name="consent"
                                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#5D8A6B] focus:ring-[#5D8A6B]"
                                data-testid="contact-form-consent"
                            />
                            <span className="text-[var(--tnl-body)]">
                                Saya menyetujui pemrosesan data sesuai ketentuan UU PDP No. 27/2022 dan{" "}
                                <Link to="/privacy" className="underline text-[#5D8A6B] dark:text-[#8AB597]">
                                    Kebijakan Privasi
                                </Link>
                                .
                            </span>
                        </label>
                        {errors.consent ? (
                            <p className="mt-1.5 text-xs text-rose-500 font-medium pl-6">{errors.consent}</p>
                        ) : null}
                    </div>

                    <button type="submit" className="tnl-btn tnl-btn-primary w-full" disabled={sending} data-testid="contact-submit-button">
                        {sending ? t("sending") : t("send_message")}
                        {!sending ? <Send className="h-4 w-4" aria-hidden="true" /> : null}
                    </button>
                </form>
            </div>
        </section>
    );
}
