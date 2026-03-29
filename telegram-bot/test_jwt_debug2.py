"""Отладочный скрипт для проверки JWT валидации с leeway"""
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
print(f"Current: {int(datetime.utcnow().timestamp())}")
print(f"Time until expiration: {exp - int(datetime.utcnow().timestamp())} seconds")

# Пробуем с leeway
try:
    decoded = jwt.decode(
        token, 
        secret, 
        algorithms=['HS256'], 
        options={'verify_exp': True},
        leeway=10  # 10 секунд допуска
    )
    print(f"Decoded with leeway=10: {decoded}")
except jwt.ExpiredSignatureError as e:
    print(f"ExpiredSignatureError with leeway=10: {e}")
except Exception as e:
    print(f"Error with leeway=10: {type(e).__name__}: {e}")

# Пробуем с большим leeway
try:
    decoded = jwt.decode(
        token, 
        secret, 
        algorithms=['HS256'], 
        options={'verify_exp': True},
        leeway=3600  # 1 час допуска
    )
    print(f"Decoded with leeway=3600: {decoded}")
except jwt.ExpiredSignatureError as e:
    print(f"ExpiredSignatureError with leeway=3600: {e}")
except Exception as e:
    print(f"Error with leeway=3600: {type(e).__name__}: {e}")
