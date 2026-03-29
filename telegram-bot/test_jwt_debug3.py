"""Отладочный скрипт для детальной проверки JWT"""
import jwt
from datetime import datetime, timedelta, timezone
import time

secret = 'test_secret_key_32_characters_long_for_testing'

# Проверяем разные способы получения времени
print("=== Проверка времени ===")
utcnow = datetime.utcnow()
now_utc = datetime.now(timezone.utc)
print(f"datetime.utcnow(): {utcnow} -> timestamp: {int(utcnow.timestamp())}")
print(f"datetime.now(timezone.utc): {now_utc} -> timestamp: {int(now_utc.timestamp())}")
print(f"time.time(): {int(time.time())}")

# Генерируем токен
iat = int(time.time())
exp = iat + 3600  # +1 час

payload = {
    'tg_id': 1,
    'role': 0,
    'iat': iat,
    'exp': exp
}

token = jwt.encode(payload, secret, algorithm='HS256')
print(f"\n=== Токен ===")
print(f"IAT: {iat}")
print(f"EXP: {exp}")
print(f"Diff: {exp - iat} seconds")

# Декодируем без проверки
decoded_no_verify = jwt.decode(token, secret, algorithms=['HS256'], options={'verify_exp': False})
print(f"\n=== Payload (без verify_exp) ===")
print(decoded_no_verify)

# Проверяем exp вручную
current = int(time.time())
print(f"\n=== Проверка exp ===")
print(f"Current time: {current}")
print(f"Token exp: {exp}")
print(f"Is expired (manual): {current >= exp}")
print(f"Time remaining: {exp - current} seconds")

# Пробуем декодировать с verify_exp
print(f"\n=== Декодирование с verify_exp ===")
try:
    decoded = jwt.decode(token, secret, algorithms=['HS256'], options={'verify_exp': True})
    print(f"SUCCESS: {decoded}")
except jwt.ExpiredSignatureError as e:
    print(f"ExpiredSignatureError: {e}")
    # Проверяем, что PyJWT думает о времени
    import inspect
    print(f"\nПроверяем внутреннее состояние PyJWT...")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
