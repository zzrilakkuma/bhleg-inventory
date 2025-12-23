"use client";

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';

// Initialize Supabase client
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// --- Reusable Safe Word Input Component with Peek ---
const SafeWordInput = ({ value, onChange, required, autoComplete = "new-password" }: { value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, required: boolean, autoComplete?: string }) => {
  const [isPeeking, setIsPeeking] = useState(false);

  return (
    <div className="relative w-full">
      <input
        type={isPeeking ? 'text' : 'password'}
        placeholder="> Safe Word:"
        value={value}
        onChange={onChange}
        className="w-full p-4 bg-[#0a0a0a] border border-[#333] rounded focus:border-[#00FF41] focus:ring-0 outline-none font-mono pr-12"
        autoComplete={autoComplete}
        required={required}
      />
      <button
        type="button"
        onMouseDown={() => setIsPeeking(true)}
        onMouseUp={() => setIsPeeking(false)}
        onMouseLeave={() => setIsPeeking(false)}
        onTouchStart={() => setIsPeeking(true)}
        onTouchEnd={() => setIsPeeking(false)}
        className="absolute inset-y-0 right-0 flex items-center justify-center h-full w-12 text-gray-500 hover:text-[#00FF41] transition-colors"
        aria-label="Show password"
      >
        {isPeeking ? (
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.243 4.243L6.228 6.228" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [isRegistering, setIsRegistering] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [safeWord, setSafeWord] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const slideVariants = {
    hidden: (direction: number) => ({ x: direction > 0 ? '100%' : '-100%', opacity: 0 }),
    visible: { x: 0, opacity: 1 },
    exit: (direction: number) => ({ x: direction < 0 ? '100%' : '-100%', opacity: 0 }),
  };

  const handleStepChange = (newStep: number) => {
    setDirection(newStep > step ? 1 : -1);
    setStep(newStep);
  }

  const handleNext = async () => {
    if (step === 0) {
      if (isRegistering) {
        if (!/^\S+@\S+\.\S+$/.test(email)) {
          toast.error('請輸入有效的 Email');
          return;
        }
        
        // --- EMAIL DUPLICATION CHECK ---
        setIsLoading(true);
        const { data, error } = await supabase.functions.invoke('login-with-name', {
          body: { action: 'check-email', email },
          headers: { 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` }
        });
        setIsLoading(false);

        if (error || data.error) {
          toast.error('無法驗證 Email');
          return;
        }
        if (data.exists) {
          toast.error('此 Email 已經被註冊');
          return;
        }
      } else {
        if (name.trim().length < 3) {
          toast.error('身份名稱長度至少需要 3 個字元');
          return;
        }
      }
    }
    
    if (step === 1 && isRegistering && name.trim().length < 3) {
      toast.error('身份名稱長度至少需要 3 個字元');
      return;
    }

    handleStepChange(step + 1);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (safeWord.length < 6) {
      toast.error('Safe Word 長度至少需要 6 個字元');
      return;
    }
    setIsLoading(true);

    if (isRegistering) {
      const { error } = await supabase.auth.signUp({
        email,
        password: safeWord,
        options: { data: { name } },
      });

      if (error) {
        if (error.message.includes('unique constraint') && error.message.includes('profiles_name_key')) {
          toast.error(`身份名稱 "${name}" 已經被使用`);
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success('註冊成功！您現在可以登入了。');
        setStep(0);
        setIsRegistering(false);
      }
    } else {
      const { data, error } = await supabase.functions.invoke('login-with-name', {
        body: { action: 'login', name, safeWord },
        headers: { 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` }
      });

      if (error || data.error) {
        toast.error('身份名稱或 Safe Word 錯誤');
      } else {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (sessionError) {
          toast.error('登入時發生錯誤');
        } else {
          toast.success(`歡迎回來，${name}`);
          window.location.href = '/';
        }
      }
    }
    setIsLoading(false);
  };

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          className: 'font-mono',
          style: { background: '#1a1a1a', color: '#00ff41', border: '1px solid #333' },
        }}
      />
      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-black text-white">
        <main className="w-full max-w-md space-y-6">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2 text-white" style={{ textShadow: '0 0 10px rgba(255, 255, 255, 0.5), 0 0 20px rgba(255, 255, 255, 0.3)' }}>
              Hello, 你是誰？<span className="cursor-blink">_</span>
            </h1>
          </div>

          <div className="text-center font-mono text-sm text-gray-400">
            {isRegistering ? (
              <>
                // 已經有身份？{' '}
                <button onClick={() => { setIsRegistering(false); setStep(0); }} className="text-[#00FF41] hover:underline">[直接登入]</button>
              </>
            ) : (
              <>
                // 還沒有身份？{' '}
                <button onClick={() => { setIsRegistering(true); setStep(0); }} className="text-[#00FF41] hover:underline">[立即註冊]</button>
              </>
            )}
          </div>
          
          <form onSubmit={handleSubmit} className="relative overflow-hidden" style={{ minHeight: '180px'}}>
            <AnimatePresence initial={false} custom={direction}>
                {step === 0 && (
                  <motion.div key={0} custom={direction} variants={slideVariants} initial="hidden" animate="visible" exit="exit" className="absolute w-full space-y-6">
                      {isRegistering ? (
                          <input type="email" placeholder="> 你的 Email:" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-4 bg-[#0a0a0a] border border-[#333] rounded focus:border-[#00FF41] focus:ring-0 outline-none font-mono" autoComplete="off" required />
                      ) : (
                          <input type="text" placeholder="你的名稱：" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-4 bg-[#0a0a0a] border border-[#333] rounded focus:border-[#00FF41] focus:ring-0 outline-none font-mono" autoComplete="off" required />
                      )}
                      
                      <div className="flex flex-col space-y-4">
                        <button type="button" disabled={isLoading} onClick={() => handleNext()} className="mx-auto py-2 px-8 rounded border border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] transition-all duration-200 group font-mono text-sm tracking-widest text-[#00FF41]" style={{ boxShadow: '0 0 5px rgba(0, 255, 65, 0.3)' }}>
                          {isLoading ? '...CHECKING' : '[NEXT]'}
                        </button>
                      </div>
                  </motion.div>
                )}

                {step === 1 && (
                     <motion.div key={1} custom={direction} variants={slideVariants} initial="hidden" animate="visible" exit="exit" className="absolute w-full space-y-6">
                        {isRegistering ? (
                            <input type="text" placeholder="你的名稱：" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-4 bg-[#0a0a0a] border border-[#333] rounded focus:border-[#00FF41] focus:ring-0 outline-none font-mono" autoComplete="off" required />
                        ) : (
                            <SafeWordInput value={safeWord} onChange={(e) => setSafeWord(e.target.value)} required />
                        )}

                        <div className="flex flex-col space-y-4">
                            {isRegistering ? (
                                <button type="button" onClick={() => handleNext()} className="mx-auto py-2 px-8 rounded border border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] transition-all duration-200 group font-mono text-sm tracking-widest text-[#00FF41]" style={{ boxShadow: '0 0 5px rgba(0, 255, 65, 0.3)' }}>
                                  [NEXT]
                                </button>
                            ) : (
                               <button type="submit" disabled={isLoading} className="w-full py-2.5 px-4 rounded border border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] transition-all duration-200 group font-semibold text-[#00FF41]" style={{ boxShadow: '0 0 5px rgba(0, 255, 65, 0.3)' }}>
                                  {isLoading ? '...Verifying' : '> AUTHENTICATE'}
                                </button>
                            )}
                            
                            <div className="text-center">
                              <button type="button" onClick={() => handleStepChange(step - 1)} className="font-mono text-sm text-gray-500 hover:text-white transition-colors py-2">
                                [ &lt; Back ]
                              </button>
                            </div>
                        </div>
                    </motion.div>
                )}

                {step === 2 && isRegistering && (
                     <motion.div key={2} custom={direction} variants={slideVariants} initial="hidden" animate="visible" exit="exit" className="absolute w-full space-y-6">
                        <SafeWordInput value={safeWord} onChange={(e) => setSafeWord(e.target.value)} required />
                        
                        <div className="flex flex-col space-y-4">
                             <button type="submit" disabled={isLoading} className="w-full py-2.5 px-4 rounded border border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] transition-all duration-200 group font-semibold text-[#00FF41]" style={{ boxShadow: '0 0 5px rgba(0, 255, 65, 0.3)' }}>
                                {isLoading ? '...Creating' : '> REGISTER'}
                              </button>
                              
                              <div className="text-center">
                                <button type="button" onClick={() => handleStepChange(step - 1)} className="font-mono text-sm text-gray-500 hover:text-white transition-colors py-2">
                                  [ &lt; Back ]
                                </button>
                              </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
          </form>
        </main>
      </div>
    </>
  );
}