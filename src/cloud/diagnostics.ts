/**
 * 只读诊断层：把「登录 → 小屋 → 开局分支 → 房间选举 → 传输」的关键状态
 * 记成一份可复制的快照，方便在两台真机上比对。
 *
 * 刻意不写任何业务判断：这里只收集信息，不改变流程。
 */
export const BUILD_TAG = 'rules-20261114-9';

export interface DiagnosticEvent {
  t: number;
  step: string;
  detail: Record<string, unknown>;
}

export interface DiagnosticContext {
  configured: boolean;
  host: string | null;
  userId: string | null;
  username: string;
  spaceId: string | null;
  deviceId: string | null;
  sandbox: boolean;
  gameMode: string | null;
  onlineModeAvailable: boolean;
  onlineSession: { roomId: string; mode: string; isHost: boolean } | null;
  roomStatus: string | null;
  roomError: string | null;
  presence: number[];
  viewReady: boolean;
  cloudError: string | null;
  syncStatus: string | null;
  syncError: string | null;
  lastStart: { at: number; branch: string; reason: string } | null;
}

const context: DiagnosticContext = {
  configured: false,
  host: null,
  userId: null,
  username: '',
  spaceId: null,
  deviceId: null,
  sandbox: false,
  gameMode: null,
  onlineModeAvailable: false,
  onlineSession: null,
  roomStatus: null,
  roomError: null,
  presence: [],
  viewReady: false,
  cloudError: null,
  syncStatus: null,
  syncError: null,
  lastStart: null
};

const events: DiagnosticEvent[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach(listener => listener());
}

export function setDiagnosticContext(patch: Partial<DiagnosticContext>): void {
  Object.assign(context, patch);
  notify();
}

export function diagLog(step: string, detail: Record<string, unknown> = {}): void {
  events.push({ t: Date.now(), step, detail });
  if (events.length > 60) events.shift();
  notify();
}

export function diagnosticSnapshot() {
  return {
    build: BUILD_TAG,
    at: new Date().toISOString(),
    ...context,
    events: events.slice(-14)
  };
}

export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function diagnosticsAsText(): string {
  return JSON.stringify(diagnosticSnapshot(), null, 2);
}

/** 手机上一键复制，方便直接把快照贴过来比对 */
export async function copyDiagnostics(): Promise<boolean> {
  const text = diagnosticsAsText();
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 非安全上下文下退回到 execCommand
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}

export function shortId(value: string | null | undefined, length = 8): string {
  return value ? value.slice(0, length) : '—';
}

export function clockTime(t: number): string {
  return new Date(t).toLocaleTimeString('zh-CN', { hour12: false });
}
