export const TIPS_SEEN_COOKIE = "corefold.tips-seen";
const TIPS_SEEN_VALUE = "1";
const TIPS_SEEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 10;

function cookieStore(): string | undefined {
  try {
    return document.cookie;
  } catch {
    return undefined;
  }
}

export function hasSeenTips(): boolean {
  const cookies = cookieStore();
  if (!cookies) return false;
  return cookies.split(";").some((part) => {
    const [name, value] = part.trim().split("=");
    return name === TIPS_SEEN_COOKIE && value === TIPS_SEEN_VALUE;
  });
}

export function markTipsSeen(): void {
  try {
    document.cookie = `${TIPS_SEEN_COOKIE}=${TIPS_SEEN_VALUE}; path=/; max-age=${TIPS_SEEN_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {
    // Ignore cookie failures in restricted browsing contexts.
  }
}
