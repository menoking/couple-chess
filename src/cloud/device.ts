const DEVICE_KEY = 'cfc:device-id';

/** 每台设备一个稳定标识，用于区分「同一个账号的两台手机」 */
export function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const created =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return 'dev-unknown';
  }
}
