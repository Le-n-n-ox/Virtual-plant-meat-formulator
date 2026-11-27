/*
 * Touch targets for the navigation chrome
 * ---------------------------------------
 * Guide §9 commits to WCAG 2.2 AA target size. Success criterion 2.5.8 asks for
 * 24x24 CSS px as the floor; this is the comfortable 44x44 the guide aims for,
 * which is what a finger actually hits on a 360 px phone. Below `lg` every
 * navigation control is touch-first — that is exactly the range where the
 * sidebar is a sheet rather than a column — so the minimum applies there and
 * stops at `lg`, where the chrome is mouse-driven and was not broken.
 *
 * It is written as minimums rather than a fixed `size-11` on purpose: a control
 * keeps the visual size it was designed with (a ghost icon button still shows a
 * 16 px glyph, a nav row still shows one line of `text-small`) and only its hit
 * area grows. Padding would work for a single control but not for one whose
 * height comes from a `size` variant, and `min-h`/`min-w` wins over both.
 */
export const TOUCH_TARGET = "min-h-11 min-w-11 lg:min-h-0 lg:min-w-0";

/**
 * The same floor for a full-width row — a nav link in the sheet, a link in the
 * landing page's menu — where the width is already far past 44 px and only the
 * height needs raising.
 */
export const TOUCH_ROW = "min-h-11 lg:min-h-0";
