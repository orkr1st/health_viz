import logging
import logging.handlers
from pathlib import Path

LOG_DIR = Path("logs")
LOG_FILE = LOG_DIR / "import.log"

_configured = False


def setup_logging() -> None:
    global _configured
    if _configured:
        return
    LOG_DIR.mkdir(exist_ok=True)

    fmt = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

    handler = logging.handlers.RotatingFileHandler(
        LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    handler.setFormatter(fmt)

    logger = logging.getLogger("health.import")
    logger.setLevel(logging.DEBUG)
    logger.addHandler(handler)
    logger.propagate = False

    _configured = True


def get_import_logger() -> logging.Logger:
    return logging.getLogger("health.import")
