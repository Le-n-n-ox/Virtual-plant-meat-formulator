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
        "flex items-center gap-2 font-semibold tracking-tight",
        className,
      )}
    >
      <BrandMark />
      <span className="leading-tight">
        Plant-Meat
        <span className="block text-[11px] font-normal text-muted-foreground">
          Virtual Formulator
        </span>
      </span>
    </Link>
  );
}
