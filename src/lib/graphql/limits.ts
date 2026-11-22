// Import the GraphQL error class, node kinds, and the types used below.
import {
  // The error type used to report problems.
  GraphQLError,
  // The names of the syntax-tree node kinds.
  Kind,
  // The type returned by a validation rule.
  type ASTVisitor,
  // The type of a named fragment.
  type FragmentDefinitionNode,
  // The type of a block of selected fields.
  type SelectionSetNode,
  // The type of the context passed to a validation rule.
  type ValidationContext,
} from "graphql";

// Query limits for the GraphQL API (ADR 0023), checked before anything runs.
// The schema has no cycles (an Author doesn't link back to images), so its deepest real query is
// 6 levels: images → nodes → regions → annotations → author → name. The depth limit allows a
// little headroom and still holds if links are added later. The field limit counts every field
// selected, aliases and __typename included, as if every fragment were written out in full. The
// top-level limit stops one request asking for many lists at once under different aliases.

// The deepest nesting allowed.
export const MAX_DEPTH = 8;

// The most fields one query may select.
export const MAX_FIELDS = 200;

// The most fields allowed at the top level.
export const MAX_TOP_LEVEL_FIELDS = 3;

/** What a selection set adds up to once its fragments are expanded. */
type Size = { fields: number; depth: number; topLevel: number };

// The size of nothing.
const EMPTY: Size = { fields: 0, depth: 0, topLevel: 0 };

/**
 * A validation rule that rejects queries nested deeper than maxDepth, selecting more than maxFields
 * fields, or with more than maxTopLevel fields at the top.
 */
export function queryLimits(maxDepth = MAX_DEPTH, maxFields = MAX_FIELDS, maxTopLevel = MAX_TOP_LEVEL_FIELDS) {
  // Return the rule, which gets a context for each query being validated.
  return (context: ValidationContext): ASTVisitor => {
    // The query's named fragments, by name.
    const fragments = new Map<string, FragmentDefinitionNode>();

    // Go through everything defined in the query document.
    for (const def of context.getDocument().definitions) {
      // Remember each fragment definition.
      if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
    }

    // Each fragment is measured once and its size reused wherever it's spread, so a fragment used
    // many times costs no more to check than one used once. Walking it again at every spread
    // would let a short document of fragments that each spread the next twice take 2^n steps.
    const sizes = new Map<string, Size>();

    // The fragments being measured right now, used to spot cycles.
    const measuring = new Set<string>();

    // Measure a named fragment.
    function fragmentSize(name: string): Size {
      // Reuse an earlier measurement if there is one.
      const known = sizes.get(name);

      // Return it.
      if (known) return known;

      // Look up the fragment's definition.
      const fragment = fragments.get(name);

      // An unknown fragment or a cycle: graphql's own rules report both, so count nothing here.
      if (!fragment || measuring.has(name)) return EMPTY;

      // Mark it as in progress.
      measuring.add(name);

      // Measure its contents.
      const size = setSize(fragment.selectionSet);

      // Mark it as finished.
      measuring.delete(name);

      // Remember the result.
      sizes.set(name, size);

      // Return it.
      return size;
    }

    // Measure a block of selected fields.
    function setSize(set: SelectionSetNode): Size {
      // Total fields so far.
      let fields = 0;

      // Deepest nesting so far.
      let depth = 0;

      // Total top-level fields so far.
      let topLevel = 0;

      // Look at each selection in turn.
      for (const selection of set.selections) {
        // The size this selection adds.
        let size: Size;

        // A plain field.
        if (selection.kind === Kind.FIELD) {
          // GraphiQL's own schema query is deep, so __schema and __type aren't measured. Production
          // refuses them anyway (NoSchemaIntrospectionCustomRule, in server.ts). __typename counts.
          const name = selection.name.value;

          // Skip the two introspection fields.
          if (name === "__schema" || name === "__type") continue;

          // Measure the field's own sub-selection, if it has one.
          const inner = selection.selectionSet ? setSize(selection.selectionSet) : EMPTY;

          // This field adds one field and one level, and counts as top-level unless it's __typename.
          size = { fields: inner.fields + 1, depth: inner.depth + 1, topLevel: name === "__typename" ? 0 : 1 };
          // An inline fragment (`... on Type { }`).
        } else if (selection.kind === Kind.INLINE_FRAGMENT) {
          // It adds no level of its own, just what's inside.
          size = setSize(selection.selectionSet);
          // A spread of a named fragment.
        } else {
          // Use the fragment's measured size.
          size = fragmentSize(selection.name.value);
        }

        // Add this selection's fields to the total.
        fields += size.fields;

        // Keep the deepest nesting seen.
        depth = Math.max(depth, size.depth);

        // Add its top-level fields to the total.
        topLevel += size.topLevel;
      }

      // Return the totals.
      return { fields, depth, topLevel };
    }

    // Return the visitor that checks each operation.
    return {
      // Called once for each query in the document.
      OperationDefinition(operation) {
        // Measure the whole operation.
        const size = setSize(operation.selectionSet);

        // Too deep?
        if (size.depth > maxDepth) {
          // Report the error against this operation.
          context.reportError(
            new GraphQLError(`Query is nested too deeply (at most ${maxDepth} levels).`, { nodes: operation }),
          );
        }

        // Too many fields?
        if (size.fields > maxFields) {
          // Report the error against this operation.
          context.reportError(
            new GraphQLError(`Query selects too many fields (at most ${maxFields}).`, { nodes: operation }),
          );
        }

        // Too many top-level fields?
        if (size.topLevel > maxTopLevel) {
          // Report the error against this operation.
          context.reportError(
            new GraphQLError(`Query asks for too many things at once (at most ${maxTopLevel} top-level fields).`, {
              nodes: operation,
            }),
          );
        }
      },
    };
  };
}
