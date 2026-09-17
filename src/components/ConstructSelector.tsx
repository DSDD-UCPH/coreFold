import { type MouseEvent } from "react";
import { constructFromFeatureIds, featureChoiceName, SELECTABLE_FEATURE_TYPES, selectableFeatures } from "../domain";
import {
  constructFeatureIds,
  domainOptions,
  useWorkspaceStore,
} from "../state/workspaceStore";

export function ConstructSelector() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const switchConstruct = useWorkspaceStore((state) => state.switchConstruct);
  if (workspace.status !== "ready") return null;
  const options = domainOptions(workspace.protein);
  const selectable = SELECTABLE_FEATURE_TYPES.flatMap((type) =>
    selectableFeatures(workspace.protein).filter((feature) => feature.type === type),
  );
  const selectedIds = constructFeatureIds(workspace.construct);

  const applyIds = (ids: string[]) => {
    if (ids.length === 0) {
      switchConstruct(options[0]);
      return;
    }
    switchConstruct(constructFromFeatureIds(workspace.protein, ids));
  };

  const onFeatureClick = (event: MouseEvent<HTMLButtonElement>, id: string) => {
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    const next = additive
      ? selectedIds.includes(id)
        ? selectedIds.filter((item) => item !== id)
        : [...selectedIds, id]
      : [id];
    applyIds([...new Set(next)]);
  };

  return (
    <div className="construct-bar">
      <h2 id="construct-heading">Active construct</h2>
      <ul className="choice-list" aria-labelledby="construct-heading">
        <li>
          <button
            type="button"
            className="choice"
            aria-pressed={workspace.construct.kind === "full_length"}
            onClick={() => applyIds([])}
          >
            Full length
          </button>
        </li>
        {selectable.map((feature) => {
          const selected = selectedIds.includes(feature.id);
          return (
            <li key={feature.id}>
              <button
                type="button"
                className="choice"
                aria-pressed={selected}
                onClick={(event) => onFeatureClick(event, feature.id)}
              >
                {featureChoiceName(feature)} ({feature.start}–{feature.end})
              </button>
            </li>
          );
        })}
      </ul>
      <span className="construct-meta muted">
        {workspace.construct.start}–{workspace.construct.end} ·{" "}
        {workspace.construct.end - workspace.construct.start + 1} aa · {workspace.construct.label}
      </span>
    </div>
  );
}
