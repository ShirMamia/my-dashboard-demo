// Route rules for the auth redirect in proxy.ts. Pure, so they can be unit-tested.

export const LOGIN_PATH = "/login";
export const HOME_PATH = "/";

const PUBLIC_PATHS = [LOGIN_PATH];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Only same-origin, absolute paths are accepted as a post-login destination,
 * so `next` can't become an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return HOME_PATH;
  }
  if (isPublicPath(next.split(/[?#]/, 1)[0] ?? "")) return HOME_PATH;
  return next;
}

/** Where to redirect, or null to continue. */
export function authRedirect(
  pathname: string,
  search: string,
  isAuthenticated: boolean,
): string | null {
  if (!isAuthenticated && !isPublicPath(pathname)) {
    const params = new URLSearchParams();
    if (pathname !== HOME_PATH) params.set("next", `${pathname}${search}`);
    const query = params.toString();
    return query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH;
  }
  if (isAuthenticated && pathname === LOGIN_PATH) return HOME_PATH;
  return null;
}
