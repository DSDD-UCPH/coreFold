import { parseIdentifier } from "./identifiers";
import { parseMmcifCaAndPlddt } from "./mmcifParser";
import { selectCanonicalEntry } from "./alphafoldClient";
import { normalizeUniProt } from "./uniprotClient";

describe("identifiers", () => {
  it("parses accession, entry name and gene symbol", () => {
    expect(parseIdentifier("P00519")).toEqual({
      kind: "accession",
      value: "P00519",
      isoformInput: false,
    });
    expect(parseIdentifier("ABL1_HUMAN")).toEqual({
      kind: "entry_name",
      value: "ABL1_HUMAN",
      isoformInput: false,
    });
    expect(parseIdentifier("ABL1")).toEqual({
      kind: "gene_symbol",
      value: "ABL1",
      isoformInput: false,
    });
  });

  it("strips isoform suffixes to the canonical accession", () => {
    expect(parseIdentifier("P00519-2")).toMatchObject({
      kind: "accession",
      value: "P00519",
      isoformInput: true,
    });
  });
});

const TINY_CIF = `data_test
loop_
_atom_site.group_PDB
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.B_iso_or_equiv
ATOM CA MET 1 0.000 0.000 0.000 32.94
ATOM CA LEU 2 3.800 0.000 0.000 34.19
`;

describe("mmCIF parser", () => {
  it("extracts Cα coordinates and pLDDT", () => {
    const parsed = parseMmcifCaAndPlddt(TINY_CIF);
    expect(parsed.sequence).toBe("ML");
    expect(parsed.plddt).toEqual([32.94, 34.19]);
    expect(parsed.ca[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(parsed.ca[1]?.x).toBeCloseTo(3.8);
  });
});

describe("AlphaFold entry selection", () => {
  it("rejects an isoform that shares the accession but not the sequence", () => {
    const protein = {
      accession: "P00519",
      entryName: "ABL1_HUMAN",
      organismName: "Homo sapiens",
      sequence: "ABC",
      length: 3,
      features: [],
    };
    const selected = selectCanonicalEntry(
      [
        {
          entryId: "AF-P00519-2-F1",
          uniprotAccession: "P00519",
          uniprotSequence: "ABCD",
          uniprotStart: 1,
          uniprotEnd: 4,
          cifUrl: "https://alphafold.ebi.ac.uk/files/AF-P00519-2-F1-model_v6.cif",
        },
        {
          entryId: "AF-P00519-F1",
          uniprotAccession: "P00519",
          uniprotSequence: "ABC",
          uniprotStart: 1,
          uniprotEnd: 3,
          cifUrl: "https://alphafold.ebi.ac.uk/files/AF-P00519-F1-model_v6.cif",
        },
      ],
      protein,
    );
    expect(selected?.entryId).toBe("AF-P00519-F1");
  });
});

describe("UniProt feature normalization", () => {
  it("keeps chain, peptide and signal annotations with exact boundaries", () => {
    const protein = normalizeUniProt({
      primaryAccession: "P05067",
      uniProtkbId: "A4_HUMAN",
      organism: { scientificName: "Homo sapiens", taxonId: 9606 },
      sequence: { value: "M".repeat(100), length: 100 },
      features: [
        {
          type: "Signal",
          description: "Signal",
          location: { start: { value: 1 }, end: { value: 17 } },
        },
        {
          type: "Chain",
          description: "Amyloid-beta precursor protein",
          location: { start: { value: 18 }, end: { value: 770 } },
        },
        {
          type: "Peptide",
          description: "Amyloid-beta peptide",
          location: { start: { value: 672 }, end: { value: 713 } },
        },
        {
          type: "Chain",
          description: "Incomplete",
          location: { start: {}, end: { value: 10 } },
        },
      ],
    });
    expect(protein.features.map((feature) => feature.type)).toEqual(["signal", "chain", "peptide"]);
    expect(protein.features[1]).toMatchObject({ start: 18, end: 770, type: "chain" });
  });
});
