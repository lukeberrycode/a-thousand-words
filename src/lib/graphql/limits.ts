import {
  GraphQLError,
  Kind,
  type ASTVisitor,
  type FragmentDefinitionNode,
  type SelectionSetNode,
  type ValidationContext,
} from "graphql";

// Query limits for the GraphQL API (ADR 0020), checked before anything runs.
// The schema has no cycles (an Author doesn't link back to images), so its deepest real query is
// 6 levels: images → nodes → regions → annotations → author → name. The depth limit allows a
// little headroom and still holds if links are added later. The field limit counts every field
// selected, aliases included, so a query can't repeat an expensive field hundreds of times.

export const MAX_DEPTH = 8;
export const MAX_FIELDS = 200;

/** A validation rule that rejects queries nested deeper than maxDepth or selecting more than maxFields fields. */
export function queryLimits(maxDepth = MAX_DEPTH, maxFields = MAX_FIELDS) {
  return (context: ValidationContext): ASTVisitor => {
    const fragments = new Map<string, FragmentDefinitionNode>();
    for (const def of context.getDocument().definitions) {
      if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
    }

    return {
      OperationDefinition(operation) {
        let fields = 0;
        let deepest = 0;

        // Fragments are expanded where they're used. `seen` stops a fragment cycle looping; the
        // field count stops a fragment reused many times from costing much to walk.
        function walk(set: SelectionSetNode, depth: number, seen: ReadonlySet<string>) {
          for (const selection of set.selections) {
            if (fields > maxFields) return;
            if (selection.kind === Kind.FIELD) {
              // Introspection fields (__schema, __type, __typename) are left out: GraphiQL's own
              // schema query is deep, and production turns introspection off (route.ts).
              if (selection.name.value.startsWith("__")) continue;
              fields++;
              deepest = Math.max(deepest, depth);
              if (selection.selectionSet) walk(selection.selectionSet, depth + 1, seen);
            } else if (selection.kind === Kind.INLINE_FRAGMENT) {
              walk(selection.selectionSet, depth, seen);
            } else {
              const name = selection.name.value;
              const fragment = fragments.get(name);
              if (fragment && !seen.has(name)) walk(fragment.selectionSet, depth, new Set(seen).add(name));
            }
          }
        }

        walk(operation.selectionSet, 1, new Set());

        if (deepest > maxDepth) {
          context.reportError(
            new GraphQLError(`Query is nested too deeply (at most ${maxDepth} levels).`, { nodes: operation }),
          );
        }
        if (fields > maxFields) {
          context.reportError(
            new GraphQLError(`Query selects too many fields (at most ${maxFields}).`, { nodes: operation }),
          );
        }
      },
    };
  };
}
