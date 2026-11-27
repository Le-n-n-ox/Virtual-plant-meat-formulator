import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubMatchMedia } from "./_matchMedia";

/**
 * Navigation below `lg`: the workspace sidebar as a sheet opened from the top
 * bar, the hit area of every control in both headers, and the landing page's
 * menu panel.
 *
 * jsdom has no layout, so nothing here can measure a pixel. What it can hold is
 * the contract the CSS is built from — which side of a row is allowed to give
 * up width and which is not, and that every navigation control carries the
 * 44px floor from `components/layout/touch-target.ts` (guide §9) rather than
 * the 28 to 32px the desktop chrome uses.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/ingredients",
}));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    user: {
      user_id: "usr_1",
      email: "lab@example.org",
      // Long on purpose: a display name is free text from the backend.
      display_name: "Oduor the Extremely Long Formulator Name",
      role: "formulator",
    },
    logout: vi.fn(),
  }),
}));

import { SiteHeader } from "@/components/landing/site-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

/** The widths the guide's mobile commitments are checked against. */
const PHONE = 390;

/** `TOUCH_TARGET`, as a control that is square below `lg` must carry it. */
const TOUCH_TARGET = ["min-h-11", "min-w-11", "lg:min-h-0", "lg:min-w-0"];
/** `TOUCH_ROW`, for a control whose width is already past 44px. */
const TOUCH_ROW = ["min-h-11", "lg:min-h-0"];

/**
 * `useIsMobile` decides between the fixed column and the sheet from
 * `window.innerWidth`, so a width is the one piece of layout a test must set.
 * jsdom defines it as a read-only accessor, hence the redefinition.
 */
function atWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

