import type { ReplacementEdit } from "../domain/types";
import { isGlycineSerineLinker } from "../domain/linkers";
import { useWorkspaceStore } from "../state/workspaceStore";

export function LinkerEditor({
  edit,
  deletedLength,
}: {
  edit: ReplacementEdit;
  deletedLength: number;
}) {
  const setLinker = useWorkspaceStore((state) => state.setLinker);
  const recommended = edit.recommendedSequence ?? "";
  const current = edit.insertedSequence;
  const tooShort = recommended.length > 0 && current.length < recommended.length;
  const weak = current.length >= 0.5 * deletedLength;

  return (
    <div className="linker-editor">
      <p>Recommended length: {recommended.length} aa</p>
      <p>Current length: {current.length} aa</p>
      <label>
        Linker sequence
        <input
          value={current}
          onChange={(event) => {
            const next = event.target.value.toUpperCase();
            if (isGlycineSerineLinker(next)) setLinker(edit.id, next);
          }}
          aria-label="Linker sequence, G and S only"
        />
      </label>
      <button type="button" onClick={() => setLinker(edit.id, recommended)}>
        Use recommended
      </button>
      {tooShort && (
        <p className="warn">Custom linker is shorter than the geometric recommendation.</p>
      )}
      {weak && (
        <p className="warn">Custom linker is &gt;=50% of the removed sequence, so minification benefit is weak.</p>
      )}
    </div>
  );
}
