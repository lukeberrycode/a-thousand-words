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
// selected, aliases and __typename included, as if every fragment were written out in full. The
// top-level limit stops one request asking for many lists at once under different aliases.

export const MAX_DEPTH = 8;
export const MAX_FIELDS = 200;
export const MAX_TOP_LEVEL_FIELDS = 3;

/** What a selection set adds up to once its fragments are expanded. */
type Size = { fields: number; depth: number; topLevel: number };

const EMPTY: Size = { fields: 0, depth: 0, topLevel: 0 };

/**
 * A validation rule that rejects queries nested deeper than maxDepth, selecting more than maxFields
 * fields, or with more than maxTopLevel fields at the top.
 */
export function queryLimits(maxDepth = MAX_DEPTH, maxFields = MAX_FIELDS, maxTopLevel = MAX_TOP_LEVEL_FIELDS) {
  return (context: ValidationContext): ASTVisitor => {
    const fragments = new Map<string, FragmentDefinitionNode>();
    for (const def of context.getDocument().definitions) {
      if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
    }

    // Each fragment is measured once and its size reused wherever it's spread, so a fragment used
    // many times costs no more to check than one used once. Walking it again at every spread
    // would let a short document of fragments that each spread the next twice take 2^n steps.
    const sizes = new Map<string, Size>();
    const measuring = new Set<string>();

    function fragmentSize(name: string): Size {
      const known = sizes.get(name);
      if (known) return known;
      const fragment = fragments.get(name);
      // An unknown fragment or a cycle: graphql's own rules report both, so count nothing here.
      if (!fragment || measuring.has(name)) return EMPTY;
      measuring.add(name);
      const size = setSize(fragment.selectionSet);
      measuring.delete(name);
      sizes.set(name, size);
      return size;
    }

    function setSize(set: SelectionSetNode): Size {
      let fields = 0;
      let depth = 0;
      let topLevel = 0;
      for (const selection of set.selections) {
        let size: Size;
        if (selection.kind === Kind.FIELD) {
          // GraphiQL's own schema query is deep, so __schema and __type aren't measured. Production
          // refuses them anyway (NoSchemaIntrospectionCustomRule, in server.ts). __typename counts.
          const name = selection.name.value;
          if (name === "__schema" || name === "__type") continue;
          const inner = selection.selectionSet ? setSize(selection.selectionSet) : EMPTY;
          size = { fields: inner.fields + 1, depth: inner.depth + 1, topLevel: name === "__typename" ? 0 : 1 };
        } else if (selection.kind === Kind.INLINE_FRAGMENT) {
          size = setSize(selection.selectionSet);
        } else {
          size = fragmentSize(selection.name.value);
        }
        fields += size.fields;
        depth = Math.max(depth, size.depth);
        topLevel += size.topLevel;
      }
      return { fields, depth, topLevel };
    }

    return {
      OperationDefinition(operation) {
        const size = setSize(operation.selectionSet);
        if (size.depth > maxDepth) {
          context.reportError(
            new GraphQLError(`Query is nested too deeply (at most ${maxDepth} levels).`, { nodes: operation }),
          );
        }
        if (size.fields > maxFields) {
          context.reportError(
            new GraphQLError(`Query selects too many fields (at most ${maxFields}).`, { nodes: operation }),
          );
        }
        if (size.topLevel > maxTopLevel) {
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
