import os
import random
import uuid

from locust import HttpUser, between, task


def env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return int(value)


def env_weight(name: str, default: int) -> int:
    return max(env_int(name, default), 0)


def env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return float(value)


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_csv(name: str, default: list[str]) -> list[str]:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


def unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def generated_seed_iocs(count: int) -> tuple[list[str], list[str], list[str]]:
    ips = [f"10.66.{n // 256}.{n % 256}" for n in range(1, count + 1)]
    domains = [f"seed-{n:03d}.bad-ioc.example" for n in range(1, count + 1)]
    sha256s = [f"{n:x}".rjust(64, "0") for n in range(1, count + 1)]

    return ips, domains, sha256s


GENERATED_SEED_COUNT = env_int("IOCHECK_GENERATED_SEED_COUNT", 0)
GENERATED_IPS, GENERATED_DOMAINS, GENERATED_SHA256S = generated_seed_iocs(GENERATED_SEED_COUNT)

LOOKUP_IPS = env_csv("IOCHECK_LOOKUP_IPS", ["8.8.8.8", "185.15.59.224", "1.1.1.1"])
LOOKUP_DOMAINS = env_csv(
    "IOCHECK_LOOKUP_DOMAINS",
    ["evil-phishing-login.com", "suspicious-tracker.net", "example.com"],
)
LOOKUP_SHA256S = env_csv(
    "IOCHECK_LOOKUP_SHA256S",
    ["e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
)
LOOKUP_IPS = unique(LOOKUP_IPS + GENERATED_IPS)
LOOKUP_DOMAINS = unique(LOOKUP_DOMAINS + GENERATED_DOMAINS)
LOOKUP_SHA256S = unique(LOOKUP_SHA256S + GENERATED_SHA256S)

TASK_WEIGHTS = {
    "lookup": env_weight("IOCHECK_LOOKUP_WEIGHT", 80),
    "healthz": env_weight("IOCHECK_HEALTHZ_WEIGHT", 10),
    "readyz": env_weight("IOCHECK_READYZ_WEIGHT", 10),
    "metrics": env_weight("IOCHECK_METRICS_WEIGHT", 0),
    "upsert": env_weight("IOCHECK_UPSERT_WEIGHT", 0),
}
if sum(TASK_WEIGHTS.values()) == 0:
    TASK_WEIGHTS["lookup"] = 1

WRITE_ENABLED = env_bool("IOCHECK_WRITE_ENABLED", False)
UPSERT_SOURCE = os.getenv("IOCHECK_UPSERT_SOURCE", "locust")
UPSERT_SCORE = env_int("IOCHECK_UPSERT_SCORE", 50)


class IocheckUser(HttpUser):
    host = os.getenv("IOCHECK_BASE_URL", "http://127.0.0.1:3000")
    wait_time = between(
        env_float("IOCHECK_WAIT_MIN_SECONDS", 0.1),
        env_float("IOCHECK_WAIT_MAX_SECONDS", 1.0),
    )

    @task
    def traffic_mix(self) -> None:
        task_name = random.choices(
            list(TASK_WEIGHTS.keys()),
            weights=list(TASK_WEIGHTS.values()),
            k=1,
        )[0]

        if task_name == "lookup":
            self.lookup()
        elif task_name == "healthz":
            self.healthz()
        elif task_name == "readyz":
            self.readyz()
        elif task_name == "metrics":
            self.metrics()
        elif task_name == "upsert":
            self.upsert()

    def lookup(self) -> None:
        ioc_type, value = random.choice(
            [
                ("ip", random.choice(LOOKUP_IPS)),
                ("domain", random.choice(LOOKUP_DOMAINS)),
                ("sha256", random.choice(LOOKUP_SHA256S)),
            ]
        )

        self.client.post(
            "/lookup",
            json={"type": ioc_type, "value": value},
            name="POST /lookup",
        )

    def healthz(self) -> None:
        self.client.get("/healthz", name="GET /healthz")

    def readyz(self) -> None:
        self.client.get("/readyz", name="GET /readyz")

    def metrics(self) -> None:
        self.client.get("/metrics", name="GET /metrics")

    def upsert(self) -> None:
        if not WRITE_ENABLED:
            self.lookup()
            return

        self.client.post(
            "/ioc",
            json={
                "type": "domain",
                "value": f"locust-{uuid.uuid4().hex}.example.test",
                "source": UPSERT_SOURCE,
                "score": UPSERT_SCORE,
            },
            name="POST /ioc",
        )
