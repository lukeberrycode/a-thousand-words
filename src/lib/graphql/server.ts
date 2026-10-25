import { NoSchemaIntrospectionCustomRule, type ValidationRule } from "graphql";
import { createYoga, type Plugin } from "graphql-yoga";
import { queryLimits } from "@/lib/graphql/limits";
import { schema } from "@/lib/graphql/schema";

// The GraphQL server behind /api/graphql (ADR 0023). A function rather than a module-level
// instance, so the tests can build one as production would.

function validationRules(rules: ValidationRule[]): Plugin {
  return { onValidate: ({ addValidationRule }) => rules.forEach(addValidationRule) };
}

export function createGraphQLServer({ production = process.env.NODE_ENV === "production" } = {}) {
  return createYoga({
    schema,
    graphqlEndpoint: "/api/graphql",
    // GraphiQL and introspection only in development. The schema isn't secret (it's in the
    // repository), but turning both off in production is Yoga's guidance and costs nothing here.
    graphiql: !production,
    landingPage: false,
    // Any site may read the API, but never with the visitor's cookies. Yoga's default echoes the
    // caller's origin and allows credentials, which would matter if a resolver ever read the session.
    cors: { origin: "*", credentials: false },
    plugins: [validationRules(production ? [queryLimits(), NoSchemaIntrospectionCustomRule] : [queryLimits()])],
    fetchAPI: { Response },
  });
}
