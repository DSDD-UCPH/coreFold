import { hasSeenTips, markTipsSeen, TIPS_SEEN_COOKIE } from "./tipsSeen";

function clearTipsCookie() {
  document.cookie = `${TIPS_SEEN_COOKIE}=; path=/; max-age=0`;
}

describe("tipsSeen cookie", () => {
  beforeEach(() => {
    clearTipsCookie();
  });

  it("treats a missing cookie as a first visit", () => {
    expect(hasSeenTips()).toBe(false);
  });

  it("records that the start-page tips were seen", () => {
    markTipsSeen();
    expect(hasSeenTips()).toBe(true);
    expect(document.cookie).toContain(`${TIPS_SEEN_COOKIE}=1`);
  });
});
