import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/*
 * Card surfaces
 * -------------
 * `variant` names the four surfaces the app actually needs, so a call site
 * stops spelling a one-off background or shadow in `className` where the next
 * card along cannot see it and drifts from it. Only the surface moves: the
 * geometry (radius, spacing, image corners, footer rules) stays in the base so
 * every variant keeps the same shape and the same `--card-spacing` contract.
 *
 * "default" holds exactly the classes the card carried before variants existed
 * — `bg-card` plus the hairline `ring-1 ring-foreground/10` — because no
 * existing usage passes a variant and all of them are drawn against it.
 *
 * Only "elevated" lightens its surface, and only in the dark themes: in the
 * three light themes `--card` is already the lightest surface a theme defines
 * (Lab's is pure white), so there is nothing to lift towards and the shadow has
 * to carry the elevation on its own. In the dark themes that shadow is close to
 * invisible against a dark page, so a few percent of `--foreground` mixed into
 * `--card` does the work instead. "outline" has no surface at all, which is
 * safe for text because every theme sets `--card-foreground` equal to
 * `--foreground`, so the contents read against the page exactly as body copy
 * does.
 */
const cardVariants = cva(
  "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl py-(--card-spacing) text-small text-card-foreground [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
  {
    variants: {
      variant: {
        default: "bg-card ring-1 ring-foreground/10",
        elevated:
          "bg-card shadow-sm ring-1 ring-foreground/10 dark:bg-[color-mix(in_oklch,var(--card),var(--foreground)_5%)]",
        muted: "bg-muted/40",
        outline: "ring-1 ring-foreground/10",
      },
      /*
       * For a card that is the whole hit area of a link or a button, rather
       * than a panel that happens to sit next to one.
       *
       * Both the card's own state and its ancestor's are styled because the
       * card is a div and cannot be the link: the house pattern wraps it in a
       * `group` Link, which is the element that takes focus, so without the
       * `group-*` half a keyboard user would get no indicator at all.
       *
       * That indicator is a solid `--ring` and not the `ring-ring/50` wash used
       * elsewhere, because at 50% alpha it measures under 3:1 against the card
       * in five of the six themes. A solid `focus-visible:border-ring` is the
       * house style for this, but the card draws its edge as a ring and giving
       * the base a border would add a pixel to the geometry of every card
       * already shipped, so the same solid colour goes on the ring instead.
       */
      interactive: {
        true: "cursor-pointer transition-[translate,box-shadow] hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring group-hover:-translate-y-0.5 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      interactive: false,
    },
  },
);

function Card({
  className,
  size = "default",
  variant = "default",
  interactive = false,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof cardVariants> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(cardVariants({ variant, interactive }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-h4 group-data-[size=sm]/card:text-small",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-small text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  cardVariants,
};
