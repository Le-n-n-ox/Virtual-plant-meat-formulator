import { expect, test, type Page } from "@playwright/test";

/**
 * The public landing page: links, layout at three widths, the 2D hero fallback
 * and reduced motion.
 *
 * Unlike the rest of the suite this spec has no `apiToken` guard, because
 * nothing it touches calls the backend: the landing page is static, `/login`
 * renders its form without a session, `/methodology` replaces its live model
 * table with a sign-in prompt when there is no token, and the guarded routes
 * redirect from the browser before any request is made. It therefore runs
 * signed out, which is the state a visitor arrives in. It still skips as a
 * whole when the app is not being served, so a run without a dev server
 * reports "skipped" rather than a wall of failures.
 *
 * FE-2 in the frontend guide (§13) is why the link walk exists: the footer used
 * to link to `/formulations/demo`, an id that never existed, and the fix was
 * "no link on the landing page leads to an error, checked by one Playwright
 * test that follows every landing-page link".
 */

/** Widths the page is designed against: small phone, tablet, desktop. */
const WIDTHS = [360, 768, 1440] as const;

/** Every band on the page, in order. Each one owns an id and one heading. */
const BANDS = [
  "hero",
  "stats",
  "how-it-works",
  "who-its-for",
  "principles",
  "event-flow",
  "crops",
  "provenance",
  "themes",
  "start",
] as const;

/**
 * Text that means a navigation ended somewhere broken. Next.js renders its own
 * copy both for a missing route and for a crashed client boundary, so matching
 * the words catches cases a status code alone would not.
 */
const ERROR_STATE =
  /application error|unhandled runtime error|this page could not be found|internal server error/i;

/**
 * Links that belong to the page, as opposed to anything the Next.js dev
 * overlay renders into its own portal next to it.
 */
const PAGE_LINKS =
  "header a[href], [role=navigation] a[href], main a[href], footer a[href]";

test.beforeAll(async ({ request, baseURL }) => {
  const reachable = await request
    .get(baseURL ?? "/")
    .then((response) => response.ok())
    .catch(() => false);
  test.skip(!reachable, `the app is not being served at ${baseURL}`);
});

/** Every `href` on the page, duplicates removed. */
async function hrefsOnPage(page: Page): Promise<string[]> {
  const hrefs = await page
    .locator(PAGE_LINKS)
    .evaluateAll((nodes) =>
      nodes.map((node) => (node.getAttribute("href") ?? "").trim()),
    );
  return [...new Set(hrefs)];
}

/**
 * Where a navigation actually ended. A guarded route redirects to sign-in from
 * the browser rather than the server, so its URL changes a moment after the
 * document loads and has to be waited for; a public route never changes and the
 * wait simply times out.
 */
async function endedAt(page: Page): Promise<string> {
  await page.waitForURL(/\/login/, { timeout: 3000 }).catch(() => {
    /* not a guarded route: the URL stayed where goto() put it */
  });
  return new URL(page.url()).pathname;
}

/** Scroll the page top to bottom, a screen at a time. */
async function scrollThroughPage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    window.scrollTo(0, document.body.scrollHeight);
  });
}

/**
 * Walk the page and assert every band's heading finishes revealing.
 *
 * `checkVisibility({ opacityProperty: true })` is the point of this check:
 * reveal-on-scroll starts each band at `opacity: 0`, and Playwright's own
 * visibility rules ignore opacity, so a band stranded mid-animation would still
 * look "visible" to `toBeVisible()`.
 */
async function expectEveryBandToReveal(page: Page): Promise<void> {
  for (const id of BANDS) {
    const heading = page.locator(`#${id}`).getByRole("heading").first();
    await heading.scrollIntoViewIfNeeded();
    await expect
      .poll(
        () =>
          heading.evaluate((el) =>
            el.checkVisibility({ opacityProperty: true }),
          ),
        { message: `the heading of section #${id} never finished revealing` },
      )
      .toBe(true);
  }
}

/**
 * Make the WebGL capability check in `scene/hooks/useSceneEnvironment` fail, so
 * the hero renders its 2D stand-in whatever the runner's GPU can do. Headless
 * Chromium has no GPU and falls back on its own, but a run started with
 * `--use-angle=swiftshader` would not, and this assertion is about the fallback.
 */
async function disableWebGL(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patched(
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      const [id] = args;
      if (id === "webgl" || id === "webgl2" || id === "experimental-webgl") {
        return null;
      }
      return original.apply(this, args);
    } as typeof original;
  });
}

test("every landing-page link resolves", async ({ page }) => {
  await page.goto("/");
  const hrefs = await hrefsOnPage(page);

  expect(
    hrefs,
    "the footer must not link to a formulation id again (guide FE-2)",
  ).not.toContain("/formulations/demo");
  expect(hrefs, "a placeholder href is not a real link").not.toContain("#");
  expect(hrefs, "an empty href is not a real link").not.toContain("");

  const anchors = hrefs.filter((href) => href.startsWith("#"));
  const internal = hrefs.filter((href) => href.startsWith("/"));
  const external = hrefs.filter((href) => href.startsWith("http"));

  // The header, the section nav and the footer all point into the page, so a
  // renamed section id would break several links at once.
  expect(
    anchors.length,
    "the page should have in-page anchors",
  ).toBeGreaterThan(4);
  for (const anchor of anchors) {
    await expect(
      page.locator(`[id="${anchor.slice(1)}"]`),
      `no section answers to ${anchor}`,
    ).toHaveCount(1);
  }

  expect(internal.length, "the page should link into the app").toBeGreaterThan(
    3,
  );
  for (const href of internal) {
    const response = await page.goto(href);
    expect(
      response?.status() ?? 0,
      `${href} answered ${response?.status()}`,
    ).toBeLessThan(400);
    // A guarded route sends a signed-out visitor to /login?next=…, which is a
    // successful navigation rather than an error state.
    const landed = await endedAt(page);
    expect([href, "/login"], `${href} ended at ${landed}`).toContain(landed);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_STATE);
  }

  // There are no off-site links today. If one is ever added it has to answer
  // too, rather than being a placeholder nobody followed.
  for (const href of external) {
    const response = await page.request.get(href);
    expect(
      response.status(),
      `${href} answered ${response.status()}`,
    ).toBeLessThan(400);
  }
});

