// Public registration dialog: renders the admin-built form (including conditional
// fields and file upload), enforces explicit UU PDP consent, and posts multipart.

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Check, CheckCircle2, Copy, MessageCircle, X } from "lucide-react";
import { useLocale, pick } from "@/lib/i18n";
import type { LabEvent } from "@/lib/types";
import { useFocusTrap } from "@/lib/useFocusTrap";

function fieldKey(label: string): string {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `f_${slug || "field"}`;
}

interface SubmitResult {
    ok: boolean;
    status: string;
    message: string;
    whatsapp_group_url?: string;
}

export function RegistrationDialog({ event, onClose }: { event: LabEvent; onClose: () => void }) {
    const { locale, t } = useLocale();
    const isClosed = Boolean(
        event.registration_closed ||
        event.is_full ||
        event.reg_status === "full" ||
        event.reg_status === "closed" ||
        event.reg_status === "past"
    );
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<SubmitResult | null>(null);
    const [copiedWa, setCopiedWa] = useState(false);
    const [values, setValues] = useState<Record<string, string>>({});
    const dialogRef = useRef<HTMLDivElement>(null);

    useFocusTrap(true, dialogRef, { onEscape: onClose });

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = previousOverflow; };
    }, []);

    const handleCopyWa = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            setCopiedWa(true);
            toast.success("Tautan grup WhatsApp berhasil disalin!");
            setTimeout(() => setCopiedWa(false), 2000);
        } catch {
            toast.error("Gagal menyalin tautan.");
        }
    };
    const [errors, setErrors] = useState<string[]>([]);

    const fields = useMemo(() => event.form_fields ?? [], [event.form_fields]);

    const visible = fields.filter((f) => {
        if (!f.show_if_field) return true;
        return values[fieldKey(f.show_if_field)] === f.show_if_value;
    });

    // Backend validation reports missing fields as "Label: This field is required".
    // Map those back onto the individual controls so screen readers get field-level
    // errors instead of only a detached summary.
    const fieldError = (label: string) => {
        const prefix = `${label}:`;
        const match = errors.find((error) => error.startsWith(prefix));
        return match ? match.slice(prefix.length) : undefined;
    };
    const consentError = errors.find((error) => /consent|persetujuan/i.test(error));

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setErrors([]);
        const form = e.currentTarget;
        const data = new FormData(form);
        // Drop hidden conditional fields so the backend never sees stale answers.
        for (const f of fields) {
            if (!visible.includes(f)) data.delete(fieldKey(f.label));
        }
        setSubmitting(true);
        try {
            const res = await fetch(`/api/registrations/${event.id}`, { method: "POST", body: data });
            const body = (await res.json().catch(() => null)) as
                | SubmitResult
                | { detail?: string | { message?: string; missing?: string[]; errors?: string[] } }
                | null;
            if (!res.ok) {
                const detail = (body as { detail?: unknown })?.detail;
                if (typeof detail === "string") {
                    setErrors([detail]);
                    toast.error(detail);
                } else if (detail && typeof detail === "object") {
                    const d = detail as { message?: string; missing?: string[]; errors?: string[] };
                    const list = [
                        ...(d.missing ?? []).map((m) => `${m}: ${t("required_field")}`),
                        ...(d.errors ?? []),
                    ];
                    setErrors(list.length ? list : [d.message ?? t("no_backend_note")]);
                    toast.error(d.message ?? t("required_field"));
                } else {
                    setErrors([t("no_backend_note")]);
                    toast.error(t("no_backend_note"));
                }
                return;
            }
            setResult(body as SubmitResult);
            toast.success((body as SubmitResult).message);
        } catch {
            setErrors([t("no_backend_note")]);
            toast.error(t("no_backend_note"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            ref={dialogRef}
            tabIndex={-1}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="registration-dialog-title"
            data-testid="registration-dialog"
        >
            <div
                className="absolute inset-0 backdrop-blur-sm animate-fade-in"
                style={{ background: "color-mix(in srgb, var(--gsm-obsidian) 60%, transparent)" }}
                onClick={onClose}
                aria-hidden="true"
            />
            <div className="tnl-card relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto p-0 animate-pop">
                <div className="tnl-hero-gradient sticky top-0 z-10 flex items-start justify-between gap-4 px-7 py-5">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--tnl-tan)" }}>
                            {t("register_title")}
                        </p>
                        <h2 id="registration-dialog-title" className="tnl-h5 mt-1 text-[19px] text-[var(--tnl-inverse-foreground)]">
                            {pick(locale, event.title, event.title_id)}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
                        aria-label={t("close")}
                        data-testid="registration-close-button"
                    >
                        <X className="h-4 w-4 text-white" />
                    </button>
                </div>

                {result ? (
                    <div className="px-7 py-10 text-center space-y-6" data-testid="registration-success">
                        <CheckCircle2 className="mx-auto h-12 w-12" style={{ color: "var(--tnl-green)" }} aria-hidden="true" />
                        <div>
                            <h3 className="tnl-h5 mt-2 text-[20px]">
                                {result.status === "waitlisted" ? t("waitlisted_title") : t("registration_received")}
                            </h3>
                            <p className="mt-2 text-sm text-[var(--tnl-body)]">{result.message}</p>
                        </div>

                        {result.whatsapp_group_url ? (
                            <div
                                className="rounded-xl border border-[var(--gsm-emerald)] bg-[var(--gsm-bg-elevated)] p-5 text-left max-w-md mx-auto space-y-3"
                                data-testid="registration-wa-group-card"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--gsm-primary)] text-white shadow-sm">
                                        <MessageCircle className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-[var(--gsm-emerald)]">
                                            {locale === "id"
                                                ? "Langkah Terakhir: Gabung Grup WhatsApp Peserta"
                                                : "Final Step: Join the Participant WhatsApp Group"}
                                        </h4>
                                        <p className="mt-1 text-xs text-[var(--gsm-text-secondary)] leading-relaxed">
                                            {locale === "id"
                                                ? "Seluruh pengumuman jadwal, ruang praktikum, dan panduan teknis akan dibagikan melalui grup resmi peserta."
                                                : "All schedule updates, room instructions, and technical guides will be shared in the official participant group."}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                                    <a
                                        href={result.whatsapp_group_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--gsm-primary)] hover:opacity-90 text-white px-4 py-2.5 text-xs font-bold transition-colors shadow-sm"
                                        data-testid="registration-wa-group-join-button"
                                    >
                                        <span>{locale === "id" ? "Gabung Grup WhatsApp Sekarang ↗" : "Join WhatsApp Group Now ↗"}</span>
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyWa(result.whatsapp_group_url!)}
                                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--gsm-emerald)] bg-[var(--gsm-bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--gsm-emerald)] hover:opacity-90 transition-colors"
                                        data-testid="registration-wa-group-copy-button"
                                    >
                                        {copiedWa ? (
                                            <>
                                                <Check className="h-3.5 w-3.5 text-[var(--gsm-emerald)]" />
                                                <span>{locale === "id" ? "Tersalin!" : "Copied!"}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="h-3.5 w-3.5" />
                                                <span>{locale === "id" ? "Salin Tautan Grup" : "Copy Group Link"}</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        <div>
                            <button type="button" onClick={onClose} className="tnl-btn tnl-btn-primary" data-testid="registration-done-button">
                                {t("close")}
                            </button>
                        </div>
                    </div>
                ) : isClosed ? (
                    <div className="px-7 py-10 text-center space-y-4" data-testid="registration-closed-dialog">
                        <p className="text-base font-semibold text-red-600 dark:text-red-400">
                            {event.is_full || event.reg_status === "full"
                                ? (locale === "id" ? "Kuota pendaftaran untuk acara ini sudah penuh." : "Registration for this event is full.")
                                : (locale === "id" ? "Pendaftaran untuk acara ini sedang ditutup." : "Registration for this event is closed.")}
                        </p>
                        <p className="text-xs text-[var(--tnl-body)]">
                            {locale === "id"
                                ? "Silakan pantau pengumuman lebih lanjut melalui media sosial atau hubungi kontak kami."
                                : "Please check our announcements or contact us for further info."}
                        </p>
                        <button type="button" onClick={onClose} className="tnl-btn tnl-btn-outline" data-testid="registration-close-dialog-btn">
                            {t("close")}
                        </button>
                    </div>
                ) : (
                    <form onSubmit={onSubmit} className="space-y-4 px-7 py-6" noValidate data-testid="registration-form">
                        {/* Honeypot */}
                        <div className="hidden" aria-hidden="true">
                            <input name="company_website" type="text" tabIndex={-1} autoComplete="off" />
                        </div>

                        {errors.length ? (
                            <div
                                className="rounded-[6px] border px-4 py-3 text-sm"
                                style={{ borderColor: "var(--tnl-danger)", color: "var(--tnl-danger)" }}
                                role="alert"
                                data-testid="registration-errors"
                            >
                                <ul className="list-disc pl-4">
                                    {errors.map((err, i) => (
                                        <li key={i}>{err}</li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}

                        {visible.map((f) => {
                            const key = fieldKey(f.label);
                            const id = `reg-${key}`;
                            const errorId = `${id}-error`;
                            const testId = `registration-field-${key}`;
                            const error = fieldError(f.label);
                            const invalidProps = {
                                "aria-invalid": Boolean(error),
                                "aria-describedby": error ? errorId : undefined,
                            };
                            return (
                                <div key={key}>
                                    <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
                                        {f.label}
                                        {f.required ? <span style={{ color: "var(--tnl-danger)" }}> *</span> : null}
                                    </label>
                                    {f.type === "select" ? (
                                        <select
                                            id={id}
                                            name={key}
                                            className="tnl-field"
                                            required={f.required}
                                            value={values[key] ?? ""}
                                            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                                            {...invalidProps}
                                            data-testid={testId}
                                        >
                                            <option value="">—</option>
                                            {f.options.map((opt) => (
                                                <option key={opt} value={opt}>
                                                    {opt}
                                                </option>
                                            ))}
                                        </select>
                                    ) : f.type === "textarea" ? (
                                        <textarea
                                            id={id}
                                            name={key}
                                            className="tnl-field"
                                            rows={4}
                                            required={f.required}
                                            value={values[key] ?? ""}
                                            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                                            {...invalidProps}
                                            data-testid={testId}
                                        />
                                    ) : f.type === "file" ? (
                                        <input id={id} name={key} type="file" className="tnl-field pt-3" required={f.required} {...invalidProps} data-testid={testId} />
                                    ) : f.type === "checkbox" ? (
                                        <input
                                            id={id}
                                            name={key}
                                            type="checkbox"
                                            className="h-5 w-5"
                                            required={f.required}
                                            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.checked ? "yes" : "" }))}
                                            {...invalidProps}
                                            data-testid={testId}
                                        />
                                    ) : (
                                        <input
                                            id={id}
                                            name={key}
                                            type={f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"}
                                            className="tnl-field"
                                            required={f.required}
                                            value={values[key] ?? ""}
                                            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                                            {...invalidProps}
                                            data-testid={testId}
                                        />
                                    )}
                                    {error ? (
                                        <p id={errorId} role="alert" className="mt-1 text-xs" style={{ color: "var(--tnl-danger)" }}>
                                            {error}
                                        </p>
                                    ) : null}
                                </div>
                            );
                        })}

                        <div className="rounded-[6px] border p-4" style={{ borderColor: "var(--tnl-border)", background: "var(--tnl-surface)" }}>
                            <label className="flex min-h-[44px] items-start gap-3 text-sm">
                                <input
                                    type="checkbox"
                                    name="consent"
                                    value="1"
                                    required
                                    className="mt-2 h-5 w-5 shrink-0"
                                    aria-invalid={Boolean(consentError)}
                                    aria-describedby={consentError ? "reg-consent-error" : undefined}
                                    data-testid="registration-consent-checkbox"
                                />
                                <span className="py-1">
                                    <span className="font-medium">{t("consent_label")}</span>
                                    <span className="mt-1 block text-xs" style={{ color: "var(--tnl-body)" }}>
                                        {t("consent_detail")}
                                    </span>
                                </span>
                            </label>
                            {consentError ? (
                                <p id="reg-consent-error" role="alert" className="mt-1 text-xs" style={{ color: "var(--tnl-danger)" }}>
                                    {consentError}
                                </p>
                            ) : null}
                        </div>

                        <button type="submit" className="tnl-btn tnl-btn-primary w-full" disabled={submitting} data-testid="registration-submit-button">
                            {submitting ? t("submitting") : t("submit_registration")}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
