"""Throttle en memoria para el login (anti fuerza bruta).

Sin dependencias externas: alcanza para un despliegue local de un solo
proceso. Cuenta intentos fallidos por clave (IP + email) y bloquea
temporalmente cuando se supera el límite.
"""

import threading
import time

from app.core.config import settings


class LoginThrottle:
    def __init__(
        self,
        max_attempts: int | None = None,
        lockout_seconds: int | None = None,
    ) -> None:
        self.max_attempts = max_attempts or settings.login_max_attempts
        self.lockout_seconds = lockout_seconds or settings.login_lockout_seconds
        self._lock = threading.Lock()
        # clave -> (cantidad de fallos, timestamp del último fallo)
        self._failures: dict[str, tuple[int, float]] = {}

    def _prune(self, now: float) -> None:
        expired = [k for k, (_, ts) in self._failures.items() if now - ts > self.lockout_seconds]
        for k in expired:
            del self._failures[k]

    def retry_after(self, key: str) -> int:
        """Segundos de espera restantes; 0 si la clave no está bloqueada."""
        now = time.monotonic()
        with self._lock:
            self._prune(now)
            entry = self._failures.get(key)
            if not entry or entry[0] < self.max_attempts:
                return 0
            return max(1, int(self.lockout_seconds - (now - entry[1])))

    def register_failure(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            count, _ = self._failures.get(key, (0, now))
            self._failures[key] = (count + 1, now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def clear(self) -> None:
        """Vacía todo el estado (para tests)."""
        with self._lock:
            self._failures.clear()


login_throttle = LoginThrottle()
