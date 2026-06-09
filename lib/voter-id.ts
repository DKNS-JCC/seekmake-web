// Stable per-browser identity for anonymous voting.
// Stored in BOTH localStorage and a long-lived cookie so clearing one
// surface alone doesn't reset the user's vote history. Cleaning out all
// site storage still resets it — that's the limit of cookie-based identity
// without real login.

const COOKIE_NAME = '3dcc_voter';
const STORAGE_KEY = '3dcc-voter-id';
const FIVE_YEARS_SECS = 60 * 60 * 24 * 365 * 5;

export function getOrCreateVoterId(): string {
  if (typeof window === 'undefined') return '';

  // 1. Prefer localStorage (fastest read, can hold UUID after cookie wipe).
  let id: string | null = null;
  try {
    id = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* private mode / disabled storage */
  }

  // 2. Fall back to cookie.
  if (!id) id = readCookie(COOKIE_NAME);

  // 3. First visit: generate a fresh UUID.
  if (!id || !isUuid(id)) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : pseudoUuid();
  }

  // Always sync both stores so they survive the loss of either one.
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  document.cookie = `${COOKIE_NAME}=${id}; max-age=${FIVE_YEARS_SECS}; path=/; samesite=lax`;

  return id;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name + '=([^;]+)')
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// Fallback for very old browsers without crypto.randomUUID.
function pseudoUuid(): string {
  const r = () => Math.random().toString(16).slice(2, 10);
  return `${r()}-${r().slice(0, 4)}-4${r().slice(0, 3)}-${r().slice(0, 4)}-${r()}${r().slice(0, 4)}`;
}
