import { createCn } from "cn/config";

/**
 * The type scale's names have to be declared here, or `cn()` deletes colours.
 *
 * `globals.css` defines the scale as Tailwind theme tokens (`--text-h1`,
 * `--text-small`, …), so `text-h1` and `text-small` are font-size utilities.
 * The merge engine cannot see the CSS: it only knows the default Tailwind
 * names, so an unrecognised `text-*` falls into the `text-color` group. That
 * made a size token and a colour token look like the same property, and the
 * later one silently won:
 *
 *     cn(buttonVariants(), "...")  →  "bg-primary text-small"
 *
 * with `text-primary-foreground` dropped. On the landing page's primary call
 * to action that left dark text on the primary fill — 3.16:1, a WCAG 2.2 AA
 * failure that the axe end-to-end gate caught. Adding a step to the scale in
 * `globals.css` means adding its name here too; `tests/cn.test.ts` fails if
 * the two drift apart.
 */
export const TYPE_SCALE_STEPS = [
  "display",
  "h1",
  "h2",
  "h3",
  "h4",
  "body",
  "small",
  "caption",
] as const;

export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: [...TYPE_SCALE_STEPS] }] } },
});
