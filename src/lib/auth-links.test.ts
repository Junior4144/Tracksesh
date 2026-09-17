import { describe, it, expect } from 'vitest';
import { authCallbackPath, authDestination } from './auth-links';

describe('email navigation', () => {
  it('intercepts default callbacks before a login guard discards tokens', () => {
    expect(authCallbackPath(new URL('https://www.tracksesh.com/login#access_token=test&type=recovery')))
      .toBe('/auth/confirm#access_token=test&type=recovery');
    expect(authCallbackPath(new URL('https://tracksesh.com/#section'))).toBeNull();
  });
  it('always opens the password form for recovery', () => {
    expect(authDestination('/dashboard', true)).toBe('/account/update-password');
  });
  it('rejects external and disguised redirect destinations', () => {
    for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', '/%5cevil.example', '/%2fevil.example']) {
      expect(authDestination(next, false)).toBe('/dashboard');
    }
    expect(authDestination('/account?tab=profile', false)).toBe('/account?tab=profile');
  });
});
