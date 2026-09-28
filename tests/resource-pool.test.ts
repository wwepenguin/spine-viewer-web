import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResourcePool } from '../src/resource-pool';
test('concurrent instances share a resource and only the last release destroys it', async () => {
  let created = 0,
    destroyed = 0;
  const pool = new ResourcePool<string, object>(() => destroyed++);
  const create = async () => {
    created++;
    return {};
  };
  const [a, b] = await Promise.all([pool.acquire('page', create), pool.acquire('page', create)]);
  assert.equal(created, 1);
  assert.equal(a.value, b.value);
  a.release();
  a.release();
  assert.equal(destroyed, 0);
  b.release();
  assert.equal(destroyed, 1);
  const c = await pool.acquire('page', create);
  assert.equal(created, 2);
  c.release();
});
test('failed loads retry and invalidated resources do not evict their replacement', async () => {
  const disposed: number[] = [],
    pool = new ResourcePool<string, { mode: number }>((r) => disposed.push(r.mode));
  await assert.rejects(
    pool.acquire('key', async () => {
      throw Error('decode');
    }),
  );
  const a = await pool.acquire('key', async () => ({ mode: 1 }));
  a.value.mode = 2;
  const b = await pool.acquire(
    'key',
    async () => ({ mode: 1 }),
    (r) => r.mode === 1,
  );
  a.release();
  const c = await pool.acquire('key', async () => ({ mode: 99 }));
  assert.equal(b.value, c.value);
  b.release();
  c.release();
  assert.deepEqual(disposed, [2, 1]);
});
