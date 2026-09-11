import type { Position } from './position';

export type Locale = 'vi' | 'en';
export const LOCALES: readonly Locale[] = ['vi', 'en'];

export type ApiErrorCode =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_credentials'
  | 'invite_invalid'
  | 'email_taken'
  | 'rate_limited'
  | 'not_epub'
  | 'too_large'
  | 'duplicate'
  | 'challenge_expired'
  | 'not_configured'
  | 'internal'
  | 'http_error'
  | 'file_error'
  | 'blocked_host'
  | 'catalog_auth'
  | 'catalog_unreachable'
  | 'not_opds'
  | 'bad_feed'
  | 'account_disabled'
  | 'self_action'
  | 'reset_invalid'
  | 'reset_expired'
  | 'invite_used'
  | `sync_${string}`;

export interface UserDto {
  id: string;
  slug: string;
  email: string;
  role: 'admin' | 'user';
  locale: Locale;
  deviceId: string | null;
}

export interface AdminUserDto {
  id: string; email: string; role: 'admin' | 'user';
  createdAt: number; disabledAt: number | null;
  bookCount: number; bytesUsed: number; passkeyCount: number;
  lastSeenAt: number | null;
}

export type AdminUserDetailDto = AdminUserDto & { devices: DeviceDto[]; passkeys: PasskeyDto[] };

export type AdminUserPatch = { role: 'admin' | 'user' } | { disabled: boolean };

export interface AdminOverviewDto {
  users: number; books: number; blobs: number; blobBytes: number;
  orphanBlobRows: number; orphanObjects: number;
}

export interface AdminCleanupDto { deletedRows: number; deletedObjects: number }

export type AdminBookSort = 'size' | 'owner' | 'shared';

export interface AdminBookDto {
  id: string;
  ownerId: string;
  ownerEmail: string;
  filename: string;
  filesize: number;
  shared: boolean;
  blobHash: string | null;
  blobRefs: number;
  createdAt: number;
}

export interface AdminBooksPageDto { items: AdminBookDto[]; nextCursor: string | null }

export interface ResetCodeDto { code: string; expiresAt: number }

export interface ResetPasswordInput { code: string; password: string }
export interface ChangePasswordInput { current: string; password: string; signOutOthers: boolean }

export interface UpdateMeInput {
  locale?: Locale;
  timezone?: string;
}

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}

export interface InviteDto {
  code: string;
  expiresAt: number;
  usedBy: string | null;
  usedByEmail: string | null;
  createdAt: number;
}

export interface ProgressDto {
  pctQ: number;
  spine: number;
  xpath?: string;
  para?: number;
  anchor?: string;
  page?: number;
  pages?: number;
  updatedAt: number;
  lastPushedAt: number | null;
  deviceId: string | null;
  observedAt: number | null;
}

export interface BookDto {
  id: string;
  title: string;
  author: string;
  filename: string;
  filesize: number;
  hasCover: boolean;
  shared: boolean;
  hashPartial: string;
  hashFilename: string;
  createdAt: number;
  lastOpenedAt: number | null;
  progress: ProgressDto | null;
}

export interface RemoteProgressDto {
  document: string;
  percentage: number;
  progress: string;
  device: string;
  deviceId: string;
  timestamp: number;
  position: Position | null;
}

export interface ProgressResponse {
  local: ProgressDto | null;
  remote: RemoteProgressDto | null;
  syncError: string | null;
}

export interface PutProgressResponse {
  local: ProgressDto;
  pushed: boolean;
  syncError: string | null;
}

export type HashMethod = 'partial' | 'filename';

export interface SyncSettingsDto {
  enabled: boolean;
  serverUrl: string;
  username: string;
  hasCredentials: boolean;
  hashMethod: HashMethod;
  lastOkAt: number | null;
  lastError: string | null;
}

export interface RemoteDocumentDto {
  document: string;
  title: string | null;
  author: string | null;
  filename: string | null;
  percentage: number;
  progress: string;
  deviceId: string;
  device: string;
  timestamp: number;
  bookId: string | null;
}

export interface SyncSettingsInput {
  enabled: boolean;
  serverUrl: string;
  username: string;
  password?: string;
  hashMethod: HashMethod;
}

export type OpdsScope = 'library' | 'public';

export interface OpdsTokenDto {
  createdAt: number;
  lastUsedAt: number | null;
  revealable: boolean;
}

export interface OpdsTokensDto {
  library: OpdsTokenDto | null;
  public: OpdsTokenDto | null;
  sharedCount: number;
}

export interface OpdsTokenCreatedDto {
  scope: OpdsScope;
  token: string;
  url: string;
}

export interface OpdsCatalogDto {
  id: string;
  name: string;
  url: string;
  username: string;
  hasCredentials: boolean;
  createdAt: number;
  lastOkAt: number | null;
  lastError: string | null;
}

export interface OpdsLinkDto {
  rel: string;
  href: string;
  type: string;
  title: string;
  content: string;
}

export interface OpdsEntryDto {
  id: string;
  title: string;
  author: string;
  summary: string;
  acquisition: string | null;
  coverHref: string | null;
  inLibrary: string | null;
}

export interface OpdsFeedDto {
  title: string;
  nav: OpdsLinkDto[];
  entries: OpdsEntryDto[];
  next: string | null;
  searchTemplate: string | null;
}

export interface DeviceDto {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

export interface DevicesDto {
  devices: DeviceDto[];
}

export interface RenameDeviceInput {
  name: string;
}

export interface BookmarkDto {
  id: string;
  xpath: string;
  percentage: number;
  summary: string | null;
  si: number | null;
  chapter: string | null;
  updatedAt: number;
}

export interface BookmarksDto {
  bookmarks: BookmarkDto[];
}

export interface CreateBookmarkInput {
  xpath: string;
  percentage: number;
  summary?: string;
  si?: number;
  chapter?: string;
}

export interface BookmarkSyncResponse {
  bookmarks: BookmarkDto[];
  syncError: string | null;
}

export interface ClippingDto {
  id: string;
  spine: number | null;
  para: number | null;
  chapter: string | null;
  text: string;
  note: string | null;
  color: string | null;
  cfi: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ClippingsDto {
  clippings: ClippingDto[];
}

export interface CreateClippingInput {
  text: string;
  spine?: number;
  para?: number;
  chapter?: string;
  color?: string;
  note?: string;
  cfi?: string;
}

export interface UpdateClippingInput {
  note?: string | null;
  color?: string;
  cfi?: string;
}

export interface ClippingSyncResponse {
  clippings: ClippingDto[];
  syncError: string | null;
}

export interface ReadingSessionInput {
  sessionId: string | null;
  turns: number;
}

export interface ReadingSessionDto {
  sessionId: string | null;
}

export interface StatsDto {
  sessions: number;
  seconds: number;
  pages: number;
  completed: number;
  tod: number[];
  dow: number[];
  anchorDay: number;
  historyB64: string;
  minutesB64: string;
  streak: number;
  currentStreak: number;
  timezone: string;
}

export interface PasskeyDto {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
}
