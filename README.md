# URL Specter

A URL monitoring API built incrementally, version by version.

**Version 1** is a minimal GraphQL backend that can check whether a URL is reachable.

## What Version 1 does

URL Specter exposes a single GraphQL operation, `checkUrl`, which:

1. accepts a URL,
2. makes an HTTP request to that URL **from the server**,
3. measures the response time on the server,
4. returns whether the URL is up, the HTTP status code (when a response arrives), and the response time,
5. fails gracefully: invalid URLs, unreachable hosts and timeouts are returned as structured results instead of crashing the server.

## Technology stack

| Piece      | Technology                                    |
| ---------- | --------------------------------------------- |
| Runtime    | [Bun](https://bun.sh)                         |
| Framework  | [Elysia](https://elysiajs.com)                |
| GraphQL    | GraphQL Yoga via `@elysia/graphql-yoga` (GraphQL Yoga 3 + Mobius schema binding) |

## Definition of "up"

For Version 1, a URL is considered **up** when the server receives **any HTTP
response** — a 2xx, 3xx, 4xx, or 5xx — within the request timeout (10 seconds).

A 404 or a 500 still means the server is alive and answering, so the URL is
reported as up. A URL is reported as **down** only when no HTTP response at all
is received: the request timed out, the host could not be resolved, the
connection was refused, the TLS handshake failed, etc. The returned `error`
object explains which case happened.

## Install dependencies

```bash
bun install
```

## Start the server

```bash
bun run dev      # development, restarts on file changes
# or
bun run start    # plain start
```

The server listens on `http://localhost:3000`.

## GraphQL endpoint

The GraphQL endpoint (and a GraphiQL explorer when you open it in a browser)
is:

```
http://localhost:3000/graphql
```

## Available operation

| Operation   | Kind  | Arguments     | Returns                                        |
| ----------- | ----- | ------------- | ---------------------------------------------- |
| `checkUrl`  | Query | `url: String!` | `UrlCheckResult!` (`up`, `statusCode`, `responseTimeMs`, `error`) |

### Example request

```graphql
query CheckUrl($url: String!) {
  checkUrl(url: $url) {
    up
    statusCode
    responseTimeMs
    error {
      code
      message
    }
  }
}
```

```json
{
  "url": "https://example.com"
}
```

### Example response (URL up)

```json
{
  "data": {
    "checkUrl": {
      "up": true,
      "statusCode": 200,
      "responseTimeMs": 212,
      "error": null
    }
  }
}
```

### Example response (URL down)

For example, a URL that times out:

```json
{
  "data": {
    "checkUrl": {
      "up": false,
      "statusCode": null,
      "responseTimeMs": 10000,
      "error": {
        "code": "TIMEOUT",
        "message": "The request to \"https://slow.example.com\" timed out after 10000 ms."
      }
    }
  }
}
```

`error.code` is one of:

- `INVALID_URL` — the input could not be parsed as an `http`/`https` URL.
- `TIMEOUT` — no response arrived within 10 seconds.
- `NETWORK_ERROR` — the request could not be completed (DNS, connection refused, TLS, ...).

## How a request flows

1. `server.ts` mounts the Elysia app with the `yoga()` plugin at `/graphql`.
2. The `checkUrl` query is declared in the GraphQL schema (SDL) and wired to a
   resolver in the same file.
3. The resolver calls `checkUrl(url)` from `src/checkUrl.ts`.
4. `src/checkUrl.ts` validates the URL with the `URL` constructor, then uses
   Bun's `fetch` with an `AbortSignal.timeout(10_000)` (the timeout mechanism
   recommended by the official Bun fetch docs).
5. `performance.now()` is read before and after the request to measure the
   response time in milliseconds.
6. The result object is returned through the resolver and serialized as the
   `UrlCheckResult` GraphQL type.

## Project structure

```
server.ts          Elysia app + GraphQL schema and checkUrl resolver
src/
  checkUrl.ts      URL validation, HTTP request, timing and error classification
package.json       Dependencies and run scripts
tsconfig.json      Editor baseline for Bun/TypeScript
.gitignore         Files and directories not to commit
README.md          This file
```

## What Version 1 intentionally does NOT contain

- Database / persistence / URL history
- Authentication or users
- Background, cron, or interval monitoring jobs
- Queues, Redis, or caching
- Notifications, alerts, or dashboards
- A frontend
- Deployment configuration

## Possible future version

Later versions could add persistence (e.g. PostgreSQL + Prisma), scheduled
monitoring with history, notifications, a dashboard/frontend, authentication,
and SSRF protections. None of these belong in Version 1.