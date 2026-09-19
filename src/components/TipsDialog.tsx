import { useEffect } from "react";
import { TIPS, TIPS_INTRO, TIPS_TITLE } from "./tipsContent";

export function TipsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal tips-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tips-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tips-modal-body">
          <h2 id="tips-title">{TIPS_TITLE}</h2>
          <p>{TIPS_INTRO}</p>
          <ul>
            {TIPS.map((tip) => (
              <li key={tip.id}>
                <strong>{tip.headline}</strong> {tip.body}
                {tip.link && (
                  <>
                    {" "}
                    <a href={tip.link.href} target="_blank" rel="noopener noreferrer">
                      {tip.link.label}
                    </a>
                    .
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="row">
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
