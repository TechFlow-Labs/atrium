import { cn } from "@/lib/utils";

/** Courtyard arch mark. Uses currentColor so it follows light and dark chrome. */
export function AtriumMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7 shrink-0", className)} aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M5 5.5h22a1.5 1.5 0 0 1 1.5 1.5v19A1.5 1.5 0 0 1 27 27.5H5A1.5 1.5 0 0 1 3.5 26V7A1.5 1.5 0 0 1 5 5.5Zm4.2 8.1a6.8 6.8 0 0 1 13.6 0V24h-3.2v-9.6a3.6 3.6 0 0 0-7.2 0V24H9.2V13.6Z"
      />
    </svg>
  );
}

export function AtriumLogo({
  wordmark = true,
  className,
  markClassName,
  wordClassName,
}: {
  wordmark?: boolean;
  className?: string;
  markClassName?: string;
  wordClassName?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <AtriumMark className={markClassName} />
      {wordmark ? (
        <span className={cn("serif truncate text-2xl leading-none", wordClassName)}>Atrium</span>
      ) : null}
    </span>
  );
}
