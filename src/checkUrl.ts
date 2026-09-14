/**
 * URL-checking logic for URL Specter.
 *
 * This file lives on its own so the network logic is independent of GraphQL:
 * it only validates the input, performs the HTTP request, measures and
 * classifies the outcome, and returns a plain object. The GraphQL resolver
 * in server.ts is just a thin adapter that forwards this result to clients.
 */

/** Maximum time we wait for a target server to respond, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 10_000

/**
 * Why a URL could not be checked.
 * Kept in sync with the `UrlCheckErrorCode` GraphQL enum in server.ts.
 */
export const UrlCheckErrorCode = {
	/** The input could not be parsed as an http(s) URL. */
	INVALID_URL: 'INVALID_URL',
	/** No HTTP response arrived before the deadline. */
	TIMEOUT: 'TIMEOUT',
	/** The request could not be completed for another reason (DNS failure,
	 *  connection refused, TLS error, ...). */
	NETWORK_ERROR: 'NETWORK_ERROR',
} as const

export type UrlCheckErrorCode = (typeof UrlCheckErrorCode)[keyof typeof UrlCheckErrorCode]

export interface UrlCheckError {
	code: UrlCheckErrorCode
	message: string
}

export interface UrlCheckResult {
	/**
	 * true when we received ANY HTTP response from the target server,
	 * including 3xx/4xx/5xx. "Up" means "the server answered us".
	 */
	up: boolean
	/** The HTTP status code of the response, null when no response arrived. */
	statusCode: number | null
	/** Time from request start until the response or the failure, rounded to whole ms. */
	responseTimeMs: number
	error: UrlCheckError | null
}

/**
 * Checks whether a URL is reachable by making an HTTP GET request from the
 * server side. Never throws for expected failures: every outcome is returned
 * as a structured {@link UrlCheckResult}.
 */
export async function checkUrl(rawUrl: string): Promise<UrlCheckResult> {
	let url: URL
	try {
		url = new URL(rawUrl)
	} catch {
		return unsuccessful(0, UrlCheckErrorCode.INVALID_URL, `"${rawUrl}" is not a valid URL.`)
	}

	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		return unsuccessful(
			0,
			UrlCheckErrorCode.INVALID_URL,
			`Only http and https URLs are supported, got "${url.protocol}//".`,
		)
	}

	// Official Bun docs recommend AbortSignal.timeout for fetch timeouts:
	// https://bun.sh/docs/runtime/networking/fetch#fetching-a-url-with-a-timeout
	// Aborting the request stops a hanging transfer at the deadline instead of
	// waiting indefinitely.
	const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	const startedAt = performance.now()

	try {
		const response = await fetch(url, { signal, redirect: 'follow' })
		return {
			up: true,
			statusCode: response.status,
			responseTimeMs: Math.round(performance.now() - startedAt),
			error: null,
		}
	} catch (error) {
		const responseTimeMs = Math.round(performance.now() - startedAt)

		// An AbortSignal.timeout fires a DOMException named "TimeoutError".
		// Any other thrown error means the request could not be completed at
		// all (DNS lookup, connection refused, TLS handshake, ...).
		if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
			return unsuccessful(
				responseTimeMs,
				UrlCheckErrorCode.TIMEOUT,
				`The request to "${url}" timed out after ${REQUEST_TIMEOUT_MS} ms.`,
			)
		}

		return unsuccessful(
			responseTimeMs,
			UrlCheckErrorCode.NETWORK_ERROR,
			`Could not reach "${url}": ${error instanceof Error ? error.message : String(error)}.`,
		)
	}
}

function unsuccessful(
	responseTimeMs: number,
	code: UrlCheckErrorCode,
	message: string,
): UrlCheckResult {
	return {
		up: false,
		statusCode: null,
		responseTimeMs,
		error: { code, message },
	}
}