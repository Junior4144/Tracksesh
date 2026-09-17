/** Default Supabase emails return tokens in the fragment, on any allowed URL. */
export function authCallbackPath(url: URL): string | null {
  const hash = new URLSearchParams(url.hash.slice(1));
  if (hash.has('access_token') || hash.has('error') || hash.has('error_code') || url.searchParams.has('code') || url.searchParams.has('error')) {
    return `/auth/confirm${url.search}${url.hash}`;
  }
  return null;
}

export function authDestination(next: string | null, recovery: boolean): string {
  if (recovery) return '/account/update-password';
  // Reject backslashes and protocol-relative URLs, including encoded variants.
  if (!next?.startsWith('/') || next.startsWith('//') || /[\\\s]/.test(next)) return '/dashboard';
  try {
    const decoded = decodeURIComponent(next);
    if (decoded.startsWith('//') || /[\\\s]/.test(decoded)) return '/dashboard';
    const url = new URL(next, 'https://app.invalid');
    return url.origin === 'https://app.invalid' ? url.pathname + url.search : '/dashboard';
  } catch { return '/dashboard'; }
}
