import { test, expect } from "@playwright/test";

const CIF = `data_test
loop_
_atom_site.group_PDB
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.B_iso_or_equiv
${Array.from({ length: 80 }, (_, i) => {
  const aa = i < 40 ? "GLY" : "ALA";
  const b = i < 40 || (i >= 45 && i < 76) ? "20.00" : "90.00";
  return `ATOM CA ${aa} ${i + 1} 0.000 0.000 0.000 ${b}`;
}).join("\n")}
`;

const sequence = `${"G".repeat(40)}${"A".repeat(40)}`;

const uniprot = {
  primaryAccession: "P00000",
  uniProtkbId: "TEST_HUMAN",
  organism: { scientificName: "Homo sapiens", taxonId: 9606 },
  genes: [{ geneName: { value: "TEST" } }],
  proteinDescription: { recommendedName: { fullName: { value: "Test protein" } } },
  sequence: { value: sequence, length: 80 },
  features: [
    {
      type: "Domain",
      description: "C-lobe",
      location: { start: { value: 1 }, end: { value: 40 } },
    },
    {
      type: "Domain",
      description: "N-lobe",
      location: { start: { value: 41 }, end: { value: 80 } },
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("https://rest.uniprot.org/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/search")) {
      await route.fulfill({
        json: {
          results: [
            {
              primaryAccession: "P00000",
              uniProtkbId: "TEST_HUMAN",
              organism: { scientificName: "Homo sapiens" },
              genes: [{ geneName: { value: "TEST" } }],
              proteinDescription: { recommendedName: { fullName: { value: "Test protein" } } },
              sequence: { length: 80 },
            },
          ],
        },
      });
      return;
    }
    await route.fulfill({ json: uniprot });
  });
  await page.route("https://alphafold.ebi.ac.uk/api/prediction/**", async (route) => {
    await route.fulfill({
      json: [
        {
          entryId: "AF-P00000-F1",
          uniprotAccession: "P00000",
          uniprotSequence: sequence,
          uniprotStart: 1,
          uniprotEnd: 80,
          cifUrl: "https://alphafold.ebi.ac.uk/files/AF-P00000-F1-model_v6.cif",
          isComplex: false,
        },
      ],
    });
  });
  await page.route("https://alphafold.ebi.ac.uk/files/**", async (route) => {
    await route.fulfill({ body: CIF, contentType: "chemical/x-mmcif" });
  });
});

async function loadTestProtein(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByLabel("Canonical UniProt accession, UniProt entry name, or gene symbol")
    .fill("P00000");
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.getByText("Estimated throughput gain")).toBeVisible();
}

