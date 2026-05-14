# API Curl Examples

Start the API first:

```sh
npm run dev
```

## Health Check

Checks whether the service process is running.

```sh
curl -i http://localhost:3000/healthz
```

## Readiness Check

Checks whether the service is ready to receive traffic. Currently this returns ready without checking PostgreSQL yet.

```sh
curl -i http://localhost:3000/readyz
```

## Lookup IOC

Valid lookup request. Currently this always returns `{"verdict":"unknown"}` because database lookup is not wired in yet.

```sh
curl -i -X POST http://localhost:3000/lookup \
  -H "Content-Type: application/json" \
  -d '{"type":"domain","value":"example.com"}'
```

## Invalid Lookup

Shows request validation. `url` is not a supported IOC type, so this should return `400`.

```sh
curl -i -X POST http://localhost:3000/lookup \
  -H "Content-Type: application/json" \
  -d '{"type":"url","value":"https://example.com"}'
```

## Add IOC

Valid IOC create/upsert-shaped request. Currently this does not persist to PostgreSQL; it echoes the input and adds a temporary `added_at` timestamp.

```sh
curl -i -X POST http://localhost:3000/ioc \
  -H "Content-Type: application/json" \
  -d '{"type":"sha256","value":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","source":"manual","score":80}'
```

## Invalid IOC

Shows score validation. Scores must be integers from `0` to `100`, so this should return `400`.

```sh
curl -i -X POST http://localhost:3000/ioc \
  -H "Content-Type: application/json" \
  -d '{"type":"ip","value":"127.0.0.1","source":"manual","score":101}'
```

## Future DB-Backed Flow

These examples are for the next step, after `/ioc` persists to PostgreSQL and `/lookup` fetches from it.

First, insert or update an IOC:

```sh
curl -i -X POST http://localhost:3000/ioc \
  -H "Content-Type: application/json" \
  -d '{"type":"domain","value":"bad.example","source":"manual","score":90}'
```

Then, look up the same IOC:

```sh
curl -i -X POST http://localhost:3000/lookup \
  -H "Content-Type: application/json" \
  -d '{"type":"domain","value":"bad.example"}'
```

Expected future DB-backed response shape:

```json
{
  "verdict": "malicious",
  "ioc": {
    "type": "domain",
    "value": "bad.example",
    "source": "manual",
    "score": 90,
    "added_at": "..."
  }
}
```
