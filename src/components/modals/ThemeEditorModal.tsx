import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { TaskExecutor, Theme, ThemeMode } from '../../types';
import { describeStoredTaskRule } from '../../rules/taskRules';

interface ThemeEditorModalProps {
  isOpen: boolean;
  theme: Theme | null;
  onClose: () => void;
  onSaveMeta: (themeId: string, patch: Partial<Pick<Theme, 'name' | 'desc' | 'audience' | 'modes'>>) => void;
  onAddTask: (themeId: string, taskText: string, executor: TaskExecutor) => void;
  onUpdateTask: (themeId: string, index: number, patch: Partial<Theme['tasks'][number]>) => void;
  onRemoveTask: (themeId: string, index: number) => void;
  onOpenAiImport: (themeId: string) => void;
}

const audienceOptions: Array<{ value: Theme['audience']; label: string }> = [
  { value: 'common', label: '通用' },
  { value: 'male', label: '仅限男方' },
  { value: 'female', label: '仅限女方' }
];

const taskExecutorOptions: Array<{ value: TaskExecutor; label: string; hint: string }> = [
  { value: 'male', label: '男 → 女', hint: '男方执行，女方接受' },
  { value: 'female', label: '女 → 男', hint: '女方执行，男方接受' },
  { value: 'together', label: '双方一起', hint: '两人共同完成' },
  { value: 'both', label: '随回合', hint: '实际执行方对另一方完成' }
];

const modeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: 'board', label: '飞行棋' },
  { value: 'card', label: '抽卡' },
  { value: 'mineTruth', label: '扫雷真心话' },
  { value: 'mineDare', label: '扫雷大冒险' },
  { value: 'mineTheme', label: '扫雷主题' },
  { value: 'diceAction', label: '上骰子动作' },
  { value: 'diceBody', label: '下骰子部位' }
];

