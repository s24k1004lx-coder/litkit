"""パスワード認証（任意）。環境変数 LITKIT_PASSWORD を設定したときだけ有効になる。

Cloudflare Tunnel などで外部から開けるようにするときの入口を守るためのもの。
- パスワードは .env に書く（Git には入らない）。画面でログインすると署名付きの Cookie を発行する。
- Cookie の署名鍵はパスワードから導出するため、パスワードを変えると全セッションが無効になる。
- パスワード未設定のまま Cloudflare 経由のアクセスが来た場合は、公開状態を避けるため拒否する。
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from collections import deque

from fastapi import Request

COOKIE = "litkit_session"
SESSION_SECONDS = 30 * 24 * 3600

_LOOPBACK = {"127.0.0.1", "::1", "localhost"}


def password() -> str | None:
    """設定されているパスワード。未設定なら None（認証なし＝ローカル利用）。"""
    return os.environ.get("LITKIT_PASSWORD") or None


def _key(pw: str) -> bytes:
    return hashlib.sha256(("litkit-session-v1|" + pw).encode("utf-8")).digest()


def make_token(pw: str, now: float | None = None) -> str:
    expires = int((now if now is not None else time.time()) + SESSION_SECONDS)
    sig = hmac.new(_key(pw), str(expires).encode(), hashlib.sha256).hexdigest()
    return f"{expires}.{sig}"


def verify_token(pw: str, token: str | None, now: float | None = None) -> bool:
    if not token or "." not in token:
        return False
    expires_s, _, sig = token.partition(".")
    if not expires_s.isdigit():
        return False
    if int(expires_s) < (now if now is not None else time.time()):
        return False
    expected = hmac.new(_key(pw), expires_s.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


def check_password(pw: str, given: str) -> bool:
    """長さが違っても処理時間が変わらないよう、ハッシュ同士を定数時間で比較する。"""
    a = hashlib.sha256(pw.encode("utf-8")).digest()
    b = hashlib.sha256(given.encode("utf-8")).digest()
    return hmac.compare_digest(a, b)


def is_proxied_by_cloudflare(request: Request) -> bool:
    return "cf-connecting-ip" in request.headers or "cf-ray" in request.headers


def client_key(request: Request) -> str:
    """ログイン試行の制限に使うクライアント識別子。Cloudflare 経由ならその元IPを使う。"""
    host = request.client.host if request.client else "unknown"
    if host in _LOOPBACK:
        # トンネル(cloudflared)は localhost から接続してくるため、元IPはヘッダから取る
        return request.headers.get("cf-connecting-ip", host)
    return host


def is_secure_request(request: Request) -> bool:
    """HTTPS でアクセスされているか（Cookie の Secure 属性用。トンネル経由はヘッダで判定）。"""
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"


class LoginThrottle:
    """ログイン失敗の回数制限。クライアントごとと全体の両方で制限する。"""

    def __init__(self, per_client: int = 5, overall: int = 30, window: float = 300.0):
        self.per_client = per_client
        self.overall = overall
        self.window = window
        self._by_client: dict[str, deque[float]] = {}
        self._all: deque[float] = deque()

    def _prune(self, q: deque[float], now: float) -> None:
        while q and now - q[0] > self.window:
            q.popleft()

    def allowed(self, key: str, now: float | None = None) -> bool:
        now = now if now is not None else time.time()
        self._prune(self._all, now)
        q = self._by_client.get(key)
        if q is not None:
            self._prune(q, now)
        return len(self._all) < self.overall and (q is None or len(q) < self.per_client)

    def fail(self, key: str, now: float | None = None) -> None:
        now = now if now is not None else time.time()
        self._all.append(now)
        self._by_client.setdefault(key, deque()).append(now)

    def reset(self, key: str) -> None:
        self._by_client.pop(key, None)


throttle = LoginThrottle()
