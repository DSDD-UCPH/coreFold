import dsddLogo from "../assets/dsdd-logo.png";
import { APP_NAME, APP_TAGLINE } from "../domain";
import { useWorkspaceStore } from "../state/workspaceStore";

export function BrandMark({ className }: { className?: string }) {
  return <img src={dsddLogo} alt="" width={30} height={37} className={className ?? "brand-logo"} />;
}

export function Brand() {
  const status = useWorkspaceStore((state) => state.workspace.status);
  const goHome = useWorkspaceStore((state) => state.goHome);
  const atStart = status === "empty";

  const inner = (
    <>
      <BrandMark />
      <span className="brand-copy">
        <strong>{APP_NAME}</strong>
        <span className="muted">{APP_TAGLINE}</span>
      </span>
    </>
  );

  if (atStart) {
    return <div className="brand-home">{inner}</div>;
  }

  return (
    <button
      type="button"
      className="brand-home"
      onClick={() => goHome()}
      aria-label={APP_NAME}
      title="Return to start"
    >
      {inner}
    </button>
  );
}
