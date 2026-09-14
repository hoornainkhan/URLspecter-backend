import { Elysia } from 'elysia'
import { yoga } from '@elysia/graphql-yoga'

import { checkUrl } from './src/checkUrl'

const app = new Elysia().use(
	yoga({
		// Schema-first style of the @elysia/graphql-yoga plugin: typeDefs holds
		// the GraphQL SDL and resolvers maps each field to a function.
		typeDefs: /* GraphQL */ `
			enum UrlCheckErrorCode {
				INVALID_URL
				TIMEOUT
				NETWORK_ERROR
			}

			type UrlCheckError {
				code: UrlCheckErrorCode!
				message: String!
			}

			type UrlCheckResult {
				up: Boolean!
				statusCode: Int
				responseTimeMs: Int!
				error: UrlCheckError
			}

			type Query {
				checkUrl(url: String!): UrlCheckResult!
			}
		`,
		resolvers: {
			Query: {
				// The actual request to the monitored URL happens inside
				// checkUrl() in src/checkUrl.ts.
				checkUrl: async (_, args) => checkUrl(args.url)
			}
		}
	})
).listen(3000);

console.log(`GraphQL server up on ${app.server?.port}`)