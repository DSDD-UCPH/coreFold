import { PLDDT_COLORS } from "../domain/types";

const CATEGORIES = [
  { color: PLDDT_COLORS.veryHigh, name: "Very high", range: ">90" },
  { color: PLDDT_COLORS.high, name: "High", range: "70–90" },
  { color: PLDDT_COLORS.low, name: "Low", range: "50–70" },
  { color: PLDDT_COLORS.veryLow, name: "Very low", range: "<50" },
] as const;

export function PlddtLegend({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <ul className={`plddt-legend ${tone}`} aria-label="pLDDT color scale">
      {CATEGORIES.map((item) => (
        <li key={item.range} title={`${item.name} (pLDDT ${item.range})`}>
          <span className="swatch" style={{ background: item.color }} />
          <span className="plddt-legend-text">
            {item.name} {item.range}
          </span>
        </li>
      ))}
    </ul>
  );
}
