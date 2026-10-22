import { createGraphQLServer } from "@/lib/graphql/server";

// Read-only GraphQL API (ADR 0020). GET and POST both run queries; Yoga refuses mutations over
// GET, and the schema has none anyway. In development, GET from a browser opens GraphiQL.

const server = createGraphQLServer();

export async function GET(request: Request) {
  return server.handleRequest(request, {});
}

export async function POST(request: Request) {
  return server.handleRequest(request, {});
}

export async function OPTIONS(request: Request) {
  return server.handleRequest(request, {});
}
