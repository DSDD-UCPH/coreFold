import { exportAlphaFold3Json } from "./alphafold3";
import { exportBoltzYaml } from "./boltz";
import {
  exportAlphaFold2Fasta,
  exportChai1Fasta,
  exportHelixFoldJson,
  exportOpenFold2Fasta,
  exportOpenFold3Json,
  exportOpenDdeJson,
  exportProtenixJson,
} from "./cofolding";
import { exportResidueMapCsv } from "./csv";
import { exportFasta, formatGreenFoldFasta } from "./fasta";
import {
  GREENFOLD_A3M_ATTRIBUTION,
  GREENFOLD_BASE_URL,
  a3mFilenameFromDisposition,
  greenfoldA3mMutationPattern,
  greenfoldA3mUrl,
  isHumanProtein,
} from "./greenfoldA3m";
import { buildResidueMap } from "../residueMap";
import type { Edit } from "../types";

describe("exporters", () => {
  const sequence = "ACDEGG";

  it("writes FASTA without internal whitespace except wrapping", () => {
    const fasta = exportFasta({ accession: "P00519", entryName: "ABL1_HUMAN" }, sequence, 2);
    expect(fasta.startsWith(">P00519|minified|source=ABL1_HUMAN|length=6|edits=2")).toBe(true);
    expect(fasta).toContain("\nACDEGG\n");
  });

  it("writes a FASTA record whose id is the GreenFold annotation", () => {
    const fasta = formatGreenFoldFasta("P00519[G1-G40del]", `${"A".repeat(61)}G`);
    expect(fasta.startsWith(">P00519[G1-G40del]\n")).toBe(true);
    expect(fasta).toBe(`>P00519[G1-G40del]\n${"A".repeat(60)}\nAG\n`);
  });

  it("writes residue map CSV in the specified column order", () => {
    const edits: Edit[] = [
      {
        id: "r1",
        type: "replacement",
        source: "user",
        status: "applied",
        start: 3,
        end: 4,
        insertedSequence: "GG",
      },
    ];
    const rows = buildResidueMap("ABCDEF", { start: 1, end: 6 }, edits);
    const csv = exportResidueMapCsv(rows);
    expect(csv.split("\n")[0]).toBe(
      "uniprot_position,uniprot_aa,status,minified_position,minified_aa,edit_id",
    );
    expect(csv).toContain(",deleted,");
    expect(csv).toContain(",inserted,");
  });

  it("writes AlphaFold 3 JSON dialect version 4", () => {
    const json = JSON.parse(exportAlphaFold3Json("P00519", sequence));
    expect(json.dialect).toBe("alphafold3");
    expect(json.version).toBe(4);
    expect(json.sequences).toHaveLength(1);
    expect(json.sequences[0].protein.id).toBe("A");
    expect(json.sequences[0].protein.sequence).toBe(sequence);
    expect(json.modelSeeds).toEqual([1]);
  });

  it("writes Boltz YAML version 1", () => {
    expect(exportBoltzYaml(sequence)).toBe(
      "version: 1\nsequences:\n  - protein:\n      id: A\n      sequence: ACDEGG\n",
    );
  });

  it("writes AlphaFold 2 and OpenFold2 FASTA inputs", () => {
    expect(exportAlphaFold2Fasta("P00519", sequence)).toBe(">P00519_minified\nACDEGG\n");
    expect(exportOpenFold2Fasta("P00519", sequence)).toBe(">P00519_minified\nACDEGG\n");
  });

  it("writes a Chai-1 FASTA with an entity-type header", () => {
    expect(exportChai1Fasta("P00519", sequence)).toBe(">protein|name=P00519_minified\nACDEGG\n");
  });

  it("writes an OpenFold3 query JSON", () => {
    const json = JSON.parse(exportOpenFold3Json("P00519", sequence));
    expect(json.queries.P00519_minified.chains).toEqual([
      { molecule_type: "protein", chain_ids: "A", sequence },
    ]);
  });

  it("writes a Protenix job JSON list", () => {
    const json = JSON.parse(exportProtenixJson("P00519", sequence));
    expect(json).toHaveLength(1);
    expect(json[0].name).toBe("P00519_minified");
    expect(json[0].sequences[0].proteinChain).toEqual({
      sequence,
      count: 1,
      id: ["A"],
    });
  });

  it("writes an OpenDDE job JSON list", () => {
    const json = JSON.parse(exportOpenDdeJson("P00519", sequence));
    expect(json).toHaveLength(1);
    expect(json[0].name).toBe("P00519_minified");
    expect(json[0].modelSeeds).toEqual([1]);
    expect(json[0].sequences[0].proteinChain).toEqual({
      sequence,
      count: 1,
      id: ["A"],
    });
  });

  it("writes a HelixFold entity JSON", () => {
    const json = JSON.parse(exportHelixFoldJson("P00519", sequence));
    expect(json.entities).toEqual([{ type: "protein", sequence, count: 1 }]);
  });
});

describe("GreenFold A3M download helpers", () => {
  it("builds the CLI A3M URL and mutation-pattern header", () => {
    expect(greenfoldA3mUrl("P00519", "paired")).toBe(
      `${GREENFOLD_BASE_URL}/v1/download_a3m/P00519?kind=paired`,
    );
    expect(greenfoldA3mUrl("P00519", "unpaired")).toBe(
      `${GREENFOLD_BASE_URL}/v1/download_a3m/P00519?kind=unpaired`,
    );
    expect(greenfoldA3mMutationPattern("P00519")).toBeUndefined();
    expect(greenfoldA3mMutationPattern("P00519[M1-N49del]")).toBe("P00519[M1-N49del]");
    expect(GREENFOLD_A3M_ATTRIBUTION).toBe(
      "greenFold provides ready-to-use multiple sequence alignments for the entire human proteome, available in A3M and raw STO formats, including modifications. If you use greenFold, please cite our associated work.",
    );
  });

  it("prefers the Content-Disposition filename when present", () => {
    expect(
      a3mFilenameFromDisposition('attachment; filename="P00519_paired.a3m"', "P00519", "paired"),
    ).toBe("P00519_paired.a3m");
    expect(a3mFilenameFromDisposition(null, "P00519", "unpaired")).toBe("P00519_unpaired.a3m");
  });

  it("offers A3M downloads only for human proteins", () => {
    expect(
      isHumanProtein({
        organismId: 9606,
        organismName: "Homo sapiens",
        entryName: "ABL1_HUMAN",
      }),
    ).toBe(true);
    expect(
      isHumanProtein({
        organismName: "Homo sapiens",
        entryName: "ABL1_HUMAN",
      }),
    ).toBe(true);
    expect(
      isHumanProtein({
        organismId: 10090,
        organismName: "Mus musculus",
        entryName: "ABL1_MOUSE",
      }),
    ).toBe(false);
    expect(
      isHumanProtein({
        organismName: "unknown",
        entryName: "ABL1_HUMAN",
      }),
    ).toBe(true);
  });
});
