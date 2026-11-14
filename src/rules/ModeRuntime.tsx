import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from 'react';
import type { Seat } from './types';
import { seatScopedKey } from './registry';

export interface ModeRuntimeValue {
  seat: Seat;
  /** 只有权威端可以跑计时器 */
  authority: boolean;
  get: (key: string) => unknown;
  patch: (key: string, value: unknown) => void;
  subscribe: (listener: () => void) => () => void;
  getVersion: () => number;
  /** 玩法视图读取共享的 turn / players / themes 用 */
  snapshot: () => unknown;
}

const ModeRuntimeContext = createContext<ModeRuntimeValue | null>(null);

export function ModeRuntimeProvider({
  value,
  children
}: {
  value: ModeRuntimeValue;
  children: ReactNode;
}) {
  return <ModeRuntimeContext.Provider value={value}>{children}</ModeRuntimeContext.Provider>;
}

/** 联机时判断「现在是不是我的回合」；同屏（无 runtime）永远为 true。 */
export function useMyTurn(currentTurn: number): boolean {
  const runtime = useModeRuntime();
  if (!runtime) return true;
  return runtime.seat === currentTurn;
}

export function useModeRuntime(): ModeRuntimeValue | null {
  return useContext(ModeRuntimeContext);
}

/** 供计时类视图判断自己是否该跑表；同屏恒为 true。 */
export function useModeAuthority(): boolean {
  return useContext(ModeRuntimeContext)?.authority ?? true;
}

const noopSubscribe = () => () => undefined;
const noopVersion = () => 0;

/** 结构化克隆下 Set/Map 会丢，统一用标记对象序列化。 */
export function serializeValue(value: unknown): unknown {
  if (value instanceof Set) return { __cfc: 'set', values: Array.from(value) };
  if (value instanceof Map) return { __cfc: 'map', values: Array.from(value.entries()) };
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, serializeValue(item)])
    );
  }
  return value;
}

export function reviveValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.__cfc === 'set') return new Set((record.values as unknown[]) ?? []);
    if (record.__cfc === 'map') return new Map((record.values as Array<[unknown, unknown]>) ?? []);
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, reviveValue(item)])
    );
  }
  return value;
}

function resolveInitial<T>(initial: T | (() => T)): T {
  return typeof initial === 'function' ? (initial as () => T)() : initial;
}

/**
 * 与 useState 同签名的共享状态 hook，是「同屏 / 联机共用同一份玩法代码」的关键：
 * - 没有 Provider（非登录态、单机同屏）→ 完全等同于 React useState，行为零变化
 * - 有 Provider（登录态联机）→ 值来自房间快照，写入转成 patch 交给房主裁决
 * scope='seat' 时该状态只在本人设备可见（各自手里的骰子等隐藏信息）。
 */
export function useModeState<T>(
  key: string,
  initial: T | (() => T),
  scope?: 'seat'
): [T, Dispatch<SetStateAction<T>>] {
  const runtime = useContext(ModeRuntimeContext);
  const [local, setLocal] = useState<T>(initial);
  // initial 常是内联对象或箭头函数，放进 ref 才能让 setter 保持和 useState 一样的稳定引用
  const initialRef = useRef(initial);
  initialRef.current = initial;

  // hooks 数量必须恒定，同屏时也调用，只是订阅空实现
  useSyncExternalStore(
    runtime ? runtime.subscribe : noopSubscribe,
    runtime ? runtime.getVersion : noopVersion,
    noopVersion
  );

  const scopedKey = scope === 'seat' && runtime ? seatScopedKey(key, runtime.seat) : key;

  useEffect(() => {
    // 只有权威端负责写初值。访客也写的话，晚到的初始 patch 会把已经翻过的回合
    // 或已经抽掉的卡覆盖回开局状态（表现为「一直男方回合」）。
    if (!runtime || !runtime.authority) return;
    if (runtime.get(scopedKey) === undefined) {
      runtime.patch(scopedKey, resolveInitial(initialRef.current));
    }
    // 只在挂载时补一次初值；后续由房间快照驱动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedKey]);

  const setValue = useCallback(
    (next: SetStateAction<T>) => {
      if (!runtime) {
        setLocal(next);
        return;
      }
      const raw = runtime.get(scopedKey);
      const current = (raw === undefined ? resolveInitial(initialRef.current) : raw) as T;
      const value = typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
      runtime.patch(scopedKey, value);
    },
    [runtime, scopedKey, setLocal]
  );

  if (!runtime) return [local, setLocal];

  const raw = runtime.get(scopedKey);
  const value = (raw === undefined ? resolveInitial(initialRef.current) : raw) as T;
  return [value, setValue];
}
