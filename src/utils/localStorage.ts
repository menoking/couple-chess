let idleSaveTimer: number | null = null;
let pendingSave: { key: string; value: unknown } | null = null;

/**
 * 存储命名空间：
 * - 正式：cfc:<key>
 * - 沙盒（URL 带 ?sandbox=1）：cfc:sandbox:<key>
 * 沙盒与正式数据完全隔离，用于双设备/联机测试。
 */
const SCOPE_PREFIX = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has('sandbox') ? 'cfc:sandbox:' : 'cfc:';
  } catch {
    return 'cfc:';
  }
})();

/** 旧版本使用的裸键，迁移时只读不删 */
const LEGACY_KEYS = new Set(['couples-ludo-game-state', 'couples-ludo-roulette-intensity']);

export const isSandbox = SCOPE_PREFIX !== 'cfc:';

function resolveKey(key: string): string {
  return key.startsWith('cfc:') ? key : `${SCOPE_PREFIX}${key}`;
}

/** 首次启动把旧键复制到新命名空间，旧键保留以便回滚 */
function migrateLegacyKey(key: string): void {
  if (isSandbox) return;
  if (!LEGACY_KEYS.has(key)) return;
  try {
    const scoped = `${SCOPE_PREFIX}${key}`;
    if (localStorage.getItem(scoped) !== null) return;
    const legacy = localStorage.getItem(key);
    if (legacy !== null) localStorage.setItem(scoped, legacy);
  } catch (error) {
    console.error('Error migrating localStorage key:', error);
  }
}

function flushPendingSave() {
  if (!pendingSave) return;
  const { key, value } = pendingSave;
  pendingSave = null;
  try {
    localStorage.setItem(resolveKey(key), JSON.stringify(value));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
}

export function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    migrateLegacyKey(key);
    const item = localStorage.getItem(resolveKey(key));
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('Error loading from localStorage:', error);
    return defaultValue;
  }
}

/**
 * 延迟 + 空闲时写入，避免在主线程同步序列化大对象（INP 问题）。
 * 保留同步语义对外不变：调用方无需等待。
 */
export function saveToStorage<T>(key: string, value: T): void {
  pendingSave = { key, value: value as unknown };

  if (idleSaveTimer !== null) return;

  const run = () => {
    idleSaveTimer = null;
    flushPendingSave();
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    idleSaveTimer = window.requestIdleCallback(run, { timeout: 2000 });
  } else {
    idleSaveTimer = setTimeout(run, 500) as unknown as number;
  }
}

export function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(resolveKey(key));
  } catch (error) {
    console.error('Error removing from localStorage:', error);
  }
}

export interface LocalBackup {
  version: 1;
  exportedAt: string;
  sandbox: boolean;
  entries: Record<string, string>;
}

/** 导出当前命名空间下可备份的数据 */
export function exportLocalBackup(): LocalBackup {
  const entries: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const rawKey = localStorage.key(i);
      if (!rawKey) continue;
      if (!rawKey.startsWith(SCOPE_PREFIX)) continue;
      const value = localStorage.getItem(rawKey);
      if (value !== null) entries[rawKey.slice(SCOPE_PREFIX.length)] = value;
    }
  } catch (error) {
    console.error('Error exporting localStorage:', error);
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sandbox: isSandbox,
    entries
  };
}

/** 导入备份，返回成功写入的条目数 */
export function importLocalBackup(backup: LocalBackup): number {
  if (!backup || backup.version !== 1 || typeof backup.entries !== 'object') {
    throw new Error('备份文件格式不正确');
  }
  let count = 0;
  for (const [key, value] of Object.entries(backup.entries)) {
    try {
      localStorage.setItem(`${SCOPE_PREFIX}${key}`, value);
      count += 1;
    } catch (error) {
      console.error('Error importing key:', key, error);
    }
  }
  return count;
}
