import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path
        d="M9 21c0-6 4.5-11 13-12-.5 8-5 13-11 13"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="11" cy="22" r="2.2" fill="var(--primary-foreground)" />
    </svg>
  );
}

export function Brand({
  href = "/",
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-0 items-center gap-2 font-heading text-h4",
        className,
      )}
    >
      <BrandMark className="shrink-0" />
      {/*
       * The mark holds its size and the wordmark gives way: every header this
       * sits in is a fixed-height row competing with a cluster of controls, so
       * the two lines clip with an ellipsis instead of wrapping (which would
       * outgrow a 56px bar) or refusing to shrink (which scrolled the page
       * sideways at 360px).
       */}
      <span className="min-w-0 leading-tight">
        <span className="block truncate">Plant-Meat</span>
        <span className="block truncate text-caption font-normal text-muted-foreground">
          Virtual Formulator
        </span>
      </span>
    </Link>
  );
}
