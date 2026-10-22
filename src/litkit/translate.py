"""軽量な英→日翻訳ユーティリティ。MyMemory Translation APIを使用。"""

from __future__ import annotations

import httpx

_ENDPOINT = "https://api.mymemory.translated.net/get"


async def translate_to_ja(text: str) -> str | None:
    """英語テキストを日本語に翻訳する。失敗時は None を返す。"""
    if not text or not text.strip():
        return None
    results = await translate_batch_to_ja([text])
    return results[0]


async def translate_batch_to_ja(texts: list[str]) -> list[str | None]:
    """複数テキストを並列で翻訳する。"""
    if not texts:
        return []

    async with httpx.AsyncClient(timeout=8) as client:
        tasks = [_translate_one(client, t[:400]) for t in texts]
        import asyncio
        return list(await asyncio.gather(*tasks))


async def _translate_one(client: httpx.AsyncClient, text: str) -> str | None:
    if not text or not text.strip():
        return None
    try:
        resp = await client.get(
            _ENDPOINT,
            params={"q": text, "langpair": "en|ja"},
        )
        resp.raise_for_status()
        data = resp.json()
        translated = data.get("responseData", {}).get("translatedText", "")
        if translated and translated != text:
            return translated
        return None
    except Exception:
        return None
