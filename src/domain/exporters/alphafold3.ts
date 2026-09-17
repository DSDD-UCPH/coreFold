export function exportAlphaFold3Json(accession: string, sequence: string): string {
  const payload = {
    name: `${accession}_minified`,
    modelSeeds: [1],
    sequences: [
      {
        protein: {
          id: "A",
          sequence,
          templates: [],
        },
      },
    ],
    dialect: "alphafold3",
    version: 4,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}
