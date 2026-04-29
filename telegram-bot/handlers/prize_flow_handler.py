"""
DEPRECATED: re-export shim.

Обработчик разбит на пакет :mod:`handlers.prize_flow`. Этот файл сохранён
только для обратной совместимости старых импортов:

.. code-block:: python

    from handlers.prize_flow_handler import PrizeFlowHandler, router

Новый код должен импортировать напрямую из :mod:`handlers.prize_flow`.
"""

from handlers.prize_flow import PrizeFlowHandler, router

__all__ = ["PrizeFlowHandler", "router"]
