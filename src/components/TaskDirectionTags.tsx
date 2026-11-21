import type { TaskCard } from '../types';
import { themeTaskRuleLabels } from '../rules/taskRules';

export function TaskDirectionTags({ tasks, compact = false }: { tasks: TaskCard[]; compact?: boolean }) {
  const labels = themeTaskRuleLabels(tasks);
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1" aria-label="卡包执行关系">
      {labels.map(label => (
        <span
          key={label}
          className={`rounded bg-white/10 text-gray-300 ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]'}`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
