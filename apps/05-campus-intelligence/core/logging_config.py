import logging


def configure_logging(log_level: str = "INFO") -> None:
    level = getattr(logging, str(log_level).upper(), logging.INFO)

    if not logging.getLogger().handlers:
        logging.basicConfig(
            level=level,
            format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        )
    else:
        logging.getLogger().setLevel(level)
