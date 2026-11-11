import { useRef, useState } from 'react';
import { Cloud, Copy, Download, LogOut, Upload, Users, X } from 'lucide-react';
import { useCloud } from './useCloud';
import { supabase } from './client';
import { ONLINE_MODES, OnlineModeKey } from './games/adapters';
import { OnlineRoomInfo } from './OnlinePlayView';
import { TransportKind } from './transport';
import { LocalBackup, exportLocalBackup, importLocalBackup, isSandbox } from '../utils/localStorage';

interface CloudPanelProps {
  open: boolean;
  onClose: () => void;
  cloud: ReturnType<typeof useCloud>;
  transportKind: TransportKind;
  onStartRoom: (room: OnlineRoomInfo) => void;
  syncStatus: string;
  lastSyncedAt: string | null;
  incoming: OnlineRoomInfo | null;
  onAcceptInvite: (room: OnlineRoomInfo) => void;
  onDismissInvite: () => void;
}

type AuthMode = 'signin' | 'signup';

export function CloudPanel({
  open,
  onClose,
  cloud,
  transportKind,
  onStartRoom,
  syncStatus,
  lastSyncedAt,
  incoming,
  onAcceptInvite,
  onDismissInvite
}: CloudPanelProps) {
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [spaceName, setSpaceName] = useState('我们的小屋');
  const [joinCode, setJoinCode] = useState('');
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const space = cloud.space;

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

  const startRoom = (mode: OnlineModeKey) => {
    if (!space) return;
    const roomId = Math.random().toString(36).slice(2, 10).toUpperCase();
    const info: OnlineRoomInfo = { roomId, mode, hostSeat: space.seat };
    channelRef.current?.send({ type: 'broadcast', event: 'invite', payload: info });
    onStartRoom(info);
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setNotice('邀请码已复制');
    } catch {
      setNotice(`邀请码：${code}`);
    }
  };

  const doExport = () => {
    const backup = exportLocalBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `couple-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice('已导出备份文件');
  };

  const doImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(String(reader.result)) as LocalBackup;
        const count = importLocalBackup(backup);
        setNotice(`已导入 ${count} 项数据，刷新后生效`);
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
            <Cloud size={18} className="text-[#64D2FF]" /> 云同步与联机
          </div>
          <button type="button" onClick={onClose} className="ios-btn flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-gray-300">
            <X size={15} />
          </button>
        </div>

        {isSandbox && (
          <div className="mb-3 rounded-xl border border-[#FF9F0A]/30 bg-[#FF9F0A]/10 px-3 py-2 text-[11px] font-bold text-[#FFB340]">
            沙盒模式：当前数据与正式数据完全隔离（URL 带 ?sandbox=1）
          </div>
        )}

        {!cloud.configured && (
          <div className="space-y-3 text-[12px] leading-relaxed text-gray-400">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-2 font-bold text-white">云服务未配置</div>
              <div>1. 在 Supabase 新建项目，执行仓库里的 <code className="text-[#FFD60A]">supabase/schema.sql</code></div>
              <div>2. 在 Vercel 环境变量里填 <code className="text-[#FFD60A]">VITE_SUPABASE_URL</code> 与 <code className="text-[#FFD60A]">VITE_SUPABASE_ANON_KEY</code></div>
              <div>3. 重新部署后这里就能登录了</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-2 font-bold text-white">本地玩法不受影响</div>
              <div>未配置时所有 24 个玩法照常可用，数据仍然只存在本机。</div>
            </div>
          </div>
        )}

        {cloud.configured && !cloud.user && (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-[11px] leading-relaxed text-gray-400">
              用一个家庭账号登录，两台设备都登同一个号。题库、战绩会跟着账号走，换手机登录即可恢复。
            </div>
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="邮箱"
              autoComplete="email"
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-gray-500"
            />
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="密码（至少 6 位）"
              autoComplete="current-password"
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-gray-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !email || password.length < 6}
                onClick={() => run(async () => {
                  if (authMode === 'signup') await cloud.signUp(email, password);
                  else await cloud.signIn(email, password);
                })}
                className="ios-btn h-12 flex-[2] rounded-full bg-white text-sm font-bold text-black disabled:opacity-30"
              >
                {busy ? '处理中…' : authMode === 'signin' ? '登录' : '注册'}
              </button>
              <button
                type="button"
                onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                className="ios-btn h-12 flex-1 rounded-full bg-white/10 text-xs font-bold text-white"
              >
                切到{authMode === 'signin' ? '注册' : '登录'}
              </button>
            </div>
          </div>
        )}

        {cloud.configured && cloud.user && !space && (
          <div className="space-y-3">
            <div className="text-[11px] text-gray-500">已登录：{cloud.user.email}</div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-[11px] leading-relaxed text-gray-400">
              创建一间「小屋」，把邀请码发给对方；对方登录后输入邀请码即完成配对。配对一次，以后不再需要输码。
            </div>
            <input
              value={spaceName}
              onChange={event => setSpaceName(event.target.value)}
              placeholder="小屋名字"
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => run(async () => { await cloud.createSpace(spaceName); })}
              className="ios-btn h-12 w-full rounded-full bg-white text-sm font-bold text-black disabled:opacity-30"
            >
              创建小屋
            </button>
            <div className="flex gap-2">
              <input
                value={joinCode}
                onChange={event => setJoinCode(event.target.value.toUpperCase())}
                placeholder="输入邀请码"
                maxLength={6}
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm tracking-[0.3em] text-white"
              />
              <button
                type="button"
                disabled={busy || joinCode.length < 4}
                onClick={() => run(async () => { await cloud.joinSpace(joinCode); })}
                className="ios-btn h-12 rounded-full bg-white/10 px-5 text-sm font-bold text-white disabled:opacity-30"
              >
                加入
              </button>
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

        {cloud.configured && space && (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{space.name}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-gray-400">
                  座位 {space.seat + 1}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-black/30 px-3 py-2">
                <span className="text-[10px] text-gray-500">邀请码（发给对方）</span>
                <button type="button" onClick={() => void copyCode(space.inviteCode)} className="flex items-center gap-1.5 text-sm font-bold tracking-[0.2em] text-[#64D2FF]">
                  {space.inviteCode}<Copy size={12} />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-gray-500">
                <Users size={11} />已配对 {cloud.members.length} / 2 人
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-[10px] text-gray-500">
              题库同步：{syncStatus === 'error' ? '失败' : syncStatus === 'pushing' ? '上传中…' : syncStatus === 'pulling' ? '拉取中…' : '已同步'}
              {lastSyncedAt && <span className="ml-1">· {new Date(lastSyncedAt).toLocaleTimeString()}</span>}
              <span className="ml-1">· 通道 {transportKind === 'supabase' ? 'Supabase' : '本地测试'}</span>
            </div>

            {incoming && (
              <div className="rounded-xl border border-[#30D158]/30 bg-[#30D158]/10 p-4">
                <div className="text-xs font-bold text-white">对方邀请你玩「{ONLINE_MODES.find(m => m.key === incoming.mode)?.label}」</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onAcceptInvite(incoming)}
                    className="ios-btn h-10 flex-1 rounded-full bg-white text-xs font-bold text-black"
                  >
                    接受
                  </button>
                  <button
                    type="button"
                    onClick={onDismissInvite}
                    className="ios-btn h-10 flex-1 rounded-full bg-white/10 text-xs font-bold text-white"
                  >
                    忽略
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-[10px] font-bold text-gray-500">发起联机对局</div>
              {ONLINE_MODES.map(mode => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => startRoom(mode.key)}
                  className="ios-btn flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left"
                >
                  <div>
                    <div className="text-sm font-bold text-white">{mode.label}</div>
                    <div className="text-[10px] text-gray-500">{mode.desc}</div>
                  </div>
                  <span className="text-[10px] font-bold text-[#64D2FF]">邀请对方</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={doExport} className="ios-btn flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-white/10 text-[11px] font-bold text-white">
                <Download size={12} />导出数据
              </button>
              <label className="ios-btn flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-white/10 text-[11px] font-bold text-white">
                <Upload size={12} />导入数据
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
