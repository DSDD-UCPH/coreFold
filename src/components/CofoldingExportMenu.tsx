import { COFOLDING_EXPORTS } from "../domain/exporters";
import { downloadText } from "./utils";

export function CofoldingExportMenu({
  accession,
  sequence,
}: {
  accession: string;
  sequence: string;
}) {
  return (
    <details className="export-group">
      <summary>Co-Folding methods</summary>
      <p className="muted">
        Co-folding inputs contain the minified protein as a single chain. Add interaction partners
        or other entities required for your experiment.
      </p>
      <div className="menu-list" role="group" aria-label="Co-Folding method inputs">
        {COFOLDING_EXPORTS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="ghost"
            onClick={() =>
              downloadText(item.filename(accession), item.content(accession, sequence), item.mime)
            }
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}
