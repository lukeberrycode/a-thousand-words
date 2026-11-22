// Import the factory that builds the GraphQL server.
import { createGraphQLServer } from "@/lib/graphql/server";

// Read-only GraphQL API (ADR 0023). GET and POST both run queries; Yoga refuses mutations over
// GET, and the schema has none anyway. In development, GET from a browser opens GraphiQL.

// Build one server instance, shared by every request to this route.
const server = createGraphQLServer();

// Handle GET requests (queries, and GraphiQL in development).
export async function GET(request: Request) {
  // Pass the request to Yoga, with an empty context.
  return server.handleRequest(request, {});
}

// Handle POST requests (queries).
export async function POST(request: Request) {
  // Pass the request to Yoga, with an empty context.
  return server.handleRequest(request, {});
}

// Handle OPTIONS requests (CORS preflight).
export async function OPTIONS(request: Request) {
  // Pass the request to Yoga, which answers the preflight.
  return server.handleRequest(request, {});
}
