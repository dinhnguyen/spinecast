import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { createUserAndLogin, firstDeviceId, jsonRequest, login } from '../../../test/helpers';
import type { DevicesDto } from '../../shared/apiTypes';

const list = async (cookie: string): Promise<DevicesDto> => {
  const res = await app.request('/api/devices', { headers: { cookie } }, env);
  expect(res.status).toBe(200);
  return res.json();
};

describe('devices api', () => {
  it('lists devices and marks the one backing this session', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const mine = await firstDeviceId(env, user.id);
    const body = await list(cookie);
    expect(body.devices).toHaveLength(1);
    expect(body.devices[0]!.id).toBe(mine);
    expect(body.devices[0]!.current).toBe(true);
  });

  it('renames a device', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const id = await firstDeviceId(env, user.id);
    const res = await app.request(...jsonRequest(`/api/devices/${id}`, 'PATCH', { name: 'Laptop' }, cookie), env);
    expect(res.status).toBe(200);
    expect((await list(cookie)).devices[0]!.name).toBe('Laptop');
  });

  it('rejects an empty or overlong name', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const id = await firstDeviceId(env, user.id);
    for (const name of ['', 'x'.repeat(65)]) {
      const res = await app.request(...jsonRequest(`/api/devices/${id}`, 'PATCH', { name }, cookie), env);
      expect(res.status).toBe(400);
    }
  });

  it('rejects a literal null body with 400 instead of 500', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const id = await firstDeviceId(env, user.id);
    const res = await app.request(...jsonRequest(`/api/devices/${id}`, 'PATCH', null, cookie), env);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('validation');
  });

  it('refuses to delete the device backing this session', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const id = await firstDeviceId(env, user.id);
    const res = await app.request(`/api/devices/${id}`, { method: 'DELETE', headers: { cookie } }, env);
    expect(res.status).toBe(400);
  });

  it('deletes another device of the same user', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await login(env, user.email, user.password);
    const before = await list(cookie);
    const other = before.devices.find((d) => !d.current)!;
    const res = await app.request(`/api/devices/${other.id}`, { method: 'DELETE', headers: { cookie } }, env);
    expect(res.status).toBe(204);
    expect((await list(cookie)).devices).toHaveLength(1);
  });

  it('404s on another user device', async () => {
    const other = await createUserAndLogin(env);
    const otherId = await firstDeviceId(env, other.user.id);
    const { cookie } = await createUserAndLogin(env);
    const res = await app.request(...jsonRequest(`/api/devices/${otherId}`, 'PATCH', { name: 'Stolen' }, cookie), env);
    expect(res.status).toBe(404);
  });
});
