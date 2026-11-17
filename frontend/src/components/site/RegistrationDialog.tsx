// Public registration dialog: renders the admin-built form (including conditional
// fields and file upload), enforces explicit UU PDP consent, and posts multipart.

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CheckCircle2, X } from "lucide-react";
import { useLocale, pick } from "@/lib/i18n";
import type { LabEvent } from "@/lib/types";

function fieldKey(label: string): string {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `f_${slug || "field"}`;
}

interface SubmitResult {
    ok: boolean;
    status: string;
    message: string;
}

export function RegistrationDialog({ event, onClose }: { event: LabEvent; onClose: () => void }) {
    const { locale, t } = useLocale();
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<SubmitResult | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<string[]>([]);

    const fields = useMemo(() => event.form_fields ?? [], [event.form_fields]);

    const visible = fields.filter((f) => {
        if (!f.show_if_field) return true;
        return values[fieldKey(f.show_if_field)] === f.show_if_value;
    });

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
            className="fixed inset-0 z-[110] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="registration-dialog-title"
            data-testid="registration-dialog"
        >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} aria-hidden="true" />
            <div className="tnl-card relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto p-0 animate-pop">
                <div className="tnl-hero-gradient sticky top-0 z-10 flex items-start justify-between gap-4 px-7 py-5">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--tnl-tan)" }}>
                            {t("register_title")}
                        </p>
                        <h2 id="registration-dialog-title" className="tnl-h5 mt-1 text-[19px]" style={{ color: "#ffffff" }}>
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
                    <div className="px-7 py-10 text-center" data-testid="registration-success">
                        <CheckCircle2 className="mx-auto h-12 w-12" style={{ color: "var(--tnl-green)" }} aria-hidden="true" />
                        <h3 className="tnl-h5 mt-4 text-[20px]">
                            {result.status === "waitlisted" ? t("waitlisted_title") : t("registration_received")}
                        </h3>
                        <p className="mt-2 text-sm text-[var(--tnl-body)]">{result.message}</p>
                        <button type="button" onClick={onClose} className="tnl-btn tnl-btn-primary mt-6" data-testid="registration-done-button">
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
                                style={{ borderColor: "#b91c1c", color: "#b91c1c" }}
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
                            const testId = `registration-field-${key}`;
                            return (
                                <div key={key}>
                                    <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
                                        {f.label}
                                        {f.required ? <span style={{ color: "#b91c1c" }}> *</span> : null}
                                    </label>
                                    {f.type === "select" ? (
                                        <select
                                            id={id}
                                            name={key}
                                            className="tnl-field"
                                            required={f.required}
                                            value={values[key] ?? ""}
                                            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
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
                                            data-testid={testId}
                                        />
                                    ) : f.type === "file" ? (
                                        <input id={id} name={key} type="file" className="tnl-field pt-3" required={f.required} data-testid={testId} />
                                    ) : f.type === "checkbox" ? (
                                        <input
                                            id={id}
                                            name={key}
                                            type="checkbox"
                                            className="h-5 w-5"
                                            required={f.required}
                                            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.checked ? "yes" : "" }))}
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
                                            data-testid={testId}
                                        />
                                    )}
                                </div>
                            );
                        })}

                        <div className="rounded-[6px] border p-4" style={{ borderColor: "var(--tnl-border)", background: "var(--tnl-surface)" }}>
                            <label className="flex items-start gap-3 text-sm">
                                <input type="checkbox" name="consent" value="1" required className="mt-1 h-4 w-4 shrink-0" data-testid="registration-consent-checkbox" />
                                <span>
                                    <span className="font-medium">{t("consent_label")}</span>
                                    <span className="mt-1 block text-xs" style={{ color: "var(--tnl-body)" }}>
                                        {t("consent_detail")}
                                    </span>
                                </span>
                            </label>
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
