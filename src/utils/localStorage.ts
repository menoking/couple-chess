let idleSaveTimer: number | null = null;
let pendingSave: { key: string; value: unknown } | null = null;

function flushPendingSave() {
  if (!pendingSave) return;
  const { key, value } = pendingSave;
  pendingSave = null;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
}

export function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
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
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Error removing from localStorage:', error);
  }
}