test("scenario A: terminal trim is auto-applied", async ({ page }) => {
  await loadTestProtein(page);
  await expect(page.getByText("Applied").first()).toBeVisible();
  await expect(page.getByText("N-terminal low-confidence region")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("1.00×").first()).toBeVisible();
  await page.getByRole("button", { name: "Redo" }).click();
  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByRole("button", { name: "Download FASTA" })).toBeVisible();
  await expect(page.getByText("Co-Folding methods")).toBeVisible();
  await page.getByText("GreenFold A3M").click();
  await expect(
    page.getByText("GreenFold provided the A3M Multiple Sequence Alignment file."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Download paired A3M" })).toBeVisible();
});

test("scenario B: internal candidate requires accept", async ({ page }) => {
  await loadTestProtein(page);
  await expect(page.getByText("Review required")).toBeVisible();
  await expect(page.getByText("Internal low-confidence region")).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByText("Geometry").click();
  await expect(page.getByText("Suggested linker:")).toBeVisible();
  await expect(page.getByLabel("Linker sequence, G and S only")).toBeVisible();
});

test("scenario D: domain selector is offered", async ({ page }) => {
  await loadTestProtein(page);
  await expect(page.getByRole("heading", { name: "Active construct" })).toBeVisible();
  await page.getByRole("button", { name: /N-lobe \(41–80\)/ }).click();
  await expect(page.getByRole("button", { name: /N-lobe \(41–80\)/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const summary = page.locator(".metrics");
  await expect(summary.getByText("Estimated throughput gain")).toBeVisible();
  await expect(summary.getByText("N-lobe", { exact: true })).toBeVisible();
  await expect(summary.getByText("Full length", { exact: true })).toBeVisible();
  await expect(summary.getByText(/80 aa →/)).toBeVisible();
});

test("scenario F: missing model shows unsupported state", async ({ page }) => {
  await page.route("https://alphafold.ebi.ac.uk/api/prediction/**", async (route) => {
    await route.fulfill({ status: 404, body: "[]" });
  });
  await page.goto("/");
  await page
    .getByLabel("Canonical UniProt accession, UniProt entry name, or gene symbol")
    .fill("P00000");
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.getByText(/No usable AlphaFold DB model/)).toBeVisible();
});

test("share link restores a final construct", async ({ page }) => {
  await page.goto("/?greenfold=P00000%5B1-40del%5D");
  await expect(page.getByText("Estimated throughput gain")).toBeVisible();
  await expect(page.getByLabel("GreenFold construct")).toHaveValue(/P00000\[.*40del/);
});

test("workspace uses a fixed viewport", async ({ page }) => {
  await loadTestProtein(page);
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollHeight,
    inner: window.innerHeight,
    rootOverflow: getComputedStyle(document.documentElement).overflow,
  }));
  expect(overflow.rootOverflow).toBe("hidden");
  expect(overflow.body).toBeLessThanOrEqual(overflow.inner + 2);
});

test("keyboard delete then undo restores the construct", async ({ page }) => {
  await loadTestProtein(page);
  await page.getByRole("button", { name: "Go to residue" }).click();
  await page.getByLabel("Selection start residue").fill("50");
  await page.getByLabel("Selection end residue").fill("55");
  await page.getByRole("button", { name: "Select range" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Selected 50–55")).toBeVisible();
  await expect(page.locator(".seq-cell.selected")).toHaveCount(6);
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText("Selected 50–55")).toHaveCount(0);
  await expect(page.locator(".seq-cell.selected")).toHaveCount(0);

  await page.getByRole("button", { name: "Go to residue" }).click();
  await page.getByLabel("Selection start residue").fill("50");
  await page.getByLabel("Selection end residue").fill("55");
  await page.getByRole("button", { name: "Select range" }).click();
  await page.keyboard.press("Escape");
  await page.getByText("Selected 50–55").click();
  await page.keyboard.press("Delete");
  await expect(page.getByText("Custom edits")).toBeVisible();
  await page.getByRole("banner").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Custom edits")).toHaveCount(0);
});

test("dragging an automatic proposal handle updates that card", async ({ page }) => {
  await loadTestProtein(page);
  const grip = page.getByRole("button", { name: "Deletion end 42" });
  await page.getByText("N-terminal low-confidence region").click();
  await page.getByRole("button", { name: "Highlight" }).first().click();
  await expect(grip).toBeVisible();
  const box = await grip.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 42, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText(/Manually adjusted from the automatic proposal 1–42/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Original proposal" })).toBeVisible();
  await page.getByRole("button", { name: "Original proposal" }).click();
  await expect(page.getByText(/Manually adjusted/)).toHaveCount(0);
  await expect(page.getByText("Custom edits")).toHaveCount(0);
});

test("loading another protein confirms when edits exist", async ({ page }) => {
  await loadTestProtein(page);
  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByLabel("Protein query").fill("P00000");
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.getByText("Load a new protein?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Load a new protein?")).toHaveCount(0);
});

test("human proteins can download a GreenFold A3M", async ({ page }) => {
  await page.route("**/greenfold-api/v1/download_a3m/**", async (route) => {
    expect(route.request().headers()["mutation-pattern"]).toMatch(/^P00000\[/);
    expect(route.request().url()).toContain("kind=paired");
    await route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      headers: { "content-disposition": 'attachment; filename="P00000_paired.a3m"' },
      body: ">query\nGGGG\n",
    });
  });
  await loadTestProtein(page);
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByText("GreenFold A3M").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download paired A3M" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("P00000_paired.a3m");
});

test("history menu lists the saved design", async ({ page }) => {
  await loadTestProtein(page);
  await expect
    .poll(async () =>
      page.evaluate(() => localStorage.getItem("protein-minifier.design-history.v1") ?? ""),
    )
    .toMatch(/P00000/);
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("button", { name: /TEST · Full length/ })).toBeVisible();
});
