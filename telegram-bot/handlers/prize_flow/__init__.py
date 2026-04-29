"""
Пакет :mod:`handlers.prize_flow` — обработчик процесса получения приза.

Структура:

* :mod:`handlers.prize_flow.start`      — точка входа Prize Flow.
* :mod:`handlers.prize_flow.consent`    — GDPR согласие.
* :mod:`handlers.prize_flow.code_word`  — ввод кодового слова.
* :mod:`handlers.prize_flow.digital`    — выдача цифрового приза.
* :mod:`handlers.prize_flow.physical`   — форма физического приза.
* :mod:`handlers.prize_flow.navigation` — back/help-callback'и.
* :mod:`handlers.prize_flow.handler`    — фасад :class:`PrizeFlowHandler`.
"""

from handlers.prize_flow.handler import PrizeFlowHandler, router

__all__ = ["PrizeFlowHandler", "router"]
