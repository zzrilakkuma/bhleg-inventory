import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <main className="w-full max-w-md space-y-6">
        {/* Logo / Title */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-2 text-white" style={{
            textShadow: '0 0 10px rgba(255, 255, 255, 0.5), 0 0 20px rgba(255, 255, 255, 0.3)'
          }}>
            巢穴 bhleg<span className="cursor-blink">_</span>
          </h1>
          <p className="text-sm text-gray-400 font-mono">物資流</p>
        </div>

        {/* User Info */}
        <div className="flex items-center justify-between px-4 py-2 rounded border border-[#333333] bg-[#0a0a0a]">
          <span className="text-sm text-gray-400">您好，訪客</span>
          <button className="text-xs text-[#00FF41] hover:underline font-mono">
            [切換]
          </button>
        </div>

        {/* Main Action Buttons */}
        <div className="space-y-4">
          <Link href="/record-in" className="block w-full py-6 px-6 rounded border border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] transition-all duration-200 group"
            style={{
              boxShadow: '0 0 5px rgba(0, 255, 65, 0.3)'
            }}>
            <div className="text-left">
              <div className="text-xs text-gray-500 font-mono mb-1">// 記錄入庫</div>
              <div className="text-lg font-semibold text-[#00FF41]">&gt; RECORD_IN</div>
            </div>
          </Link>

          <Link href="/record-out" className="block w-full py-6 px-6 rounded border border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] transition-all duration-200 group"
            style={{
              boxShadow: '0 0 5px rgba(0, 255, 65, 0.3)'
            }}>
            <div className="text-left">
              <div className="text-xs text-gray-500 font-mono mb-1">// 記錄出庫</div>
              <div className="text-lg font-semibold text-[#00FF41]">&gt; RECORD_OUT</div>
            </div>
          </Link>
        </div>

        {/* Secondary Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/inventory" className="py-4 px-4 rounded border border-[#333333] bg-[#0a0a0a] hover:border-[#00FF41] transition-colors duration-200">
            <div className="text-sm text-white font-medium">查看庫存</div>
          </Link>
          <Link href="/records" className="py-4 px-4 rounded border border-[#333333] bg-[#0a0a0a] hover:border-[#00FF41] transition-colors duration-200">
            <div className="text-sm text-white font-medium">最近記錄</div>
          </Link>
        </div>

        {/* Admin Login */}
        <div className="pt-8 text-center">
          <button className="text-sm text-gray-500 hover:text-[#00FF41] transition-colors font-mono">
            [管理員登入]
          </button>
        </div>
      </main>
    </div>
  );
}
