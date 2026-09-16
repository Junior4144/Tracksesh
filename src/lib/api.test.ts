import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('./supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({ auth }),
}));

describe('API transport', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } });
    auth.signOut.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('attaches credentials and serializes a write once', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.post('/blocks', { note: 'Reading' })).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      '/api/blocks',
      expect.objectContaining({
        method: 'POST',
        body: '{"note":"Reading"}',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      }),
    );
  });
  it('explains a network failure without replaying the write', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.post('/session/start')).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('Cannot reach'),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it('rejects a proxy HTML response instead of treating it as session data', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Proxy error</html>'));
    await expect(api.get('/session')).rejects.toThrow('unexpected response');
  });
  it('preserves a validation error without ending the session', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: 'A tag needs a name.' }, { status: 400 }));
    await expect(api.post('/tags')).rejects.toMatchObject({
      status: 400,
      message: 'A tag needs a name.',
    });
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it('ends a rejected authenticated session', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(api.get('/session')).rejects.toMatchObject({ status: 401 });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });
  it.each([429, 503])('provides a useful fallback for status %s', async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await expect(api.get('/session')).rejects.toMatchObject({
      status,
      message: expect.stringMatching(/try again/i),
    });
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it('accepts an empty successful transition', async () => {
    fetchMock.mockResolvedValue(new Response(''));
    await expect(api.post('/session/pause')).resolves.toBeNull();
  });
});
