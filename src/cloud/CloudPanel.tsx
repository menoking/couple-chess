import { useState } from 'react';
import { Cloud, Download, LogOut, Upload, X } from 'lucide-react';
import { useCloud } from './useCloud';
import { supabase } from './client';
import { ONLINE_MODES, OnlineModeKey } from './games/adapters';
import { TransportKind } from './transport';
import { LocalBackup, exportLocalBackup, importLocalBackup, isSandbox } from '../utils/localStorage';
import { enterOnlineRoom, roomIdOf } from './rooms';

interface CloudPanelProps {
  open: boolean;
  onClose: () => void;
  cloud: ReturnType<typeof useCloud>;
  transportKind: TransportKind;
  onEnterRoom: (room: { roomId: string; mode: OnlineModeKey }, isHost: boolean) => void;
  syncStatus: string;
  lastSyncedAt: string | null;
}

export function CloudPanel({
  open,
  onClose,
  cloud,
  transportKind,
  onEnterRoom,
  syncStatus,
  lastSyncedAt
}: CloudPanelProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!open) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const enterRoom = async (target: OnlineModeKey, forceHost = false) => {
    if (!cloud.space) return;
    try {
      const ticket = await enterOnlineRoom(cloud.space, target, forceHost);
      if (!ticket) return;
      onEnterRoom({ roomId: ticket.roomId, mode: ticket.mode }, ticket.isHost);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '进房间失败');
    }
  };

  /** 对方退出后接管房主，避免卡在「等待对方」 */
  const takeOverRooms = async () => {
    const client = supabase;
    if (!client || !cloud.space) return;
    const device = (await import('./device')).getDeviceId();
    for (const item of ONLINE_MODES) {
      const roomId = roomIdOf(cloud.space.id, item.key);
      const { error } = await client
        .from('rooms')
        .upsert({ id: roomId, space_id: cloud.space.id, host_device: device, updated_at: new Date().toISOString() });
      if (error) {
        setNotice(error.message);
        return;
      }
    }
    setNotice('已接管房主，重新进入玩法即可');
  };


  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportLocalBackup(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `couple-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice('已导出备份');
  };

  const doImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const count = importLocalBackup(JSON.parse(String(reader.result)) as LocalBackup);
        setNotice(`已导入 ${count} 项，刷新后生效`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '导入失败');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="max-h-[88vh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#1C1C1E] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] no-scrollbar">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-base font-bold text-white">
            <Cloud size={18} className="text-[#64D2FF]" /> 账号与联机
          </div>
          <button type="button" onClick={onClose} className="ios-btn flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-gray-300">
            <X size={15} />
          </button>
        </div>

        {isSandbox && (
          <div className="mb-3 rounded-xl border border-[#FF9F0A]/30 bg-[#FF9F0A]/10 px-3 py-2 text-[11px] font-bold text-[#FFB340]">
            沙盒模式：与正式数据完全隔离
          </div>
        )}

        {!cloud.configured && (
          <div className="space-y-3 text-[12px] leading-relaxed text-gray-400">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-1 font-bold text-white">云服务未配置</div>
              <div>在 Vercel 加环境变量 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`，然后重新部署即可。</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              未配置时 24 个本地玩法照常可用，数据只在这台设备上。
            </div>
          </div>
        )}

        {cloud.configured && !cloud.user && (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-[11px] leading-relaxed text-gray-400">
              用<b className="text-white">用户名 + 密码</b>即可，不需要邮箱。两台设备登录同一个用户名，就会自动进入同一间屋子。
            </div>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="用户名（字母/数字）"
              autoCapitalize="none"
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-gray-500"
            />
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="密码（至少 6 位）"
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-gray-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || name.trim().length < 2 || password.length < 6}
                onClick={() => run(async () => {
                  if (mode === 'signup') await cloud.signUp(name, password);
                  else await cloud.signIn(name, password);
                })}
                className="ios-btn h-12 flex-[2] rounded-full bg-white text-sm font-bold text-black disabled:opacity-30"
              >
                {busy ? '处理中…' : mode === 'signin' ? '登录' : '注册'}
              </button>
              <button
                type="button"
                onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                className="ios-btn h-12 flex-1 rounded-full bg-white/10 text-xs font-bold text-white"
              >
                切到{mode === 'signin' ? '注册' : '登录'}
              </button>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(async () => { await cloud.signInTest(); })}
              className="ios-btn h-11 w-full rounded-full border border-dashed border-white/20 text-xs font-bold text-[#64D2FF] disabled:opacity-30"
            >
              一键进入测试账号（test / test1234）
            </button>
          </div>
        )}

        {cloud.configured && cloud.user && (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">@{cloud.username}</span>
                {cloud.isTestAccount && (
                  <span className="rounded-full bg-[#FFD60A]/20 px-2 py-0.5 text-[10px] font-bold text-[#FFD60A]">测试账号</span>
                )}
              </div>
              <div className="mt-1 text-[10px] text-gray-500">
                {cloud.space ? `已自动创建小屋「${cloud.space.name}」` : '正在初始化小屋…'}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-[10px] text-gray-500">
              题库同步：
              {syncStatus === 'error' ? '失败' : syncStatus === 'pushing' ? '上传中…' : syncStatus === 'pulling' ? '拉取中…' : '已同步'}
              {lastSyncedAt && <span className="ml-1">· {new Date(lastSyncedAt).toLocaleTimeString()}</span>}
              <span className="ml-1">· 通道 {transportKind === 'supabase' ? 'Supabase' : '本地'}</span>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-bold text-gray-500">进房间（两台设备选同一个玩法即可）</div>
              {ONLINE_MODES.map(item => (
                <button
                  key={item.key}
                  type="button"
                  disabled={!cloud.space}
                  onClick={() => void enterRoom(item.key)}
                  className="ios-btn flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left disabled:opacity-40"
                >
                  <div>
                    <div className="text-sm font-bold text-white">{item.label}</div>
                    <div className="text-[10px] text-gray-500">{item.desc}</div>
                  </div>
                  <span className="text-[10px] font-bold text-[#64D2FF]">进入</span>
                </button>
              ))}
              <button
                type="button"
                disabled={!cloud.space}
                onClick={() => void takeOverRooms()}
                className="ios-btn h-9 w-full rounded-full text-[10px] font-bold text-gray-500 disabled:opacity-40"
              >
                把三个房间的房主都改成我（对方已关页面时用）
              </button>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={doExport} className="ios-btn flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-white/10 text-[11px] font-bold text-white">
                <Download size={12} />导出
              </button>
              <label className="ios-btn flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-white/10 text-[11px] font-bold text-white">
                <Upload size={12} />导入
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) doImport(file);
                    event.target.value = '';
                  }}
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => void cloud.signOut()}
              className="ios-btn flex h-10 w-full items-center justify-center gap-2 rounded-full text-xs font-bold text-gray-500"
            >
              <LogOut size={13} />退出登录
            </button>
          </div>
        )}

        {notice && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-center text-[11px] font-bold text-white">
            {notice}
          </div>
        )}
        {cloud.error && (
          <div className="mt-3 rounded-xl border border-[#FF453A]/30 bg-[#FF453A]/10 px-3 py-2 text-center text-[11px] font-bold text-[#FF7A96]">
            {cloud.error}
          </div>
        )}
      </div>
    </div>
  );
}
