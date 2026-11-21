import type { JubenshaScript } from '../../types/jubensha';
import { DEMO_SCRIPT } from './demoScript';

/**
 * 所有可用剧本的统一出口。
 *
 * 新增正式剧本时只做两件事：
 * 1. 在 `src/data/jubensha/` 下新建 `xxxScript.ts`，导出一个 `JubenshaScript`；
 * 2. 在这里 import 并加进 `JUBENSHA_SCRIPTS` 数组。
 * 引擎、视图、选本列表都会自动出现，不需要再改别的文件。
 */
export const JUBENSHA_SCRIPTS: JubenshaScript[] = [DEMO_SCRIPT];

export const DEFAULT_JUBENSHA_SCRIPT_ID = DEMO_SCRIPT.id;

export function getJubenshaScript(scriptId: string | null | undefined): JubenshaScript | null {
  if (!scriptId) return null;
  return JUBENSHA_SCRIPTS.find(script => script.id === scriptId) ?? null;
}

export function getJubenshaScriptIds(): string[] {
  return JUBENSHA_SCRIPTS.map(script => script.id);
}

export { DEMO_SCRIPT };
