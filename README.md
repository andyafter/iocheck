# iocheck

Minimal Node.js and TypeScript service scaffold for an IOC checking API.

## Current Status

- Fastify server bootstrap is in place.
- Pino logging is configured through Fastify.
- The server reads `PORT` from the environment and defaults to `3000`.
- Basic `/healthz`, `/readyz`, `/lookup`, and `/ioc` routes are implemented.
- IOC request validation is handled with Zod.
- No database, cache, Docker, Kubernetes, metrics, or autoscaling are implemented yet.

## Requirements

- Node.js 20+
- npm

## Commands

```sh
npm install
npm run dev
npm run build
npm start
npm run lint
npm run test
```

## Configuration

```sh
PORT=3000
```
