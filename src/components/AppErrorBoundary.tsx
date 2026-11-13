import { Component, type ErrorInfo, type ReactNode } from 'react';
import { diagLog } from '../cloud/diagnostics';

interface State {
  error: Error | null;
}

/** 兜底：任何渲染崩溃都显示可读错误，而不是整页黑屏。 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    diagLog('app:crash', {
      message: error.message,
      stack: (info.componentStack ?? '').slice(0, 300)
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-3 bg-black px-6 text-center">
        <div className="text-base font-bold text-white">页面出错了</div>
        <pre className="max-h-48 w-full max-w-sm overflow-auto rounded-xl border border-white/10 bg-white/5 p-3 text-left text-[10px] leading-relaxed text-[#FF7A96]">
          {this.state.error.message}
        </pre>
        <div className="text-[11px] text-gray-500">把这段文字截图给开发者即可定位</div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-white px-5 py-2 text-xs font-bold text-black"
        >
          重载页面
        </button>
      </div>
    );
  }
}
