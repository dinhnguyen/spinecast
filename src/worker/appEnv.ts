import type { UserDto } from '../shared/apiTypes';
import type { DeviceRow } from './db/devices';
import type { Env } from './env';

export interface AppVariables {
  user: UserDto;
  device: DeviceRow | null;
}

export type AppEnv = { Bindings: Env; Variables: AppVariables };
