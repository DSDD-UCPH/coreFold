import { START_PAGE_TIPS, TIPS_INTRO } from "./tipsContent";

export function StartPageTips({ onOpenTips }: { onOpenTips: () => void }) {
  return (
    <section className="start-tips" aria-label="Before you start">
      <h2>Before you start</h2>
      <p>{TIPS_INTRO}</p>
      <ul>
        {START_PAGE_TIPS.map((tip) => (
          <li key={tip.id}>
            <strong>{tip.headline}</strong>
          </li>
        ))}
      </ul>
      <button type="button" className="ghost" onClick={onOpenTips}>
        Read all tips
      </button>
    </section>
  );
}
