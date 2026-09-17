export function exportBoltzYaml(sequence: string): string {
  return `version: 1\nsequences:\n  - protein:\n      id: A\n      sequence: ${sequence}\n`;
}
