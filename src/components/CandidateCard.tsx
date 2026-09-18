import type { Candidate, Edit } from "../domain/types";
import { annotateCandidate, proposalBoundsAdjusted } from "../domain/proposal";
import { useInteractionStore } from "../state/interactionStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import { LinkerEditor } from "./LinkerEditor";

export function CandidateCard({ candidate }: { candidate: Candidate }) {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const applyCandidate = useWorkspaceStore((state) => state.applyCandidate);
  const acceptEdit = useWorkspaceStore((state) => state.acceptEdit);
  const rejectEdit = useWorkspaceStore((state) => state.rejectEdit);
  const restoreEdit = useWorkspaceStore((state) => state.restoreEdit);
  const resetToProposal = useWorkspaceStore((state) => state.resetToProposal);
  const selectCandidate = useWorkspaceStore((state) => state.selectCandidate);
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const setHoverRange = useInteractionStore((state) => state.setHoverRange);
  const dragPreview = useInteractionStore((state) => state.dragPreview);
  if (workspace.status !== "ready") return null;
  const match = workspace.edits.find((item) => editCoversCandidate(item, candidate));
  const edit = match && match.type !== "substitution" ? match : undefined;
  const live =
    edit && dragPreview?.edit?.id === edit.id
      ? { start: dragPreview.edit.start, end: dragPreview.edit.end }
      : edit
        ? { start: edit.start, end: edit.end }
        : { start: candidate.start, end: candidate.end };
  const adjusted = proposalBoundsAdjusted(candidate, live);
  const display = adjusted
    ? annotateCandidate(
        live,
        workspace.construct,
        workspace.protein.features,
        workspace.structure.plddt,
        workspace.structure.ca,
      )
    : candidate;
  const draggingThis = Boolean(edit && dragPreview?.edit?.id === edit.id);
  const linkerEdit =
    edit?.type === "replacement" && draggingThis && display.internal
      ? {
          ...edit,
          insertedSequence: display.internal.recommendedLinker,
          recommendedSequence: display.internal.recommendedLinker,
          anchorDistanceAngstrom: display.internal.distanceAngstrom,
        }
      : edit;
  const selected = workspace.selectedCandidateId === candidate.id;
  const statusLabel = statusText(display, edit?.status);

  return (
    <li>
      <article
        className={`card ${selected ? "selected" : ""}`}
        tabIndex={0}
        onMouseEnter={() => setHoverRange({ start: live.start, end: live.end })}
        onMouseLeave={() => setHoverRange(undefined)}
        onClick={() => {
          selectCandidate(candidate.id);
          setSelection({ start: live.start, end: live.end, source: "candidate_panel" });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectCandidate(candidate.id);
          }
        }}
      >
        <p className={`status ${edit?.status ?? ""}`}>
          <span aria-hidden="true">{statusIcon(statusLabel)}</span> {statusLabel}
        </p>
        <h3>{classLabel(display.class)} low-confidence region</h3>
        <p className="card-meta">
          {live.start}–{live.end} · {live.end - live.start + 1} aa · pLDDT{" "}
          {display.meanPlddt.toFixed(1)}
        </p>
        {adjusted && (
          <p className="adjust-note">
            Manually adjusted from the automatic proposal {candidate.start}–{candidate.end}.
          </p>
        )}
        {display.internal && (
          <details>
            <summary>Geometry</summary>
            <p>
              Anchors: {display.internal.leftAnchor} / {display.internal.rightAnchor}
            </p>
            <p>Cα distance: {display.internal.distanceAngstrom.toFixed(1)} Å</p>
            <p>Suggested linker: {display.internal.recommendedLinker || "(none)"}</p>
            <p>Linker length: {display.internal.recommendedLinkerLength} aa</p>
            <p>
              Linker/deletion ratio: {(display.internal.linkerToDeletionRatio * 100).toFixed(1)}%
            </p>
            <p>Net reduction if accepted: {display.internal.netReduction} aa</p>
          </details>
        )}
        {display.autoRecommendation === "not_beneficial" && (
          <p>Reason: required linker is &gt;=50% of removed segment</p>
        )}
        {display.autoRecommendation === "not_actionable" && (
          <p>This region covers the entire construct, so it cannot be deleted automatically.</p>
        )}
        <div className="row">
          {edit?.status === "pending" && (
            <>
              <button type="button" className="primary" onClick={() => acceptEdit(edit.id)}>
                Accept
              </button>
              <button type="button" className="ghost" onClick={() => rejectEdit(edit.id)}>
                Reject
              </button>
            </>
          )}
          {!edit &&
            (candidate.autoRecommendation === "terminal_delete" ||
              candidate.autoRecommendation === "internal_review") && (
              <button
                type="button"
                className="primary"
                onClick={(event) => {
                  event.stopPropagation();
                  applyCandidate(candidate.id);
                }}
              >
                {candidate.class === "internal" ? "Accept" : "Apply"}
              </button>
            )}
          {edit?.status === "applied" && (
            <button
              type="button"
              className="ghost"
              onClick={(event) => {
                event.stopPropagation();
                restoreEdit(edit.id);
              }}
            >
              Restore
            </button>
          )}
          {edit?.status === "rejected" && (
            <button
              type="button"
              className="ghost"
              onClick={(event) => {
                event.stopPropagation();
                restoreEdit(edit.id);
              }}
            >
              Restore
            </button>
          )}
          {adjusted && edit && (
            <button
              type="button"
              className="ghost"
              onClick={(event) => {
                event.stopPropagation();
                resetToProposal(edit.id, candidate.id);
              }}
            >
              Original proposal
            </button>
          )}
          <button
            type="button"
            className="ghost"
            onClick={(event) => {
              event.stopPropagation();
              selectCandidate(candidate.id);
              setHoverRange({ start: live.start, end: live.end });
              setSelection({
                start: live.start,
                end: live.end,
                source: "focus",
                at: Date.now(),
              });
            }}
          >
            Highlight
          </button>
        </div>
        {linkerEdit?.type === "replacement" &&
          linkerEdit.status === "applied" &&
          (linkerEdit.candidateId === candidate.id || !linkerEdit.candidateId) && (
            <LinkerEditor edit={linkerEdit} deletedLength={live.end - live.start + 1} />
          )}
      </article>
    </li>
  );
}

function editCoversCandidate(item: Edit, candidate: Candidate): boolean {
  if (item.type === "substitution") return false;
  if (item.candidateId === candidate.id) return true;
  if (item.start === candidate.start && item.end === candidate.end) return true;
  return item.start <= candidate.start && item.end >= candidate.end;
}

function classLabel(klass: Candidate["class"]): string {
  if (klass === "n_terminal") return "N-terminal";
  if (klass === "c_terminal") return "C-terminal";
  if (klass === "entire_construct") return "Entire-construct";
  return "Internal";
}

function statusText(candidate: Candidate, editStatus?: string): string {
  if (editStatus === "applied") return "Applied";
  if (editStatus === "pending") return "Review required";
  if (editStatus === "rejected") return "Rejected";
  if (candidate.autoRecommendation === "not_beneficial") return "Not recommended for replacement";
  if (candidate.autoRecommendation === "geometry_unavailable") return "Geometry unavailable";
  if (candidate.autoRecommendation === "not_actionable") return "Not actionable";
  if (candidate.autoRecommendation === "terminal_delete") return "Ready to apply";
  if (candidate.autoRecommendation === "internal_review") return "Review required";
  return "Low-confidence region";
}

function statusIcon(label: string): string {
  if (label === "Applied") return "✓";
  if (label === "Review required" || label === "Ready to apply") return "!";
  return "○";
}