/*
 * This was a known open failure at 360px: the site header's right-hand cluster
 * — theme switcher, "Open workspace", menu toggle — was wider than the header's
 * content box and pushed the document two pixels sideways on every page that
 * uses the header, /methodology included. It is fixed in
 * components/landing/site-header.tsx: the brand may shrink and truncates, the
 * cluster may not shrink, and below `sm` the sign-in pair moves out of the row
 * and into the menu panel. The bound stays strict — the requirement is no
 * sideways scroll at all, not a tolerance.
 */
for (const width of WIDTHS) {
  test(`no horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scrollThroughPage(page);

    const { scrollWidth, clientWidth, culprits } = await page.evaluate(() => {
      const root = document.scrollingElement as HTMLElement;
      const limit = root.clientWidth;
      /*
       * Name the region each offender sits in, so a failure says which file to
       * open rather than only which class names were too wide. Anything inside
       * a clipping ancestor — the crop marquee, the section nav's own scroller
       * — is skipped: it is wider than the viewport by design and cannot make
       * the document scroll.
       */
      const region = (el: Element): string => {
        if (el.closest("header")) return "site-header.tsx";
        if (el.closest("footer")) return "site-footer.tsx";
        const section = el.closest("section[id]");
        return section ? `section #${section.id}` : "page shell";
      };
      const clipped = (el: Element): boolean => {
        for (let node = el.parentElement; node; node = node.parentElement) {
          const { overflowX } = getComputedStyle(node);
          if (overflowX !== "visible") return true;
        }
        return false;
      };
      const over = [...document.querySelectorAll<HTMLElement>("body *")]
        .filter(
          (el) =>
            Math.round(el.getBoundingClientRect().right) > limit + 1 &&
            !clipped(el),
        )
        .slice(0, 5)
        .map((el) => {
          const right = Math.round(el.getBoundingClientRect().right);
          return `${region(el)} — ${el.tagName.toLowerCase()}.${el.className} right=${right}`;
        });
      return {
        scrollWidth: root.scrollWidth,
        clientWidth: limit,
        culprits: over,
      };
    });

    expect(
      scrollWidth,
      `the page scrolls sideways at ${width}px. Widest offenders:\n${culprits.join("\n")}`,
    ).toBeLessThanOrEqual(clientWidth);
  });
}

test("the hero stays legible when the 3D canvas falls back to 2D", async ({
  page,
}) => {
  await disableWebGL(page);
  await page.goto("/");

  await expect(
    page.locator("canvas"),
    "no WebGL canvas should be mounted without WebGL",
  ).toHaveCount(0);
  await expect(page.getByText("2D view", { exact: true })).toBeVisible();

  // The value proposition, both calls to action and the labelling rule all have
  // to survive the fallback, because it replaces the whole visual frame.
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  await expect(heading).toContainText(/traced to its source/i);
  await expect(
    page.getByRole("link", { name: /open the 3D workspace/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^read the methodology$/i }),
  ).toBeVisible();
  await expect(page.getByText("Illustrative visual")).toBeVisible();
  await expect(
    page.getByText(/not a physical, molecular or mechanical simulation/i),
  ).toBeVisible();

  // Legible also means on screen: the headline must not be clipped sideways.
  const box = await heading.boundingBox();
  const viewport = page.viewportSize();
  expect(box, "the headline should have a box").not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the page is readable and the decorative loops are stopped", async ({
    page,
  }) => {
    await page.goto("/");
    expect(
      await page.evaluate(
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
      "the browser should be reporting reduced motion",
    ).toBe(true);

    // The hero drops to the still 2D stand-in rather than a paused canvas.
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.getByText("2D view", { exact: true })).toBeVisible();

    // globals.css collapses every animation under reduced motion, so the
    // infinite crop marquee must not still be looping.
    const marqueeDuration = await page
      .locator(".animate-marquee")
      .evaluate((el) => getComputedStyle(el).animationDuration);
    expect(Number.parseFloat(marqueeDuration)).toBeLessThan(0.01);

    await expectEveryBandToReveal(page);
  });
});

test("reveal-on-scroll and the scroll-progress bar still work", async ({
  page,
}) => {
  await page.goto("/");
  const bar = page.locator(".scroll-progress");
  await expect(bar).toHaveCount(1);
  const atTop = await bar.evaluate((el) => getComputedStyle(el).transform);

  await scrollThroughPage(page);
  await expect
    .poll(() => bar.evaluate((el) => getComputedStyle(el).transform), {
      message: "the progress bar should grow as the page scrolls",
    })
    .not.toBe(atTop);

  await expectEveryBandToReveal(page);
});
