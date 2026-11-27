import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The workspace sidebar, built on the shadcn sidebar primitives: the trigger
 * and its Ctrl/Cmd+B shortcut, what the icon rail still exposes (landmarks,
 * labels, the active route, Settings last), and the collapse choice persisting
 * in the `sidebar_state` cookie that `SidebarProvider` owns.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/ingredients",
}));

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePreferencesStore } from "@/stores/preferencesStore";

const COOKIE = "sidebar_state";

function renderSidebar({ defaultOpen = true } = {}) {
  return render(
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
        <SidebarTrigger aria-label="Toggle navigation" />
        <input aria-label="Search" />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

const trigger = () => screen.getByRole("button", { name: "Toggle navigation" });

/** `data-state` on the sidebar container is the rendered collapse state. */
const sidebarState = () =>
  document
    .querySelector('[data-slot="sidebar"]')
    ?.closest("[data-state]")
    ?.getAttribute("data-state") ??
  document
    .querySelector("[data-state][data-collapsible]")
    ?.getAttribute("data-state");

function cookieValue(): string | undefined {
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${COOKIE}=`));
  return match?.split("=")[1];
}

beforeEach(() => {
  // jsdom has no matchMedia, and both the sidebar's mobile hook and the shared
  // reduced-motion hook query it. `matches: false` means desktop, motion on.
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: false,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  usePreferencesStore.setState({
    viewMode: "auto",
    motion: "system",
    aminoAcidUnit: "mg",
    energyUnit: "kcal",
    proteinUnit: "g_per_100g",
  });
  localStorage.clear();
  document.cookie = `${COOKIE}=; path=/; max-age=0`;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppSidebar collapse", () => {
  it("collapses and expands from the trigger", async () => {
    const user = userEvent.setup();
    renderSidebar();

    expect(sidebarState()).toBe("expanded");
    expect(trigger()).toHaveAttribute("aria-expanded", "true");

    await user.click(trigger());

    expect(sidebarState()).toBe("collapsed");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger());

    expect(sidebarState()).toBe("expanded");
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the landmarks, labels and active route reachable in both states", async () => {
    const user = userEvent.setup();
    renderSidebar();

    expect(
      screen.getByRole("navigation", { name: "Main" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ingredients" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Dashboard")).not.toHaveClass("sr-only");

    await user.click(trigger());

    // The rail shows icons only, so every label moves to assistive tech while
    // the links keep their names and the open route stays marked.
    expect(
      screen.getByRole("navigation", { name: "Main" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ingredients" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Dashboard")).toHaveClass("sr-only");

    const links = screen.getAllByRole("link");
    expect(links[links.length - 1]).toHaveAccessibleName("Settings");
  });

  it("marks the active route with isActive in both states", async () => {
    const user = userEvent.setup();
    renderSidebar();

    const active = () =>
      document.querySelector('[data-slot="sidebar-menu-button"][data-active]');
    expect(active()).not.toBeNull();

    await user.click(trigger());
    expect(active()).not.toBeNull();
  });

  it("carries the app's reduce-motion choice onto the animated subtree", () => {
    usePreferencesStore.setState({ motion: "reduce" });
    renderSidebar();
    expect(
      document.querySelector('[data-reduce-motion="true"]'),
    ).not.toBeNull();
  });

  it("leaves the subtree animated when motion is allowed", () => {
    usePreferencesStore.setState({ motion: "full" });
    renderSidebar();
    expect(document.querySelector('[data-reduce-motion="true"]')).toBeNull();
  });
});

describe("the Ctrl/Cmd+B shortcut", () => {
  it("toggles on Ctrl+B and on Cmd+B", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.keyboard("{Control>}b{/Control}");
    expect(sidebarState()).toBe("collapsed");

    await user.keyboard("{Meta>}b{/Meta}");
    expect(sidebarState()).toBe("expanded");
  });

  it("stays out of the way while the user is typing", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByLabelText("Search"));
    await user.keyboard("{Control>}b{/Control}");

    // Ctrl/Cmd+B means bold in a text field.
    expect(sidebarState()).toBe("expanded");
  });

  it("ignores a plain b and a modified chord", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.keyboard("b");
    expect(sidebarState()).toBe("expanded");

    await user.keyboard("{Control>}{Shift>}b{/Shift}{/Control}");
    expect(sidebarState()).toBe("expanded");

    await user.keyboard("{Control>}{Alt>}b{/Alt}{/Control}");
    expect(sidebarState()).toBe("expanded");
  });
});

describe("the persisted choice", () => {
  it("is written to the sidebar_state cookie", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(trigger());
    expect(cookieValue()).toBe("false");

    await user.click(trigger());
    expect(cookieValue()).toBe("true");
  });

  it("renders collapsed when the server read a collapsed cookie", () => {
    // The workspace layout reads the cookie and passes it as `defaultOpen`, so
    // the first paint is already correct instead of expanding and then jumping.
    renderSidebar({ defaultOpen: false });
    expect(sidebarState()).toBe("collapsed");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("is not duplicated in the preferences store", () => {
    renderSidebar();
    expect("sidebarCollapsed" in usePreferencesStore.getState()).toBe(false);
  });
});
