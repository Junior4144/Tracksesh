import { expect, type Page } from '@playwright/test';
import type { Tag, TimeBlock } from '../src/lib/types';

// Stateful API boundary fixture. It exercises real UI request/refresh behavior,
// but is deliberately not evidence of server validation or RLS enforcement.
export async function studyWorkspace(page: Page) {
  const user = {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'study@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  };
  let nextId = 10;
  let tags: Tag[] = ['Biology', 'Mathematics'].map((name, i) => ({
    id: i + 1,
    name,
    color: i ? 'blue' : 'aqua',
    is_archived: false,
    user_id: user.id,
    created_at: user.created_at,
  }));
  let blocks: TimeBlock[] = [];
  let running: TimeBlock | null = null;
  const reads = { blocks: 0, tags: 0 };
  const makeBlock = (patch: Partial<TimeBlock>): TimeBlock => ({
    id: nextId++,
    user_id: user.id,
    tag_id: null,
    note: null,
    started_at: new Date(Date.now() - 60000).toISOString(),
    ended_at: null,
    paused_at: null,
    paused_seconds: 0,
    source: 'timer',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...patch,
  });
  const joined = () =>
    blocks.map((block) => ({ ...block, tag: tags.find((tag) => tag.id === block.tag_id) ?? null }));
  await page.route('**/auth/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/logout')) return route.fulfill({ status: 204 });
    return route.fulfill({
      json: path.endsWith('/token')
        ? {
            access_token: 'fixture-token',
            refresh_token: 'fixture-refresh',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: 'bearer',
            user,
          }
        : user,
    });
  });
  await page.route('**/api/**', (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname,
      method = request.method();
    const data = request.postData() ? request.postDataJSON() : {};
    if (path === '/api/time') return route.fulfill({ json: { now: new Date().toISOString() } });
    if (path === '/api/admin/access') return route.fulfill({ json: { is_admin: false } });
    if (path === '/api/session/start') running = makeBlock({});
    if (path === '/api/session/pause' && running)
      running = { ...running, paused_at: new Date().toISOString() };
    if (path === '/api/session/resume' && running) running = { ...running, paused_at: null };
    if (path === '/api/session/stop' && running) {
      const stopped = { ...running, ended_at: new Date().toISOString(), paused_at: null };
      blocks.push(stopped);
      running = null;
      return route.fulfill({ json: stopped });
    }
    if (path.startsWith('/api/session')) return route.fulfill({ json: running });
    if (path === '/api/tags/usage')
      return route.fulfill({
        json: tags.map((tag) => ({
          tag_id: tag.id,
          block_count: blocks.filter((b) => b.tag_id === tag.id).length,
          total_seconds: blocks
            .filter((b) => b.tag_id === tag.id)
            .reduce(
              (sum, b) =>
                sum +
                (Date.parse(b.ended_at!) - Date.parse(b.started_at)) / 1000 -
                b.paused_seconds,
              0,
            ),
        })),
      });
    if (path === '/api/tags' && method === 'GET') {
      reads.tags++;
      return route.fulfill({
        json: tags.filter(
          (t) => url.searchParams.get('includeArchived') === 'true' || !t.is_archived,
        ),
      });
    }
    if (path === '/api/tags' && method === 'POST') {
      const tag = {
        id: nextId++,
        user_id: user.id,
        created_at: user.created_at,
        is_archived: false,
        ...data,
      };
      tags.push(tag);
      return route.fulfill({ json: tag });
    }
    if (/^\/api\/tags\/\d+$/.test(path)) {
      const id = Number(path.split('/').at(-1));
      if (method === 'DELETE') {
        tags = tags.filter((t) => t.id !== id);
        blocks = blocks.map((b) => (b.tag_id === id ? { ...b, tag_id: null } : b));
        return route.fulfill({ status: 204 });
      }
      const tag = tags.find((t) => t.id === id)!;
      Object.assign(tag, data);
      return route.fulfill({ json: tag });
    }
    if (path === '/api/blocks' && method === 'POST') {
      const block = makeBlock({ ...data, source: 'manual' });
      blocks.push(block);
      return route.fulfill({ json: block });
    }
    if (/^\/api\/blocks\/\d+$/.test(path)) {
      const id = Number(path.split('/').at(-1));
      if (method === 'DELETE') blocks = blocks.filter((b) => b.id !== id);
      if (method === 'PATCH') blocks = blocks.map((b) => (b.id === id ? { ...b, ...data } : b));
      return route.fulfill({ status: 204 });
    }
    if (path.startsWith('/api/blocks')) {
      reads.blocks++;
      return route.fulfill({ json: joined() });
    }
    return route.fulfill({
      status: 404,
      json: { message: `Unmocked endpoint: ${method} ${path}` },
    });
  });
  await page.goto('/login');
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
  return { user, reads, getTags: () => tags, getBlocks: () => blocks };
}
