/** Read-only static translation reference check. Dynamic keys remain a component-test responsibility. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function filesIn(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const file = join(directory, entry.name);
		if (entry.isDirectory())
			return /^(?:__tests__|__mocks__|mocks)$/.test(entry.name)
				? []
				: filesIn(file);
		return /\.(?:ts|tsx)$/.test(file) && !/\.(?:test|spec|d)\.tsx?$/.test(file)
			? [file]
			: [];
	});
}

function keysOf(resource, prefix = "") {
	return Object.entries(resource).flatMap(([key, value]) => {
		const path = prefix ? `${prefix}.${key}` : key;
		return typeof value === "string" ? [path] : keysOf(value, path);
	});
}

function stringValues(expression) {
	if (!expression) return [];
	if (ts.isStringLiteral(expression)) return [expression.text];
	if (ts.isArrayLiteralExpression(expression))
		return expression.elements.flatMap(stringValues);
	return [];
}

function enclosingScope(node) {
	let ancestor = node.parent;
	while (ancestor && !ts.isFunctionLike(ancestor) && !ts.isSourceFile(ancestor))
		ancestor = ancestor.parent;
	return ancestor;
}

function optionNamespaces(call) {
	const options = call.arguments[1];
	if (!options || !ts.isObjectLiteralExpression(options)) return [];
	const namespace = options.properties.find(
		(property) =>
			ts.isPropertyAssignment(property) && property.name.getText() === "ns",
	);
	return namespace && ts.isPropertyAssignment(namespace)
		? stringValues(namespace.initializer)
		: [];
}

/**
 * Namespace-qualified references are checked in that namespace. Hook-bound t aliases use
 * useTranslation namespaces; unbound utility callbacks use all registered namespaces.
 * i18next plural suffixes are accepted; defaultValue never masks a missing source key.
 */
export function validateTranslationReferences({
	sourceDirectory,
	localesDirectory,
}) {
	const resources = new Map();
	for (const file of readdirSync(join(localesDirectory, "en"))) {
		if (file.endsWith(".json")) {
			resources.set(
				file.slice(0, -5),
				new Set(
					keysOf(
						JSON.parse(
							readFileSync(join(localesDirectory, "en", file), "utf8"),
						),
					),
				),
			);
		}
	}
	const errors = [];
	const checkedFiles = filesIn(sourceDirectory);
	let checkedReferences = 0;
	let dynamicReferences = 0;
	for (const file of checkedFiles) {
		const source = ts.createSourceFile(
			file,
			readFileSync(file, "utf8"),
			ts.ScriptTarget.Latest,
			true,
			file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
		);
		const bindings = new Map();
		function register(node) {
			if (
				ts.isVariableDeclaration(node) &&
				ts.isObjectBindingPattern(node.name) &&
				node.initializer &&
				ts.isCallExpression(node.initializer) &&
				node.initializer.expression.getText(source) === "useTranslation"
			) {
				const scope = enclosingScope(node);
				const scopedBindings = bindings.get(scope) ?? new Map();
				for (const element of node.name.elements) {
					const propertyName =
						element.propertyName?.getText(source) ??
						element.name.getText(source);
					if (propertyName === "t" && ts.isIdentifier(element.name))
						scopedBindings.set(
							element.name.text,
							stringValues(node.initializer.arguments[0]).length
								? stringValues(node.initializer.arguments[0])
								: ["common"],
						);
				}
				bindings.set(scope, scopedBindings);
			}
			ts.forEachChild(node, register);
		}
		register(source);
		function bindingNamespaces(node, name) {
			let scope = enclosingScope(node);
			while (scope) {
				const found = bindings.get(scope)?.get(name);
				if (found) return found;
				scope = enclosingScope(scope);
			}
			return [];
		}
		function check(node) {
			if (ts.isCallExpression(node)) {
				const name = node.expression.getText(source);
				const hookNamespaces = ts.isIdentifier(node.expression)
					? bindingNamespaces(node, name)
					: [];
				const isTranslation =
					hookNamespaces.length || /^(?:t|tk|tt|tm|i18n\.t)$/.test(name);
				if (isTranslation && node.arguments[0]) {
					const argument = node.arguments[0];
					if (
						!ts.isStringLiteral(argument) &&
						!ts.isNoSubstitutionTemplateLiteral(argument)
					) {
						dynamicReferences += 1;
					} else {
						checkedReferences += 1;
						const [explicitNamespace, key] = argument.text.includes(":")
							? argument.text.split(/:(.*)/s, 2)
							: [undefined, argument.text];
						const namespaces = explicitNamespace
							? [explicitNamespace]
							: optionNamespaces(node).length
								? optionNamespaces(node)
								: hookNamespaces.length
									? hookNamespaces
									: name === "i18n.t"
										? ["common"]
										: [...resources.keys()];
						const exists = namespaces.some((namespace) => {
							const keys = resources.get(namespace);
							return (
								keys?.has(key) ||
								["zero", "one", "two", "few", "many", "other"].some((suffix) =>
									keys?.has(`${key}_${suffix}`),
								)
							);
						});
						if (!exists) {
							const position = source.getLineAndCharacterOfPosition(
								node.getStart(source),
							);
							errors.push({
								code: "I18N-REFERENCE-MISSING",
								severity: "error",
								file,
								path: `${position.line + 1}:${position.character + 1}`,
								message: `Translation "${argument.text}" does not exist in English namespace(s): ${namespaces.join(", ")}.`,
								relatedId: argument.text,
							});
						}
					}
				}
			}
			ts.forEachChild(node, check);
		}
		check(source);
	}
	return { errors, checkedFiles, checkedReferences, dynamicReferences };
}
