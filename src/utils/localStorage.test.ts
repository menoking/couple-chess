import { beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

async function loadStorageModule(store: MemoryStorage) {
  vi.resetModules();
  vi.stubGlobal('localStorage', store);
  vi.stubGlobal('window', {
    location: { search: '' },
    clearTimeout: (id: number) => clearTimeout(id)
  });
  return import('./localStorage');
}

describe('queued localStorage writes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('persists multiple keys queued in the same idle window', async () => {
    const store = new MemoryStorage();
    const storage = await loadStorageModule(store);
    storage.saveToStorage('a', { value: 1 });
    storage.saveToStorage('b', { value: 2 });
    vi.advanceTimersByTime(500);
    expect(store.getItem('cfc:a')).toBe('{"value":1}');
    expect(store.getItem('cfc:b')).toBe('{"value":2}');
  });

  it('an immediate write removes the older delayed value for the same key', async () => {
    const store = new MemoryStorage();
    const storage = await loadStorageModule(store);
    storage.saveToStorage('same', 'old');
    storage.saveToStorageNow('same', 'new');
    vi.advanceTimersByTime(1000);
    expect(store.getItem('cfc:same')).toBe('"new"');
  });

  it('delete, import and logout clear conflicting pending writes', async () => {
    const store = new MemoryStorage();
    const storage = await loadStorageModule(store);
    storage.saveToStorage('delete-me', 'old');
    storage.removeFromStorage('delete-me');
    storage.saveToStorage('imported', 'old');
    storage.importLocalBackup({
      version: 1,
      exportedAt: new Date(0).toISOString(),
      sandbox: false,
      entries: { imported: '"new"' }
    });
    storage.saveToStorage('couples-ludo-game-state', 'old-session');
    storage.resetLocalState();
    vi.advanceTimersByTime(1000);
    expect(store.getItem('cfc:delete-me')).toBeNull();
    expect(store.getItem('cfc:imported')).toBe('"new"');
    expect(store.getItem('cfc:couples-ludo-game-state')).toBeNull();
  });
});
