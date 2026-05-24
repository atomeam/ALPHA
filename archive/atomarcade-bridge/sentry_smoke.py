import sentry_sdk

sentry_sdk.init(
    dsn="https://4b455e8b7ec5c38ba72028e4d4fe8dcf@o4511372330205184.ingest.us.sentry.io/4511374330363904",
    traces_sample_rate=1.0,
    environment="ci",
    release="atomarcade-bridge@0.0.1",
)
sentry_sdk.capture_message("AtomArcade Bridge online ✅ (smoke test)")
try:
    raise ZeroDivisionError("smoke test")
except ZeroDivisionError as e:
    sentry_sdk.capture_exception(e)
sentry_sdk.flush(timeout=5)
