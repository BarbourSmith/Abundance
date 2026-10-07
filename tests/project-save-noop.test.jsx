import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GlobalVariables from "../src/js/globalvariables.js";
import { ProjectProvider, useProject } from "../src/contexts/ProjectContext.jsx";
import { serializeProjectForChangeDetection } from "../src/js/projectSaveBaseline.js";

const mocks = vi.hoisted(() => ({
  octokit: null,
  notify: vi.fn(),
}));

vi.mock("../src/contexts/AuthContext.jsx", () => ({
  useAuth: () => ({
    authorizedUserOcto: mocks.octokit,
  }),
}));
vi.mock("../src/contexts/AppStateContext.jsx", () => ({
  useAppState: () => ({ setNotification: mocks.notify }),
}));

describe("project save no-op handling", () => {
  let context, molecule, git, progress, previousGlobals;
  let name;
  const baseline = { projectKey: "tester/Proj", json: "old", bom: "BOM" };

  function Harness() {
    context = useProject();
    return null;
  }

  function save(force = false, type = "Auto Save") {
    return context.saveProject(progress, type, force);
  }

  beforeEach(() => {
    previousGlobals = {
      currentAWSnode: GlobalVariables.currentAWSnode,
      currentUser: GlobalVariables.currentUser,
      lastSavedProject: GlobalVariables.lastSavedProject,
      projectIsLoading: GlobalVariables.projectIsLoading,
      cad: GlobalVariables.cad,
    };
    name = "Proj";
    molecule = {
      inputs: [],
      nodesOnTheScreen: [],
      compiledBom: [],
      value: null,
      serialize: () => ({
        atomType: "Molecule",
        name,
        uniqueID: "top",
        allAtoms: [],
        allConnectors: [],
      }),
      formatBom: () => "BOM",
      requestReadme: vi.fn().mockResolvedValue([]),
      deepGeomList: () => [],
      getContext: () => ({ project: "top" }),
    };
    vi.spyOn(GlobalVariables, "topLevelMolecule", "get").mockReturnValue(molecule);
    GlobalVariables.currentAWSnode = {
      owner: "tester",
      repoName: "Proj",
      description: "",
      topics: [],
    };
    GlobalVariables.currentUser = "tester";
    GlobalVariables.lastSavedProject = baseline;
    GlobalVariables.projectIsLoading = false;
    GlobalVariables.cad = { sweepCache: vi.fn().mockResolvedValue(0) };
    git = {
      createBlob: vi.fn().mockResolvedValue({ data: { sha: "blob" } }),
      getRef: vi.fn().mockResolvedValue({ data: { object: { sha: "head" } } }),
      getCommit: vi.fn().mockResolvedValue({ data: { tree: { sha: "tree" } } }),
      createTree: vi.fn().mockResolvedValue({ data: { sha: "tree" } }),
      createCommit: vi.fn().mockResolvedValue({ data: { sha: "new-commit" } }),
      updateRef: vi.fn().mockResolvedValue({}),
    };
    mocks.octokit = {
      request: vi.fn().mockResolvedValue({
        data: {
          default_branch: "main",
          html_url: "https://github.com/tester/Proj",
          private: false,
          description: "",
        },
      }),
      rest: { git, repos: { update: vi.fn() } },
    };
    mocks.notify.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    progress = vi.fn();
    render(
      <MemoryRouter>
        <ProjectProvider>
          <Harness />
        </ProjectProvider>
      </MemoryRouter>,
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Object.assign(GlobalVariables, previousGlobals);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("skips commits and AWS for matching trees but refreshes the baseline", async () => {
    expect(await save()).toEqual({ committed: false });
    expect(git.createCommit).not.toHaveBeenCalled();
    expect(git.updateRef).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(GlobalVariables.lastSavedProject).not.toBe(baseline);
    expect(GlobalVariables.lastSavedProject.bom).toBe("BOM");
    expect(progress).toHaveBeenLastCalledWith(100);
    const requests = mocks.octokit.request.mock.calls.length;
    await save();
    expect(mocks.octokit.request).toHaveBeenCalledTimes(requests);
  });

  it("allows a forced manual no-op save without updating AWS", async () => {
    expect(await save(true, "User Save")).toEqual({ committed: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(GlobalVariables.cad.sweepCache).toHaveBeenCalled();
  });

  it("skips an unchanged loaded project before any progress or remote requests", async () => {
    GlobalVariables.lastSavedProject = {
      ...baseline,
      json: serializeProjectForChangeDetection(molecule),
    };
    const onSaveStart = vi.fn();
    await context.saveProject(progress, "Auto Save", false, null, null, onSaveStart);
    expect(onSaveStart).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
    expect(mocks.octokit.request).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks saving during loading and releases the lock afterward", async () => {
    GlobalVariables.projectIsLoading = true;
    await save();
    await save(true, "User Save");
    expect(mocks.octokit.request).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.stringContaining("project is still loading"),
      "error",
    );
    GlobalVariables.projectIsLoading = false;
    expect(await save()).toEqual({ committed: false });
  });

  it.each(["worker", "nested atom"])(
    "defers computing %s saves for three intervals, then permits a save",
    async (computing) => {
      if (computing === "worker") {
        GlobalVariables.cad._pendingCalls = [{}];
      } else {
        molecule.nodesOnTheScreen = [
          { nodesOnTheScreen: [{ status: "processing" }] },
        ];
      }
      for (let interval = 0; interval < 3; interval++) {
        await save();
      }
      expect(mocks.octokit.request).not.toHaveBeenCalled();
      expect(await save()).toEqual({ committed: false });
      expect(git.createTree).toHaveBeenCalledTimes(1);
    },
  );

  it("leaves an uncompiled BOM out of the upload and retains its remote baseline", async () => {
    molecule.compiledBom = {};
    await save();
    expect(git.createTree.mock.calls[0][0].tree.map((entry) => entry.path))
      .not.toContain("BillOfMaterials.md");
    expect(GlobalVariables.lastSavedProject.bom).toBe("BOM");
    molecule.compiledBom = [];
    const requests = mocks.octokit.request.mock.calls.length;
    await save();
    expect(mocks.octokit.request).toHaveBeenCalledTimes(requests);
    molecule.formatBom = () => "updated BOM";
    await save();
    expect(git.createTree).toHaveBeenCalledTimes(2);
    expect(GlobalVariables.lastSavedProject.bom).toBe("updated BOM");
  });

  it("keeps recovered work saveable when no saved baseline exists", async () => {
    GlobalVariables.lastSavedProject = null;
    expect(await save()).toEqual({ committed: false });
    expect(git.createTree).toHaveBeenCalledTimes(1);
    expect(GlobalVariables.lastSavedProject.projectKey).toBe("tester/Proj");
  });

  it("does not reuse another project's baseline", async () => {
    GlobalVariables.lastSavedProject = {
      ...baseline,
      projectKey: "tester/Other",
      json: serializeProjectForChangeDetection(molecule),
    };
    await save();
    expect(git.createTree).toHaveBeenCalledTimes(1);
    expect(GlobalVariables.lastSavedProject.projectKey).toBe("tester/Proj");
  });

  it("keeps the baseline and reports an expired token before uploading", async () => {
    vi.useFakeTimers();
    mocks.octokit.request.mockRejectedValueOnce(
      Object.assign(new Error("Bad credentials"), { status: 401 }),
    );
    await save();
    expect(GlobalVariables.lastSavedProject).toBe(baseline);
    expect(git.createBlob).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.stringContaining("expired login"),
      "error",
    );
    vi.clearAllTimers();
  });

  it("updates AWS once after a real commit with a non-forced ref update", async () => {
    git.createTree.mockResolvedValue({ data: { sha: "new-tree" } });
    expect(await save()).toEqual({ committed: true });
    expect(git.createCommit).toHaveBeenCalledTimes(1);
    expect(git.updateRef).toHaveBeenCalledWith({
      owner: "tester",
      repo: "Proj",
      ref: "heads/main",
      sha: "new-commit",
      force: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.repoName).toBe("Proj");
    expect(body.attributeUpdates.githubMoleculesUsed).toEqual([]);
  });

  it.each([409, 422])(
    "skips AWS if another writer supplies the same tree during a %s retry",
    async (status) => {
      git.createTree
        .mockResolvedValueOnce({ data: { sha: "new-tree" } })
        .mockResolvedValueOnce({ data: { sha: "tree" } });
      git.updateRef.mockRejectedValueOnce(
        Object.assign(new Error("Branch moved"), { status }),
      );
      expect(await save()).toEqual({ committed: false });
      expect(git.getRef).toHaveBeenCalledTimes(2);
      expect(git.createCommit).toHaveBeenCalledTimes(1);
      expect(fetch).not.toHaveBeenCalled();
      expect(GlobalVariables.lastSavedProject).not.toBe(baseline);
    },
  );

  it("retries a changed tree successfully without duplicating blobs or AWS updates", async () => {
    git.createTree.mockResolvedValue({ data: { sha: "new-tree" } });
    git.updateRef.mockRejectedValueOnce(
      Object.assign(new Error("Branch moved"), { status: 409 }),
    );
    expect(await save()).toEqual({ committed: true });
    expect(git.getRef).toHaveBeenCalledTimes(2);
    expect(git.createBlob).toHaveBeenCalledTimes(4);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps edits made during a no-op request pending for the next save", async () => {
    git.createTree.mockImplementationOnce(async () => {
      name = "Edited while saving";
      return { data: { sha: "tree" } };
    });
    await save();
    expect(GlobalVariables.lastSavedProject.json).not.toContain("Edited while saving");
    await save();
    expect(git.createTree).toHaveBeenCalledTimes(2);
  });

  it("does not advance the baseline or call AWS when GitHub fails", async () => {
    git.createTree.mockRejectedValue(new Error("GitHub unavailable"));
    await save();
    expect(GlobalVariables.lastSavedProject).toBe(baseline);
    expect(fetch).not.toHaveBeenCalled();
    expect(progress).toHaveBeenLastCalledWith(0);
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.stringContaining("GitHub unavailable"),
      "error",
    );
    git.createTree.mockResolvedValue({ data: { sha: "tree" } });
    expect(await save()).toEqual({ committed: false });
    expect(GlobalVariables.lastSavedProject).not.toBe(baseline);
  });

  it("stops after three branch conflicts without updating AWS or the baseline", async () => {
    git.createTree.mockResolvedValue({ data: { sha: "new-tree" } });
    git.updateRef.mockRejectedValue(
      Object.assign(new Error("Branch keeps moving"), { status: 409 }),
    );
    await save();
    expect(git.updateRef).toHaveBeenCalledTimes(3);
    expect(GlobalVariables.lastSavedProject).toBe(baseline);
    expect(fetch).not.toHaveBeenCalled();
    expect(progress).toHaveBeenLastCalledWith(0);
  });

  it("keeps the save lock until a pending no-op completes", async () => {
    let finishTree;
    const started = new Promise((resolve) => {
      git.createTree.mockImplementationOnce(() => {
        resolve();
        return new Promise((finish) => {
          finishTree = finish;
        });
      });
    });
    const pending = save();
    await started;
    await save();
    expect(git.createTree).toHaveBeenCalledTimes(1);
    finishTree({ data: { sha: "tree" } });
    expect(await pending).toEqual({ committed: false });
    await save(true);
    expect(git.createTree).toHaveBeenCalledTimes(2);
  });

  it("surfaces an AWS HTTP failure rather than reporting success", async () => {
    git.createTree.mockResolvedValue({ data: { sha: "new-tree" } });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });
    await save();
    expect(GlobalVariables.lastSavedProject).toBe(baseline);
    expect(progress).toHaveBeenLastCalledWith(0);
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.stringContaining("AWS metadata update failed: 503"),
      "error",
    );
  });
});
