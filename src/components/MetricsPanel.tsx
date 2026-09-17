import {
  classifyCandidate,
  clipEditsToConstruct,
  computeInternalGeometry,
  estimatedThroughputGain,
  formatThroughputGain,
  minifiedLengthAfterEdits,
  showFullLengthThroughputComparison,
  type CandidateClass,
  type Construct,
  type Edit,
} from "../domain";
import { useInteractionStore } from "../state/interactionStore";
import { useWorkspaceStore, type ReadyState } from "../state/workspaceStore";

export function MetricsPanel() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const dragPreview = useInteractionStore((state) => state.dragPreview);
  if (workspace.status !== "ready") return null;
  const { derived } = workspace;
  const previewConstruct = dragPreview?.construct;
  const previewEdit = dragPreview?.edit;
  let originalLength = derived.referenceLength;
  let minifiedLength = derived.minifiedLength;
  if (previewConstruct) {
    if (workspace.construct.kind === "full_length") {
      const nMoved = previewConstruct.start !== workspace.construct.start;
      const cMoved = previewConstruct.end !== workspace.construct.end;
      const oldN = terminalDeletedLength(workspace.edits, workspace.construct, "n_terminal");
      const oldC = terminalDeletedLength(workspace.edits, workspace.construct, "c_terminal");
      if (nMoved) {
        minifiedLength +=
          oldN - Math.max(0, previewConstruct.start - workspace.construct.start);
      }
      if (cMoved) {
        minifiedLength += oldC - Math.max(0, workspace.construct.end - previewConstruct.end);
      }
      minifiedLength = Math.max(1, minifiedLength);
    } else {
      const windowLength = previewConstruct.end - previewConstruct.start + 1;
      const clipped = clipEditsToConstruct(workspace.edits, previewConstruct);
      minifiedLength = Math.max(1, minifiedLengthAfterEdits(windowLength, clipped));
    }
  } else if (previewEdit) {
    const current = workspace.edits.find((edit) => edit.id === previewEdit.id);
    if (current && current.type !== "substitution") {
      const oldDeleted = Math.max(0, current.end - current.start + 1);
      const newDeleted = Math.max(0, previewEdit.end - previewEdit.start + 1);
      const oldInsert = current.type === "replacement" ? current.insertedSequence.length : 0;
      const previewInterval = { start: previewEdit.start, end: previewEdit.end };
      const klass = classifyCandidate(previewInterval, workspace.construct);
      const newInsert =
        klass === "internal"
          ? (computeInternalGeometry(previewInterval, workspace.construct, workspace.structure.ca)
              ?.recommendedLinkerLength ?? 0)
          : 0;
      minifiedLength = Math.max(
        1,
        derived.minifiedLength + oldDeleted - oldInsert - newDeleted + newInsert,
      );
    }
  }
  const residuesRemoved = originalLength - minifiedLength;
  const reduction = originalLength === 0 ? 0 : (residuesRemoved / originalLength) * 100;
  const constructGain =
    workspace.throughputUsesMinifiedAsOriginal && !previewConstruct && !previewEdit
      ? 1
      : estimatedThroughputGain(originalLength, minifiedLength);
  const compareFullLength = showFullLengthThroughputComparison(workspace.construct);
  const fullOriginalLength = workspace.protein.length;
  const fullLengthGain = compareFullLength
    ? estimatedThroughputGain(fullOriginalLength, minifiedLength)
    : undefined;
  const fullResiduesRemoved = fullOriginalLength - minifiedLength;
  const fullReduction =
    fullOriginalLength === 0 ? 0 : (fullResiduesRemoved / fullOriginalLength) * 100;
  const constructLabel = metricConstructLabel(workspace);

  return (
    <section className="metrics">
      <h2>Summary</h2>
      <p className="muted" style={{ margin: 0 }}>
        Estimated throughput gain
      </p>
      {fullLengthGain !== undefined ? (
        <div className="metrics-compare">
          <div>
            <p className="muted">{constructLabel}</p>
            <p className="metrics-gain">{formatThroughputGain(constructGain)}</p>
            <p className="metrics-lengths">
              {originalLength} aa → {minifiedLength} aa
            </p>
          </div>
          <div>
            <p className="muted">Full length</p>
            <p className="metrics-gain">{formatThroughputGain(fullLengthGain)}</p>
            <p className="metrics-lengths">
              {fullOriginalLength} aa → {minifiedLength} aa
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="metrics-gain">{formatThroughputGain(constructGain)}</p>
          <p className="metrics-lengths">
            {originalLength} aa → {minifiedLength} aa
          </p>
        </>
      )}
      <div className="reduction-bar" aria-hidden="true">
        <span
          style={{
            width: `${Math.min(100, Math.max(0, fullLengthGain !== undefined ? fullReduction : reduction))}%`,
          }}
        />
      </div>
      <dl>
        <div>
          <dt>Original construct length</dt>
          <dd>{originalLength} aa</dd>
        </div>
        {fullLengthGain !== undefined && (
          <div>
            <dt>Full-length protein</dt>
            <dd>{fullOriginalLength} aa</dd>
          </div>
        )}
        <div>
          <dt>Minified construct length</dt>
          <dd>{minifiedLength} aa</dd>
        </div>
        <div>
          <dt>Residues removed</dt>
          <dd>{residuesRemoved}</dd>
        </div>
        {fullLengthGain !== undefined && (
          <div>
            <dt>Residues vs full length</dt>
            <dd>{fullResiduesRemoved}</dd>
          </div>
        )}
        <div>
          <dt>Sequence reduction</dt>
          <dd>{reduction.toFixed(1)}%</dd>
        </div>
        {fullLengthGain !== undefined && (
          <div>
            <dt>Reduction vs full length</dt>
            <dd>{fullReduction.toFixed(1)}%</dd>
          </div>
        )}
        <div>
          <dt>Edits</dt>
          <dd>{derived.editCount}</dd>
        </div>
      </dl>
      {previewConstruct && (
        <p className="muted">
          Preview construct {previewConstruct.start}–{previewConstruct.end}
        </p>
      )}
    </section>
  );
}

function metricConstructLabel(workspace: ReadyState): string {
  const ids = workspace.construct.featureId?.split("+").filter(Boolean) ?? [];
  if (ids.length === 1) {
    const feature = workspace.protein.features.find((item) => item.id === ids[0]);
    if (feature?.description) return feature.description;
  }
  if (ids.length > 1) return "Selected domains";
  const named = workspace.construct.label.replace(/ \(\d+[–-]\d+\)$/, "").trim();
  return named || "This construct";
}

function terminalDeletedLength(
  edits: Edit[],
  construct: Construct,
  klass: CandidateClass,
): number {
  return edits.reduce((sum, edit) => {
    if (edit.status !== "applied" || edit.type === "substitution" || edit.end < edit.start) {
      return sum;
    }
    if (classifyCandidate(edit, construct) !== klass) return sum;
    const deleted = edit.end - edit.start + 1;
    const insert = edit.type === "replacement" ? edit.insertedSequence.length : 0;
    return sum + deleted - insert;
  }, 0);
}
