import { useState, useEffect } from 'react';
import { TaskEventData, Player } from '../../types';
import { ArrowRight, Flame, Heart, Lock, HandshakeIcon, MessageCircleQuestion, Sparkles, X } from 'lucide-react';

interface TaskCardModalProps {
  isOpen: boolean;
  taskData: TaskEventData | null;
  onAccept: () => void;
  onReject: () => void;
  onClose?: () => void;
  /** 传入双方信息后，卡片会直接显示玩家名字而不是「男方/女方」 */
  players?: Player[];
  /** 联机时只有执行人能确认；非执行人只看不操作 */
  readOnly?: boolean;
  readOnlyNote?: string;
}

const iconMap: Record<string, React.ReactNode> = {
  favorite: <Heart size={40} fill="currentColor" />,
  lock: <Lock size={40} />,
  handshake: <HandshakeIcon size={40} />,
  flame: <Flame size={40} />,
  'message-question': <MessageCircleQuestion size={40} />,
  sparkles: <Sparkles size={40} />
};

export function TaskCardModal({
  isOpen,
  taskData,
  onAccept,
  onReject,
  onClose,
  players,
  readOnly = false,
  readOnlyNote
}: TaskCardModalProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [visibleTaskData, setVisibleTaskData] = useState<TaskEventData | null>(null);

  useEffect(() => {
    if (isOpen && taskData) {
      setVisibleTaskData(taskData);
      setIsFlipped(false);
      document.body.style.overflow = 'hidden';
    } else {
      setVisibleTaskData(null);
      setIsFlipped(false);
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, taskData]);

  if (!isOpen || !visibleTaskData) return null;

  const isMineTask =
    visibleTaskData.type === 'mineTruth' ||
    visibleTaskData.type === 'mineDare' ||
    visibleTaskData.type === 'mineTheme';
  const rejectLabel =
    visibleTaskData.type === 'card' || isMineTask
      ? '跳过任务'
      : visibleTaskData.type === 'collision'
        ? '拒绝（回到起点）'
        : '拒绝（倒退1~3格）';

  const nameOf = (id: number) =>
    players?.find(player => player.id === id)?.name ?? (id === 0 ? '男方' : '女方');
  const colorOf = (id: number) =>
    players?.find(player => player.id === id)?.color ?? (id === 0 ? '#0A84FF' : '#FF375F');

  const executorLabel = nameOf(visibleTaskData.executorPlayerId);
  const executorClassName = visibleTaskData.executorPlayerId === 0 ? 'text-[#0A84FF]' : 'text-[#FF375F]';
  const targetLabel = visibleTaskData.targetPlayerId === null ? null : nameOf(visibleTaskData.targetPlayerId);
  const initiatorLabel = nameOf(visibleTaskData.initiatorPlayerId);

  const moveLabel =
    visibleTaskData.moveDelta === 0
      ? ''
      : visibleTaskData.moveDelta > 0
        ? `完成后前进 ${visibleTaskData.moveDelta} 格`
        : `完成后后退 ${Math.abs(visibleTaskData.moveDelta)} 格`;

  const assignmentStrip = (
    <div className="flex w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <span
        className="rounded-full px-2 py-0.5 text-[11px] font-bold"
        style={{ backgroundColor: `${colorOf(visibleTaskData.initiatorPlayerId)}22`, color: colorOf(visibleTaskData.initiatorPlayerId) }}
      >
        抽卡 · {initiatorLabel}
      </span>
      <span className="text-gray-600">｜</span>
      {visibleTaskData.executionMode === 'together' ? (
        <span className="rounded-full bg-[#BF5AF2]/20 px-2 py-0.5 text-[11px] font-bold text-[#D08BFF]">双方一起执行</span>
      ) : (
        <>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ backgroundColor: `${colorOf(visibleTaskData.executorPlayerId)}22`, color: colorOf(visibleTaskData.executorPlayerId) }}
          >
            执行 · {executorLabel}
          </span>
          <ArrowRight size={12} className="text-gray-500" />
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ backgroundColor: `${colorOf(visibleTaskData.targetPlayerId ?? 1)}22`, color: colorOf(visibleTaskData.targetPlayerId ?? 1) }}
          >
            对象 · {targetLabel}
          </span>
        </>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto px-4 py-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      <div className="w-full max-w-sm">
        {onClose && !readOnly && (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭任务卡"
              className="ios-btn flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#3A3A3C] text-gray-300 shadow-lg"
            >
              <X size={16} strokeWidth={3} />
            </button>
          </div>
        )}

        <div className="mobile-task-modal-card relative w-full max-h-full perspective-1000 task-card-pop">
        <div className={`flip-card-inner ${isFlipped ? 'flipped' : ''}`}>
          <div
            className="flip-card-front bg-[#1C1C1E] border border-white/10 p-6 flex flex-col items-center justify-center shadow-2xl cursor-pointer"
            onClick={() => setIsFlipped(true)}
          >
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-5 animate-pulse">
              <div className={visibleTaskData.color}>
                {iconMap[visibleTaskData.icon] || iconMap.favorite}
              </div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">{visibleTaskData.title}</h3>
            <p className="text-sm text-gray-500 uppercase tracking-widest mb-5">
              点击翻转查看任务
            </p>
            {assignmentStrip}
          </div>

          <div className="flip-card-back overflow-y-auto bg-[#1C1C1E] border border-white/10 p-[clamp(0.75rem,3dvh,1.5rem)] shadow-2xl">
            <div className="flex-1 flex flex-col items-center justify-center w-full">
              <div className={visibleTaskData.color}>
                {iconMap[visibleTaskData.icon] || iconMap.favorite}
              </div>
              <h3 className="text-xl font-bold text-white mb-3 mt-3">{visibleTaskData.title}</h3>

              {assignmentStrip}

              <div className="text-xs text-gray-400 text-center leading-relaxed mt-3 mb-3">
                <div>{visibleTaskData.subtitle}</div>
                <div className="mt-1">
                  {visibleTaskData.executionMode === 'together' ? (
                    '双方共同完成'
                  ) : (
                    <>由 <span className={executorClassName}>{executorLabel}</span> 对 {targetLabel} 执行</>
                  )}
                </div>
                {moveLabel && <div className="mt-1 text-gray-300">{moveLabel}</div>}
              </div>

              <div className="w-full bg-[#2C2C2E] rounded-xl p-6 min-h-[120px] flex items-center justify-center border border-white/5 mb-6">
                <p className="text-lg font-medium text-white text-center leading-relaxed">
                  {visibleTaskData.task}
                </p>
              </div>
            </div>

            {readOnly ? (
              <div className="mt-auto w-full rounded-full border border-white/10 bg-white/[0.06] px-3 py-3 text-center text-[11px] font-bold leading-relaxed text-gray-300">
                {readOnlyNote ?? '等待对方在自己的设备上确认，卡片会自动消失'}
              </div>
            ) : (
              <div className="w-full flex gap-3 mt-auto">
                <button
                  className="flex-1 min-h-10 rounded-full bg-[#3A3A3C] text-[#FF453A] font-bold text-xs ios-btn border border-transparent hover:border-[#FF453A]/30"
                  onClick={onReject}
                >
                  {rejectLabel}
                </button>
                <button
                  className="flex-1 min-h-10 rounded-full bg-white text-black font-bold text-xs ios-btn shadow-lg"
                  onClick={onAccept}
                >
                  接受任务
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
