// Import the rule that blocks schema introspection, and the type for validation rules.
import { NoSchemaIntrospectionCustomRule, type ValidationRule } from "graphql";

// Import the Yoga server factory and its plugin type.
import { createYoga, type Plugin } from "graphql-yoga";

// Import the rule that limits query size and depth.
import { queryLimits } from "@/lib/graphql/limits";

// Import the GraphQL schema.
import { schema } from "@/lib/graphql/schema";

// The GraphQL server behind /api/graphql (ADR 0023). A function rather than a module-level
// instance, so the tests can build one as production would.

// Wrap a list of validation rules in a Yoga plugin.
function validationRules(rules: ValidationRule[]): Plugin {
  // When a query is validated, add each rule to the check.
  return { onValidate: ({ addValidationRule }) => rules.forEach(addValidationRule) };
}

// Build a server; `production` defaults to whether this is a production build.
export function createGraphQLServer({ production = process.env.NODE_ENV === "production" } = {}) {
  // Create and return the Yoga server.
  return createYoga({
    // Serve this schema.
    schema,

    // Answer at this URL path.
    graphqlEndpoint: "/api/graphql",

    // GraphiQL and introspection only in development. The schema isn't secret (it's in the
    // repository), but turning both off in production is Yoga's guidance and costs nothing here.
    graphiql: !production,

    // Turn off Yoga's landing page.
    landingPage: false,

    // Any site may read the API, but never with the visitor's cookies. Yoga's default echoes the
    // caller's origin and allows credentials, which would matter if a resolver ever read the session.
    cors: { origin: "*", credentials: false },

    // Always limit queries; in production, also block introspection.
    plugins: [validationRules(production ? [queryLimits(), NoSchemaIntrospectionCustomRule] : [queryLimits()])],

    // Use Node's built-in Response class.
    fetchAPI: { Response },
  });
}
