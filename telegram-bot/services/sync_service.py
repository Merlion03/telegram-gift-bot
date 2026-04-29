"""
DEPRECATED: re-export shim.

Сервис разбит на пакет :mod:`services.sync`. Этот файл сохранён только
для обратной совместимости старых импортов:

.. code-block:: python

    from services.sync_service import SyncService

Новый код должен импортировать напрямую из :mod:`services.sync`.
"""

from services.sync import SyncService

__all__ = ["SyncService"]