function renderWorkspaceChrome() {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <TopBar />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

const trigger = () => screen.getByRole("button", { name: "Toggle navigation" });

/*
 * The landing header highlights the section in view through an
 * IntersectionObserver, which jsdom does not implement. This stub keeps the
 * callback so a test can say "the reader is now at #crops".
 */
type ObservedEntry = Pick<IntersectionObserverEntry, "isIntersecting"> & {
  target: { id: string };
};
let notifyIntersection: ((entries: ObservedEntry[]) => void) | undefined;

class StubIntersectionObserver {
  constructor(callback: (entries: ObservedEntry[]) => void) {
    notifyIntersection = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  stubMatchMedia();
  atWidth(PHONE);
  notifyIntersection = undefined;
  vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  atWidth(1024);
});

describe("the workspace navigation sheet", () => {
  it("opens from the top bar and carries the whole nav", async () => {
    const user = userEvent.setup();
    renderWorkspaceChrome();

    // The sheet is the only nav below lg, so the trigger has to report whether
    // it is showing.
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();

    await user.click(trigger());

    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link")).toHaveLength(8);
    expect(
      screen.getByRole("navigation", { name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("gives every row and the sheet's own controls a 44px hit area", async () => {
    const user = userEvent.setup();
    renderWorkspaceChrome();

    expect(trigger()).toHaveClass(...TOUCH_TARGET);

    await user.click(trigger());
    const nav = await screen.findByRole("navigation", { name: "Main" });

    for (const link of within(nav).getAllByRole("link")) {
      expect(link).toHaveClass(...TOUCH_ROW);
    }
    expect(screen.getByRole("link", { name: "Settings" })).toHaveClass(
      ...TOUCH_ROW,
    );
    expect(
      screen.getByRole("button", { name: "Close navigation" }),
    ).toHaveClass(...TOUCH_TARGET);
  });

  it("keeps the open route marked while the sheet is the nav", async () => {
    const user = userEvent.setup();
    renderWorkspaceChrome();
    await user.click(trigger());

    expect(screen.getByRole("link", { name: "Ingredients" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      document.querySelector('[data-slot="sidebar-menu-button"][data-active]'),
    ).not.toBeNull();
  });

  it("closes from its own control, not only from the backdrop", async () => {
    const user = userEvent.setup();
    renderWorkspaceChrome();
    await user.click(trigger());

    await user.click(screen.getByRole("button", { name: "Close navigation" }));

    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  for (const width of [360, PHONE, 768]) {
    it(`is a sheet rather than a fixed column at ${width}px`, async () => {
      const user = userEvent.setup();
      atWidth(width);
      renderWorkspaceChrome();
      await user.click(trigger());

      expect(document.querySelector('[data-mobile="true"]')).not.toBeNull();
      // The fixed column's spacer is what reserves 16rem of the row; at a
      // tablet width it must not be there at all.
      expect(document.querySelector('[data-slot="sidebar-gap"]')).toBeNull();
    });
  }

  it("switches to the fixed column at the same width the CSS does", () => {
    atWidth(1280);
    renderWorkspaceChrome();

    // `useIsMobile` answers 1024, so the column's own breakpoint has to be lg
    // too. When it was shadcn's `md`, a 768px tablet rendered the column on the
    // server and the sheet after hydration.
    const column = document.querySelector('[data-slot="sidebar"][data-state]');
    expect(column).toHaveClass("lg:block");
    expect(column?.className).not.toContain("md:block");
    expect(document.querySelector('[data-slot="sidebar-gap"]')).not.toBeNull();
  });
});

describe("the workspace top bar", () => {
  it("lets the brand give up width and holds the controls at their size", () => {
    renderWorkspaceChrome();

    const brand = screen.getByRole("link", { name: /Plant-Meat/ });
    expect(brand).toHaveClass("min-w-0");

    const signOut = screen.getByRole("button", { name: "Sign out" });
    expect(signOut.parentElement).toHaveClass("shrink-0");
  });

  it("clips a long display name instead of widening the row", () => {
    renderWorkspaceChrome();

    const name = screen.getByText("Oduor the Extremely Long Formulator Name");
    expect(name).toHaveClass("truncate");
    expect(name.parentElement).toHaveClass("max-w-40");
  });

  it("raises every control in the bar to the touch floor", () => {
    renderWorkspaceChrome();

    for (const name of ["Toggle navigation", "Change colour theme", "Sign out"])
      expect(screen.getByRole("button", { name })).toHaveClass(...TOUCH_TARGET);
  });
});

describe("the landing page's menu", () => {
  it("toggles the panel from a 44px control", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);

    const menu = screen.getByRole("button", { name: "Toggle menu" });
    expect(menu).toHaveClass(...TOUCH_TARGET);
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();

    await user.click(menu);

    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("navigation", { name: "Mobile" }),
    ).toBeInTheDocument();
  });

  it("gives the panel's rows the touch floor and its own scroller", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);
    await user.click(screen.getByRole("button", { name: "Toggle menu" }));

    const panel = screen.getByRole("navigation", { name: "Mobile" });
    const rows = within(panel).getAllByRole("link");
    expect(rows).toHaveLength(7);
    for (const row of rows) expect(row).toHaveClass(...TOUCH_ROW);

    // The panel hangs off a sticky header, so it cannot ride the page's
    // scroller; on a landscape phone its last row would otherwise be stranded.
    expect(panel.firstElementChild).toHaveClass("overflow-y-auto");
  });

  it("carries the sign-in pair that the header drops below sm", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);
    await user.click(screen.getByRole("button", { name: "Toggle menu" }));

    const panel = screen.getByRole("navigation", { name: "Mobile" });
    const inPanel = within(panel).getByRole("link", {
      name: "Open workspace",
    });
    expect(inPanel).toHaveClass("w-full");

    // The copy in the header row is the one that steps aside on a phone, which
    // is what buys the brand enough width to render at 360px.
    const inRow = screen
      .getAllByRole("link", { name: "Open workspace" })
      .find((link) => link !== inPanel);
    expect(inRow).toHaveClass("hidden", "sm:inline-flex");
    expect(
      within(panel).getByRole("link", { name: "Sign in" }),
    ).toBeInTheDocument();
  });

  it("marks the section in view in the panel as well as the desktop nav", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);
    await user.click(screen.getByRole("button", { name: "Toggle menu" }));

    act(() =>
      notifyIntersection?.([{ isIntersecting: true, target: { id: "crops" } }]),
    );

    const panel = screen.getByRole("navigation", { name: "Mobile" });
    expect(within(panel).getByRole("link", { name: "Crops" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    const site = screen.getByRole("navigation", { name: "Site" });
    expect(within(site).getByRole("link", { name: "Crops" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
