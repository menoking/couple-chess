import { Theme } from '../../types';
import { Check, Shuffle } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { ThemeTags } from '../ThemeTags';
import { themePriority } from '../../utils/themeTags';
import { TaskDirectionTags } from '../TaskDirectionTags';

interface ThemeSelectorModalProps {
  isOpen: boolean;
  themes: Theme[];
  selectedThemeId: string | null;
  onSelect: (themeId: string) => void;
  onClose: () => void;
}

const audienceLabel: Record<Theme['audience'], string> = {
  common: '通用',
  male: '仅男方',
  female: '仅女方'
};

const modeLabel: Record<Theme['modes'][number], string> = {
  board: '飞行棋',
  card: '抽卡',
  mineTruth: '真心话',
  mineDare: '大冒险',
  mineTheme: '扫雷主题',
  diceAction: '上骰子动作',
  diceBody: '下骰子部位'
};

export function ThemeSelectorModal({
  isOpen,
  themes,
  selectedThemeId,
  onSelect,
  onClose
}: ThemeSelectorModalProps) {
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

  const sortedThemes = useMemo(
    () =>
      themes
        .map((theme, index) => ({ theme, priority: themePriority(theme, index) }))
        .sort((a, b) =>
          a.priority.group - b.priority.group ||
          a.priority.level - b.priority.level ||
          a.priority.index - b.priority.index
        )
        .map(item => item.theme),
    [themes]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="mobile-bottom-sheet absolute bottom-0 left-0 right-0 mx-auto flex max-h-[82dvh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[32px] bg-[#1C1C1E] transform transition-transform duration-300">
        <div className="mx-auto mb-4 mt-3 h-1 w-12 shrink-0 rounded-full bg-gray-600" />
        <div className="flex shrink-0 items-center justify-between px-6 pb-3">
          <div>
            <h3 className="text-xl font-bold text-white">选择卡包</h3>
            <div className="mt-0.5 text-[11px] text-gray-500">点选后立即返回，无需额外确认</div>
          </div>
          <button
            type="button"
            disabled={sortedThemes.length === 0}
            onClick={() => {
              const picked = sortedThemes[Math.floor(Math.random() * sortedThemes.length)];
              if (!picked) return;
              onSelect(picked.id);
              onClose();
            }}
            className="ios-btn flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs font-bold text-[#FFD60A] disabled:opacity-40"
          >
            <Shuffle size={14} /> 随机
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] no-scrollbar">
          {themes.length === 0 && (
            <div className="text-sm text-gray-500 bg-[#2C2C2E] rounded-xl p-4 border border-white/5">
              当前没有可选主题，请到题库中新建或编辑主题的适用模式
            </div>
          )}
          {sortedThemes.map(theme => (
            <button
              key={theme.id}
              type="button"
              onClick={() => {
                onSelect(theme.id);
                onClose();
              }}
              aria-pressed={selectedThemeId === theme.id}
              className={`ios-btn w-full rounded-xl border p-3 text-left ${selectedThemeId === theme.id ? 'border-[#0A84FF]/50 bg-[#0A84FF]/10' : 'border-white/5 bg-[#2C2C2E]'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium truncate">{theme.name}</span>
                    <span className="shrink-0 text-[10px] text-gray-500">{theme.tasks.length}卡</span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-gray-500">{theme.desc || '无描述'}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="bg-white/10 px-2 py-1 rounded text-[10px] text-gray-300">
                      {audienceLabel[theme.audience]}
                    </span>
                    <span className="bg-white/10 px-2 py-1 rounded text-[10px] text-gray-300">
                      {theme.modes.map(mode => modeLabel[mode]).join(' / ')}
                    </span>
                    {selectedThemeId === theme.id && <TaskDirectionTags tasks={theme.tasks} compact />}
                  </div>
                </div>
                <div className="flex shrink-0 items-start gap-2">
                  <ThemeTags tags={theme.tags} />
                  {selectedThemeId === theme.id && (
                    <Check className="text-[#0A84FF] shrink-0 mt-0.5" size={20} />
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