export function ThemeEditorModal({
  isOpen,
  theme,
  onClose,
  onSaveMeta,
  onAddTask,
  onUpdateTask,
  onRemoveTask,
  onOpenAiImport
}: ThemeEditorModalProps) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [audience, setAudience] = useState<Theme['audience']>('common');
  const [modes, setModes] = useState<ThemeMode[]>([]);
  const [taskText, setTaskText] = useState('');
  const [newTaskExecutor, setNewTaskExecutor] = useState<TaskExecutor>('both');

  useEffect(() => {
    if (!isOpen || !theme) return;
    setName(theme.name);
    setDesc(theme.desc);
    setAudience(theme.audience);
    setModes(theme.modes);
    setTaskText('');
    setNewTaskExecutor('both');
  }, [isOpen, theme]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const canSave = useMemo(() => name.trim().length > 0 && modes.length > 0, [name, modes.length]);

  const toggleMode = (mode: ThemeMode) => {
    setModes(prev => (prev.includes(mode) ? prev.filter(item => item !== mode) : [...prev, mode]));
  };

  if (!isOpen || !theme) return null;

  return (
    <div className="fixed inset-0 z-[130]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="mobile-bottom-sheet absolute bottom-0 left-0 right-0 bg-[#1C1C1E] rounded-t-[32px] p-6">
        <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-6" />
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-xl font-bold text-white">编辑主题</h3>
          <button
            className="h-9 px-4 rounded-full bg-white text-black text-sm font-semibold ios-btn disabled:opacity-40"
            disabled={!canSave}
            onClick={() => {
              onSaveMeta(theme.id, { name: name.trim(), desc: desc.trim(), audience, modes });
              onClose();
            }}
          >
            保存
          </button>
        </div>

        <div className="space-y-4 max-h-[70dvh] overflow-y-auto no-scrollbar pb-10">
          <div className="space-y-2">
            <div className="text-xs text-gray-400">主题名称</div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full h-11 px-4 rounded-xl bg-[#2C2C2E] text-white outline-none border border-white/5 focus:border-white/20"
              maxLength={24}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs text-gray-400">描述</div>
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              className="w-full h-11 px-4 rounded-xl bg-[#2C2C2E] text-white outline-none border border-white/5 focus:border-white/20"
              maxLength={60}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs text-gray-400">适用对象</div>
            <div className="grid grid-cols-3 gap-2">
              {audienceOptions.map(opt => (
                <button
                  key={opt.value}
                  className={`h-10 rounded-xl text-sm font-semibold ios-btn border ${
                    audience === opt.value
                      ? 'bg-white text-black border-white'
                      : 'bg-[#2C2C2E] text-gray-200 border-white/5'
                  }`}
                  onClick={() => setAudience(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-gray-400">适用模式</div>
            <div className="grid grid-cols-2 gap-2">
              {modeOptions.map(opt => {
                const isActive = modes.includes(opt.value);

                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`h-10 rounded-xl text-sm font-semibold ios-btn border ${
                      isActive
                        ? 'bg-white text-black border-white'
                        : 'bg-[#2C2C2E] text-gray-200 border-white/5'
                    }`}
                    onClick={() => toggleMode(opt.value)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="flex-1 h-12 rounded-xl bg-gradient-to-r from-[#BF5AF2] via-[#FF375F] to-[#FF9F0A] text-white font-bold ios-btn shadow-[0_0_15px_rgba(255,55,95,0.3)] flex items-center justify-center gap-2 border-none"
              onClick={() => onOpenAiImport(theme.id)}
            >
              <Wand2 size={18} className="animate-pulse" />
              <span>AI 导入任务卡</span>
            </button>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-gray-400">新增任务卡</div>
            <div className="grid grid-cols-2 gap-2">
              {taskExecutorOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.hint}
                  className={`rounded-xl border px-3 py-2 text-left ios-btn ${
                    newTaskExecutor === opt.value
                      ? 'border-white bg-white text-black'
                      : 'border-white/5 bg-[#2C2C2E] text-gray-200'
                  }`}
                  onClick={() => setNewTaskExecutor(opt.value)}
                >
                  <div className="text-xs font-bold">{opt.label}</div>
                  <div className={`mt-0.5 text-[9px] ${newTaskExecutor === opt.value ? 'text-black/60' : 'text-gray-500'}`}>
                    {opt.hint}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={taskText}
                onChange={e => setTaskText(e.target.value)}
                className="flex-1 h-11 px-4 rounded-xl bg-[#2C2C2E] text-white outline-none border border-white/5 focus:border-white/20"
                placeholder="输入一句可执行的小任务"
                maxLength={80}
              />
              <button
                className="h-11 px-4 rounded-xl bg-white text-black font-bold ios-btn disabled:opacity-40 flex items-center justify-center gap-1"
                disabled={!taskText.trim()}
                onClick={() => {
                  onAddTask(theme.id, taskText, newTaskExecutor);
                  setTaskText('');
                }}
              >
                <Plus size={18} />
                添加
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-400">任务卡列表</div>
              <div className="text-[10px] text-gray-500">{theme.tasks.length} 卡</div>
            </div>
            <div className="space-y-2">
              {theme.tasks.map((t, idx) => (
                <div
                  key={`${theme.id}_${idx}`}
                  className="p-3 bg-[#2C2C2E] rounded-xl border border-white/5"
                >
                  <div className="flex items-start gap-3">
                    <div className="pt-0.5 text-[11px] text-gray-500">{idx + 1}</div>
                    <div className="min-w-0 flex-1 text-sm leading-relaxed text-white">{t.text}</div>
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[9px] font-bold text-gray-300">
                      {describeStoredTaskRule(t)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 pl-5">
                    <div className="grid min-w-[210px] flex-1 grid-cols-2 overflow-hidden rounded-lg border border-white/5 bg-black/20">
                      {taskExecutorOptions.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          title={opt.hint}
                          className={`h-8 px-2 text-[10px] font-bold ios-btn ${
                            t.executor === opt.value ? 'bg-white text-black' : 'text-gray-300'
                          }`}
                          onClick={() => onUpdateTask(theme.id, idx, { executor: opt.value })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center rounded-lg overflow-hidden border border-white/5 bg-black/20">
                      <button
                        type="button"
                        className="h-8 w-8 text-sm font-bold text-gray-200 ios-btn"
                        onClick={() => onUpdateTask(theme.id, idx, { moveDelta: t.moveDelta - 1 })}
                      >
                        -
                      </button>
                      <div
                        className={`h-8 min-w-8 px-2 flex items-center justify-center text-xs font-bold ${
                          t.moveDelta === 0 ? 'text-gray-500' : t.moveDelta > 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                        }`}
                      >
                        {t.moveDelta > 0 ? `+${t.moveDelta}` : t.moveDelta}
                      </div>
                      <button
                        type="button"
                        className="h-8 w-8 text-sm font-bold text-gray-200 ios-btn"
                        onClick={() => onUpdateTask(theme.id, idx, { moveDelta: t.moveDelta + 1 })}
                      >
                        +
                      </button>
                    </div>
                    <button
                      className="h-8 w-8 shrink-0 rounded-lg bg-black/20 text-[#FF453A] ios-btn flex items-center justify-center"
                      onClick={() => onRemoveTask(theme.id, idx)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {theme.tasks.length === 0 && (
                <div className="text-sm text-gray-500 bg-[#2C2C2E] rounded-xl p-4 border border-white/5">
                  还没有任务卡，先添加几条吧
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

