import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { auth, UNAUTHORIZED_EVENT } from '../lib/api';
import { AuthContext } from './authContext';
import '../styles/paper.css';

type Phase = 'loading' | 'login' | 'ok';

/** パスワード認証が有効なときだけ、ログイン画面で入口を守る。 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [required, setRequired] = useState(false);
  // ログインし直すたびに中身を作り直し、取得に失敗していたデータを読み込み直す
  const [session, setSession] = useState(0);

  useEffect(() => {
    auth.status().then(
      (s) => {
        setRequired(s.required);
        setPhase(s.authenticated ? 'ok' : 'login');
      },
      // 状態を取れないときも中身は出す（各画面側のエラー表示に任せる）
      () => setPhase('ok'),
    );
    const onUnauthorized = () => {
      setRequired(true);
      setPhase('login');
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const logout = useCallback(() => {
    auth.logout().finally(() => setPhase('login'));
  }, []);

  if (phase === 'loading') {
    return <div className="pr"><div className="spinner-wrap"><div className="spinner" /></div></div>;
  }

  if (phase === 'login') {
    return (
      <LoginScreen
        onSuccess={() => {
          setSession((n) => n + 1);
          setPhase('ok');
        }}
      />
    );
  }

  return (
    <AuthContext.Provider value={{ required, logout }}>
      <div key={session}>{children}</div>
    </AuthContext.Provider>
  );
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await auth.login(password);
      setPassword('');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
    }
    setBusy(false);
  };

  return (
    <div className="pr">
      <header className="hero">
        <div className="hero-bg" aria-hidden="true"><i /><i /><i /></div>
        <div className="hero-inner" style={{ minHeight: '70vh', alignContent: 'center' }}>
          <div className="brand">
            <div className="brand-kicker"><span className="ver">litkit</span>文献研究支援システム</div>
            <h1 className="brand-title">ログイン</h1>
            <div className="brand-sub">Sign in</div>
          </div>
          <form onSubmit={submit} style={{ gridArea: 'search' }}>
            <div className="search-wrap">
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="パスワード"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button className="btn-search" type="submit" disabled={busy || !password} style={{ opacity: busy || !password ? 0.6 : 1 }}>
                ログイン
              </button>
            </div>
            {error && <div className="err" role="alert" style={{ maxWidth: 860 }}>{error}</div>}
          </form>
        </div>
      </header>
    </div>
  );
}
