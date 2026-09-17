import {
  clearDesignHistory,
  deleteDesign,
  DESIGN_HISTORY_KEY,
  getWorkingDesignId,
  readDesignHistory,
  saveWorkingDesign,
  setWorkingDesignId,
  upsertWorkingDesign,
} from "./designHistory";

describe("designHistory", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    globalThis.sessionStorage?.clear();
  });

  it("overwrites the working design instead of adding a row per edit", () => {
    upsertWorkingDesign({
      accession: "P00000",
      gene: "TEST",
      label: "Full length",
      greenfold: "P00000",
      minifiedLength: 80,
      gain: "1.00×",
    });
    const afterEdits = upsertWorkingDesign({
      accession: "P00000",
      gene: "TEST",
      label: "Full length",
      greenfold: "P00000[1-10del]",
      minifiedLength: 70,
      gain: "1.10×",
    });
    expect(afterEdits).toHaveLength(1);
    expect(afterEdits[0]?.greenfold).toBe("P00000[1-10del]");
    expect(afterEdits[0]?.saved).toBe(false);
    expect(getWorkingDesignId()).toBe(afterEdits[0]?.id);
  });

  it("starts a new working design after save, keeping the snapshot", () => {
    upsertWorkingDesign({
      accession: "P00000",
      gene: "TEST",
      label: "Full length",
      greenfold: "P00000[1-10del]",
      minifiedLength: 70,
      gain: "1.10×",
    });
    const saved = saveWorkingDesign();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.saved).toBe(true);
    expect(getWorkingDesignId()).toBeUndefined();

    expect(
      upsertWorkingDesign({
        accession: "P00000",
        gene: "TEST",
        label: "Full length",
        greenfold: "P00000[1-10del]",
        minifiedLength: 70,
        gain: "1.10×",
      }),
    ).toHaveLength(1);

    const next = upsertWorkingDesign({
      accession: "P00000",
      gene: "TEST",
      label: "Full length",
      greenfold: "P00000[1-20del]",
      minifiedLength: 60,
      gain: "1.20×",
    });
    expect(next).toHaveLength(2);
    expect(next[0]?.greenfold).toBe("P00000[1-20del]");
    expect(next[0]?.saved).toBe(false);
    expect(next[1]?.greenfold).toBe("P00000[1-10del]");
    expect(next[1]?.saved).toBe(true);
  });

  it("does not overwrite a working design for a different protein", () => {
    upsertWorkingDesign({
      accession: "P00000",
      label: "Full length",
      greenfold: "P00000",
      minifiedLength: 80,
      gain: "1.00×",
    });
    const next = upsertWorkingDesign({
      accession: "P00519",
      label: "Full length",
      greenfold: "P00519",
      minifiedLength: 1130,
      gain: "1.00×",
    });
    expect(next).toHaveLength(2);
    expect(next[0]?.accession).toBe("P00519");
    expect(next[1]?.accession).toBe("P00000");
  });

  it("deletes and clears entries", () => {
    const [entry] = upsertWorkingDesign({
      accession: "P00519",
      label: "Full length",
      greenfold: "P00519",
      minifiedLength: 1130,
      gain: "1.00×",
    });
    expect(readDesignHistory()).toHaveLength(1);
    deleteDesign(entry.id);
    expect(readDesignHistory()).toHaveLength(0);
    expect(getWorkingDesignId()).toBeUndefined();
    setWorkingDesignId("x");
    upsertWorkingDesign({
      accession: "P00519",
      label: "Full length",
      greenfold: "P00519",
      minifiedLength: 1130,
      gain: "1.00×",
    });
    clearDesignHistory();
    expect(readDesignHistory()).toHaveLength(0);
    expect(globalThis.localStorage.getItem(DESIGN_HISTORY_KEY)).toBe("[]");
  });
});
