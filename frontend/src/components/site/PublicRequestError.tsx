export function PublicRequestError({
  onRetry,
  retrying = false,
  locale,
  testId,
  stale = false,
}: {
  onRetry: () => void;
  retrying?: boolean;
  locale: "en" | "id";
  testId: string;
  stale?: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-[var(--tnl-border)] bg-[var(--tnl-surface)] p-5 sm:flex-row sm:items-center sm:justify-between"
      data-testid={testId}
    >
      <p className="text-sm text-[var(--tnl-body)]">
        {stale
          ? locale === "id"
            ? "Pembaruan gagal. Konten terakhir yang tersedia masih ditampilkan."
            : "The update failed. The last available content is still shown."
          : locale === "id"
            ? "Konten tidak dapat dimuat. Periksa koneksi Anda lalu coba lagi."
            : "Content could not be loaded. Check your connection and try again."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="tnl-btn tnl-btn-outline min-h-[44px] shrink-0"
        data-testid={`${testId}-retry`}
      >
        {retrying
          ? locale === "id" ? "Mencoba..." : "Retrying..."
          : locale === "id" ? "Coba lagi" : "Try again"}
      </button>
    </div>
  );
}
