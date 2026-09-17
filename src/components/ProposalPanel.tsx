import { classifyCandidate } from "../domain/candidates";
import { useWorkspaceStore } from "../state/workspaceStore";
import { useInteractionStore } from "../state/interactionStore";
import { CandidateCard } from "./CandidateCard";

export function ProposalPanel() {
  const status = useWorkspaceStore((state) => state.workspace.status);
  const candidateCount = useWorkspaceStore((state) =>
    state.workspace.status === "ready" ? state.workspace.candidates.length : 0,
  );
  if (status !== "ready") return null;
  return (
    <section className="proposal">
      <header>
        <h2>Automatic proposal</h2>
      </header>
      {candidateCount === 0 && (
        <p className="muted">No low-confidence regions met the current detection settings.</p>
      )}
      <CandidateList />
      <UserEditList />
    </section>
  );
}

function CandidateList() {
  const candidates = useWorkspaceStore((state) =>
    state.workspace.status === "ready" ? state.workspace.candidates : [],
  );
  return (
    <ul>
      {candidates.map((candidate) => (
        <CandidateCard key={candidate.id} candidate={candidate} />
      ))}
    </ul>
  );
}

function UserEditList() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const restoreEdit = useWorkspaceStore((state) => state.restoreEdit);
  const acceptEdit = useWorkspaceStore((state) => state.acceptEdit);
  const rejectEdit = useWorkspaceStore((state) => state.rejectEdit);
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const setHoverRange = useInteractionStore((state) => state.setHoverRange);
  if (workspace.status !== "ready") return null;
  const extras = workspace.edits.filter((edit) => {
    if (edit.candidateId) return false;
    if (edit.type === "substitution") return false;
    if (edit.source !== "user" && edit.source !== "share_link") return false;
    return !workspace.candidates.some(
      (candidate) => edit.start <= candidate.start && edit.end >= candidate.end,
    );
  });
  if (extras.length === 0) return null;
  return (
    <div className="user-edits">
      <h3>Custom edits</h3>
      <ul>
        {extras.map((edit) => {
          const start = edit.type === "substitution" ? edit.position : edit.start;
          const end = edit.type === "substitution" ? edit.position : edit.end;
          const klass =
            edit.type === "substitution" ? undefined : classifyCandidate(edit, workspace.construct);
          const label =
            edit.type === "replacement" && end < start
              ? `Insertion after ${start - 1}`
              : klass === "n_terminal"
                ? `N-terminal custom trim ${start}–${end}`
                : klass === "c_terminal"
                  ? `C-terminal custom trim ${start}–${end}`
                  : `Residues ${start}–${end}`;
          return (
            <li key={edit.id} className="card">
              <p className={`status ${edit.status}`}>{edit.status}</p>
              <p>{label}</p>
              {edit.type === "replacement" && edit.insertedSequence && (
                <p>Linker: {edit.insertedSequence}</p>
              )}
              <div className="row">
                {edit.status === "pending" && (
                  <>
                    <button type="button" className="primary" onClick={() => acceptEdit(edit.id)}>
                      Accept
                    </button>
                    <button type="button" className="ghost" onClick={() => rejectEdit(edit.id)}>
                      Reject
                    </button>
                  </>
                )}
                {(edit.status === "applied" || edit.status === "rejected") && (
                  <button type="button" className="ghost" onClick={() => restoreEdit(edit.id)}>
                    Restore
                  </button>
                )}
                <button
                  type="button"
                  className="ghost"
                  onMouseEnter={() => setHoverRange({ start: Math.min(start, end), end: Math.max(start, end) })}
                  onMouseLeave={() => setHoverRange(undefined)}
                  onClick={() =>
                    setSelection({
                      start: Math.min(start, end),
                      end: Math.max(start, end),
                      source: "focus",
                      at: Date.now(),
                    })
                  }
                >
                  Highlight
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
