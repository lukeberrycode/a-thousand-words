import ts from "typescript";

// Content files are TypeScript, so importing one runs it, and `prod:content` imports them with
// production settings in the environment. Content isn't reviewed by a person (ADR 0026), so every
// file except the baseline, which the owner reviewed, must be plain data: type-only imports and
// one `export const operations = [...]` of literals. This is checked on the source text, before
// the file is imported.

/** Every way `text`, a content file's source, is more than plain data. Empty if it's only data. */
export function checkSource(name: string, text: string): string[] {
  const file = ts.createSourceFile(`${name}.ts`, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const problems: string[] = [];
  const at = (node: ts.Node) => `${name}.ts:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  let exported = 0;

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) continue;
    const declaration = ts.isVariableStatement(statement) ? statement.declarationList.declarations[0] : undefined;
    if (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.length === 1 &&
      statement.modifiers[0].kind === ts.SyntaxKind.ExportKeyword &&
      statement.declarationList.flags & ts.NodeFlags.Const &&
      statement.declarationList.declarations.length === 1 &&
      declaration &&
      ts.isIdentifier(declaration.name) &&
      declaration.name.text === "operations" &&
      declaration.initializer
    ) {
      exported++;
      const bad = firstNonLiteral(declaration.initializer);
      if (bad) problems.push(`${at(bad)}: operations must be plain data, not ${ts.SyntaxKind[bad.kind]}.`);
      continue;
    }
    problems.push(`${at(statement)}: only \`import type\` and \`export const operations = [...]\` are allowed.`);
  }
  if (exported !== 1) problems.push(`${name}.ts: must have exactly one \`export const operations\`.`);
  return problems;
}

/** The first node in `node` that isn't an array, object, string, number, boolean or null. */
function firstNonLiteral(node: ts.Node): ts.Node | undefined {
  if (ts.isArrayLiteralExpression(node)) {
    for (const e of node.elements) {
      const bad = firstNonLiteral(e);
      if (bad) return bad;
    }
    return undefined;
  }
  if (ts.isObjectLiteralExpression(node)) {
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return p;
      const bad = firstNonLiteral(p.initializer);
      if (bad) return bad;
    }
    return undefined;
  }
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return undefined;
  }
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return undefined;
  }
  return node;
}
