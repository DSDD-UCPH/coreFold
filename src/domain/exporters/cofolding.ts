import { exportAlphaFold3Json } from "./alphafold3";
import { exportBoltzYaml } from "./boltz";
import { wrapFastaSequence } from "./fasta";

export type CofoldingExport = {
  id: string;
  label: string;
  mime: string;
  filename: (accession: string) => string;
  content: (accession: string, sequence: string) => string;
};

function jsonFile(payload: unknown): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function namedFasta(accession: string, sequence: string): string {
  return `>${accession}_minified\n${wrapFastaSequence(sequence)}\n`;
}

export function exportAlphaFold2Fasta(accession: string, sequence: string): string {
  return namedFasta(accession, sequence);
}

export function exportOpenFold2Fasta(accession: string, sequence: string): string {
  return namedFasta(accession, sequence);
}

export function exportChai1Fasta(accession: string, sequence: string): string {
  return `>protein|name=${accession}_minified\n${wrapFastaSequence(sequence)}\n`;
}

export function exportOpenFold3Json(accession: string, sequence: string): string {
  return jsonFile({
    queries: {
      [`${accession}_minified`]: {
        chains: [
          {
            molecule_type: "protein",
            chain_ids: "A",
            sequence,
          },
        ],
      },
    },
  });
}

export function exportProtenixJson(accession: string, sequence: string): string {
  return jsonFile([
    {
      name: `${accession}_minified`,
      sequences: [
        {
          proteinChain: {
            sequence,
            count: 1,
            id: ["A"],
          },
        },
      ],
    },
  ]);
}

export function exportOpenDdeJson(accession: string, sequence: string): string {
  return jsonFile([
    {
      name: `${accession}_minified`,
      modelSeeds: [1],
      sequences: [
        {
          proteinChain: {
            sequence,
            count: 1,
            id: ["A"],
          },
        },
      ],
    },
  ]);
}

export function exportHelixFoldJson(_accession: string, sequence: string): string {
  return jsonFile({
    entities: [
      {
        type: "protein",
        sequence,
        count: 1,
      },
    ],
  });
}

export const COFOLDING_EXPORTS: CofoldingExport[] = [
  {
    id: "af2",
    label: "AlphaFold 2",
    mime: "text/plain",
    filename: (accession) => `${accession}_minified_af2.fasta`,
    content: exportAlphaFold2Fasta,
  },
  {
    id: "af3",
    label: "AlphaFold 3",
    mime: "application/json",
    filename: (accession) => `${accession}_minified_af3.json`,
    content: exportAlphaFold3Json,
  },
  {
    id: "boltz",
    label: "Boltz",
    mime: "text/yaml",
    filename: (accession) => `${accession}_minified_boltz.yaml`,
    content: (_accession, sequence) => exportBoltzYaml(sequence),
  },
  {
    id: "chai1",
    label: "Chai-1",
    mime: "text/plain",
    filename: (accession) => `${accession}_minified_chai.fasta`,
    content: exportChai1Fasta,
  },
  {
    id: "helixfold",
    label: "HelixFold",
    mime: "application/json",
    filename: (accession) => `${accession}_minified_helixfold.json`,
    content: exportHelixFoldJson,
  },
  {
    id: "openfold2",
    label: "OpenFold2",
    mime: "text/plain",
    filename: (accession) => `${accession}_minified_openfold2.fasta`,
    content: exportOpenFold2Fasta,
  },
  {
    id: "openfold3",
    label: "OpenFold3",
    mime: "application/json",
    filename: (accession) => `${accession}_minified_openfold3.json`,
    content: exportOpenFold3Json,
  },
  {
    id: "opendde",
    label: "OpenDDE",
    mime: "application/json",
    filename: (accession) => `${accession}_minified_opendde.json`,
    content: exportOpenDdeJson,
  },
  {
    id: "protenix",
    label: "Protenix",
    mime: "application/json",
    filename: (accession) => `${accession}_minified_protenix.json`,
    content: exportProtenixJson,
  },
];
