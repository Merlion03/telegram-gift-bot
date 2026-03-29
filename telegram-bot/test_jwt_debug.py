"""Отладочный скрипт для проверки JWT валидации"""
import jwt
from datetime import datetime, timedelta

secret = 'test_secret_key_32_characters_long_for_testing'

# Генерируем токен с 1 часом жизни
now = datetime.utcnow()
iat = int(now.timestamp())
exp = int((now + timedelta(hours=1)).timestamp())

payload = {
    'tg_id': 1,
    'role': 0,
    'iat': iat,
    'exp': exp
}

token = jwt.encode(payload, secret, algorithm='HS256')
print(f"Token generated")
print(f"IAT: {iat}")
print(f"EXP: {exp}")
print(f"Diff: {exp - iat} seconds")
print(f"Current time: {int(datetime.utcnow().timestamp())}")

# Пробуем декодировать
try:
    decoded = jwt.decode(token, secret, algorithms=['HS256'], options={'verify_exp': True})
    print(f"Decoded successfully: {decoded}")
except jwt.ExpiredSignatureError as e:
    print(f"ExpiredSignatureError: {e}")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")

# Пробуем без verify_exp
try:
    decoded_no_verify = jwt.decode(token, secret, algorithms=['HS256'], options={'verify_exp': False})
    print(f"Decoded without verify_exp: {decoded_no_verify}")
except Exception as e:
    print(f"Error without verify_exp: {type(e).__name__}: {e}")
