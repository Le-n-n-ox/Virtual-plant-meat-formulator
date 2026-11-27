import { cleanup, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./_render";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubMatchMedia } from "./_matchMedia";

/**
 * Formulation list (guide §5 page 5): duplicate routes to the copy, archive is
 * confirmed and PATCHed, "Show archived" changes the request, the create dialog
 * can start from a template and stays open on failure.
 */

const push = vi.fn();
const listFormulations = vi.fn();
const createFormulation = vi.fn();
const duplicateFormulation = vi.fn();
const patchFormulation = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api/formulations", () => ({
  listFormulations: (...args: unknown[]) => listFormulations(...args),
  createFormulation: (body: unknown) => createFormulation(body),
  duplicateFormulation: (id: string) => duplicateFormulation(id),
  patchFormulation: (id: string, body: unknown) => patchFormulation(id, body),
}));
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div role="status">loading</div>,
}));

import {
  FormulationList,
  NewFormulationDialog,
} from "@/components/formulation/formulation-list";

// The create and archive dialogs time their open/close from the shared motion
// tokens, which read the reduced-motion media query.
beforeEach(() => stubMatchMedia());

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const item = (over: Record<string, unknown> = {}) => ({
  id: "frm_1",
  name: "Cowpea blend",
  current_version: 3,
  updated_at: "2026-01-01T00:00:00Z",
  last_job: null,
  archived: false,
  ...over,
});

const paged = (items: unknown[]) => ({
  items,
  total: items.length,
  page: 1,
  page_size: 20,
});

describe("FormulationList", () => {
  it("hides archived formulations unless the toggle is on", async () => {
    listFormulations.mockResolvedValue(paged([item()]));
    renderWithProviders(<FormulationList />);

    await screen.findByText("Cowpea blend");
    expect(listFormulations).toHaveBeenLastCalledWith(
      expect.objectContaining({ archived: undefined }),
    );

    await userEvent.setup().click(screen.getByLabelText("Show archived"));
    await waitFor(() =>
      expect(listFormulations).toHaveBeenLastCalledWith(
        expect.objectContaining({ archived: true }),
      ),
    );
  });

  it("duplicates and routes to the copy", async () => {
    const user = userEvent.setup();
    listFormulations.mockResolvedValue(paged([item()]));
    duplicateFormulation.mockResolvedValue({
      id: "frm_2",
      name: "Cowpea blend (copy)",
    });
    renderWithProviders(<FormulationList />);

    await user.click(
      await screen.findByRole("button", { name: "Duplicate Cowpea blend" }),
    );

    expect(duplicateFormulation).toHaveBeenCalledWith("frm_1");
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/formulations/frm_2"),
    );
  });

  it("asks before archiving, then patches and reloads", async () => {
    const user = userEvent.setup();
    listFormulations.mockResolvedValue(paged([item()]));
    patchFormulation.mockResolvedValue(item({ archived: true }));
    renderWithProviders(<FormulationList />);

    await user.click(
      await screen.findByRole("button", { name: "Archive Cowpea blend" }),
    );
    expect(patchFormulation).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("button", { name: "Archive" }));

    await waitFor(() =>
      expect(patchFormulation).toHaveBeenCalledWith("frm_1", {
        archived: true,
      }),
    );
    // The archived row disappears from a list that hides archived items.
    await waitFor(() => expect(listFormulations).toHaveBeenCalledTimes(2));
  });

  it("restores an archived formulation without asking", async () => {
    const user = userEvent.setup();
    listFormulations.mockResolvedValue(
      paged([item({ archived: true, id: "frm_9" })]),
    );
    patchFormulation.mockResolvedValue(item({ archived: false }));
    renderWithProviders(<FormulationList />);

    await user.click(
      await screen.findByRole("button", { name: "Restore Cowpea blend" }),
    );

    await waitFor(() =>
      expect(patchFormulation).toHaveBeenCalledWith("frm_9", {
        archived: false,
      }),
    );
  });
});

describe("NewFormulationDialog", () => {
  it("creates from a template and routes to the new formulation", async () => {
    const user = userEvent.setup();
    listFormulations.mockResolvedValue(
      paged([item({ id: "frm_t", name: "Template" })]),
    );
    createFormulation.mockResolvedValue({ id: "frm_new" });
    renderWithProviders(<NewFormulationDialog open onOpenChange={() => {}} />);

    await user.type(await screen.findByLabelText("Name"), "New blend");
    await user.selectOptions(
      await screen.findByLabelText("Start from (optional)"),
      "frm_t",
    );
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(createFormulation).toHaveBeenCalledWith(
        expect.objectContaining({ name: "New blend", template_id: "frm_t" }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/formulations/frm_new");
  });

  it("stays open with the server message when creation fails", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    listFormulations.mockResolvedValue(paged([]));
    createFormulation.mockRejectedValue(new Error("name already exists"));
    renderWithProviders(
      <NewFormulationDialog open onOpenChange={onOpenChange} />,
    );

    await user.type(await screen.findByLabelText("Name"), "Taken");
    await user.click(screen.getByRole("button", { name: "Create" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("name already exists");
    expect(push).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByLabelText("Name")).toHaveValue("Taken");
  });

  it("creates blank when no template is chosen", async () => {
    const user = userEvent.setup();
    listFormulations.mockResolvedValue(paged([item()]));
    createFormulation.mockResolvedValue({ id: "frm_new" });
    renderWithProviders(<NewFormulationDialog open onOpenChange={() => {}} />);

    await user.type(await screen.findByLabelText("Name"), "Blank");
    await user.click(await screen.findByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(createFormulation).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Blank", template_id: undefined }),
      ),
    );
  });
});
