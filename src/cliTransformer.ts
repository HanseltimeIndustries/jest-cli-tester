// @ts-strict-ignore
/**
 * Jest transformer that will scan a program file (i.e. CLI run file) and make it a module
 * for the CLIRunner instance to run so that jest mocks to work on it.
 *
 * Usage:
 *
 * In your jest.config.js add this transformer
 *
 * {
 *   // other config
 *   transform: {
 *     "\\.[jt]sx?$": "<rootDir>/lib/testing/CLIScriptTester/cliTransformer.js",
 *   },
 *   // Configuration for setting up a cli script
 *   globals: {
 *     cliTransformer: {
 *       cliScripts: [ '.*bin/.*.[jt]s' ]
 *     }
 *   }
 * }
 *
 * The cliTransformer's options are controlled by adding a globals entry in your jest config for cliTransformer
 *
 * The only option at the moment is to add a list of regex strings for 'cliScripts' that should match those scripts
 * that you intend to transform.  Please make sure that you are not transforming unintended files.
 */
import type {
	TransformedSource,
	Transformer,
	TransformerCreator,
	TransformOptions,
} from "@jest/transform";
import type {
	ArrowFunctionExpression,
	BlockStatement,
	ecmaVersion,
	ExpressionStatement,
	FunctionExpression,
	Identifier,
	MemberExpression,
	Node,
	SourceLocation,
	TryStatement,
	UnaryExpression,
} from "acorn";
import { parse } from "acorn";
import { simple } from "acorn-walk";
import { fromComment } from "convert-source-map";
import { decode, encode } from "vlq";
import createCacheKeyFunction from "@jest/create-cache-key-function";

type ScriptPaths = string | RegExp;

interface CLITransformerOptions {
	/**
	 * Scripts that don't have the @CLITestTransform comment can still be transformed
	 * by supplying script paths here.
	 *
	 * Note: if you are using a transform that doesn't preserve comments, you would need to use
	 * this or edit your transoform config to keep comments.
	 */
	cliScripts: ScriptPaths[];
	/**
	 * Ecmascript Version
	 */
	ecmaVersion: ecmaVersion;
}

// Only applies if acorn's location option is set, but then its on every node
type WithLocation<T extends Node> = T & {
	loc: SourceLocation;
} & {
	[Prop in keyof T]: T[Prop] extends Node ? WithLocation<T[Prop]> : T[Prop]; // TODO: missing mapped tuples
};

interface Program extends Node {
	type: "Program";
	body: Node[];
}

interface SourceMap {
	version: number;
	sources: string[];
	names: string[];
	mappings: string;
	sourcesContent: string[];
	sourceRoot: string;
	file: string;
}

interface SourceMapConverter {
	toComment(): string;
	sourcemap: SourceMap;
}

let regexArr: null | RegExp[] = null;

const cliRunHelperVarName = "global.___cli_run_helper";

function getRegexArr(options: CLITransformerOptions) {
	if (regexArr) return regexArr;

	if (!options || !options.cliScripts) return [];

	regexArr = options.cliScripts.map((scriptMatch) => {
		if (typeof scriptMatch === "string") {
			return new RegExp(scriptMatch);
		}
		if (scriptMatch instanceof RegExp) {
			return scriptMatch;
		}
		throw new Error(`${JSON.stringify(scriptMatch)} must be a valid regex`);
	});

	return regexArr;
}

function fileIsCliScript(filename: string, options: CLITransformerOptions) {
	return getRegexArr(options).some((regex) => filename.match(regex));
}

function indexOfNth(
	string: string,
	char: string,
	nth: number,
	fromIndex = 0,
): number {
	const indexChar = string.indexOf(char, fromIndex);
	if (indexChar === -1) {
		return -1;
	} else if (nth === 1) {
		return indexChar;
	} else {
		return indexOfNth(string, char, nth - 1, indexChar + 1);
	}
}

/**
 *
 * @param lineNum - one-based line number
 * @param mappingsStr - The mappings string from a sourcemap
 */
function insertNullLineAfter(
	lineNum: number,
	sourceMap: SourceMap,
	numNullLines: number = 1,
): void {
	const lineIdx = indexOfNth(sourceMap.mappings, ";", lineNum);
	sourceMap.mappings = `${sourceMap.mappings.substring(0, lineIdx)}${";".repeat(
		numNullLines,
	)}${sourceMap.mappings.substring(lineIdx)}`;
}

/**
 *
 * @param lineNum - one-based line number
 * @param mappingsStr - The mappings string from a sourcemap
 */
function insertNullLineBefore(
	lineNum: number,
	sourceMap: SourceMap,
	numNullLines: number = 1,
): void {
	const lineIdx =
		lineNum <= 1 ? 0 : indexOfNth(sourceMap.mappings, ";", lineNum - 1);
	sourceMap.mappings = `${sourceMap.mappings.substring(0, lineIdx)}${";".repeat(
		numNullLines,
	)}${sourceMap.mappings.substring(lineIdx)}`;
}

// Applies the actual module wrapping, including source map modification (only for inline-source maps right now)
function moduleWrap(
	src: string,
	programNode: WithLocation<Program>,
	sourceCommentNode: { start?: number; end?: number },
	voidExpression: WithLocation<UnaryExpression> | undefined,
	catchInserts: WithLocation<BlockStatement>[],
): string {
	let execLogicEnd = sourceCommentNode.start ?? programNode.end;
	let endString = src.substring(execLogicEnd);

	let convertedMap: SourceMapConverter;
	let origSourceMap: string;
	const numSkipLines = 4;
	if (sourceCommentNode.start) {
		// TODO: this won't work if they're not inline source maps
		origSourceMap = src.substring(
			sourceCommentNode.start,
			sourceCommentNode.end,
		);
		convertedMap = fromComment(origSourceMap);

		// Compensate for void replacement with await
		if (voidExpression) {
			const voidLineIdx = indexOfNth(
				convertedMap.sourcemap.mappings,
				";",
				voidExpression.loc.start.line - 1,
			);
			const nextLineIdx = indexOfNth(
				convertedMap.sourcemap.mappings,
				";",
				voidExpression.loc.start.line,
			);
			const str = convertedMap.sourcemap.mappings.substring(
				voidLineIdx + 1,
				nextLineIdx < 0 ? convertedMap.sourcemap.mappings.length : nextLineIdx,
			);
			let col = 0;
			const shifted = str
				.split(",")
				.map((s) => {
					const mapLocation = decode(s);
					col += mapLocation[0];
					if (col > voidExpression.loc.start.column) {
						const newLoc = [...mapLocation];
						newLoc[0] = newLoc[0] + 1;
						return encode(newLoc);
					}
					return encode(mapLocation);
				})
				.join(",");
			const linesUpToShifted = convertedMap.sourcemap.mappings.substring(
				0,
				voidLineIdx + 1,
			);
			const linesAfterShifted =
				nextLineIdx > 0
					? convertedMap.sourcemap.mappings.substring(nextLineIdx)
					: "";
			convertedMap.sourcemap.mappings = `${linesUpToShifted}${shifted}${linesAfterShifted}`;
		}

		// Get the program start line and add 4 lines for the modules export syntax
		insertNullLineBefore(
			programNode.loc.start.line,
			convertedMap.sourcemap,
			numSkipLines,
		);
	} else {
		// TODO: try to generate a source map if one does not exist
		console.warn(
			"WARNING: Looks like you don't have inline source-maps right now!  Map generation has not been added yet",
		);
		convertedMap = fromComment("");
		origSourceMap = "";
	}
	// TODO: apply validation of the source map to ensure we didn't mess it up

	// Go ahead and replace the void with await right now
	if (voidExpression) {
		const voidIndex = src.indexOf("void", voidExpression.start);
		src = `${src.substring(0, voidIndex)}await${src.substring(voidIndex + 4)}`;
	}

	const handleSkipLine = `\n${cliRunHelperVarName}.handleProcessExitCatchFinally();\n`;
	const catchInserted = catchInserts
		.sort((ins1, ins2) => ins1.start - ins2.start) // Order so that we can bump indexes
		.reduce((insertTo, insert, idx) => {
			const bodyStartIdx = insert.body[0].start + idx * handleSkipLine.length;
			execLogicEnd = execLogicEnd + handleSkipLine.length;
			insertNullLineAfter(
				insert.loc.start.line + numSkipLines + idx,
				convertedMap.sourcemap,
				2,
			);
			return (
				`${insertTo.substring(0, bodyStartIdx)}` +
				handleSkipLine +
				`${insertTo.substring(bodyStartIdx)}`
			);
		}, src);

	// TODO: apply validation of the source map to ensure we didn't mess it up

	// Create the modified source map comment (inline)
	endString = endString.replace(origSourceMap, convertedMap.toComment());
	return (
		`${catchInserted.substring(0, programNode.start)}\n` +
		"module.exports = {\n" +
		"wrapped: true,\n" +
		`run: async function() {\n` +
		`${catchInserted.substring(programNode.start, execLogicEnd)}\n` +
		"}\n" +
		"};\n" +
		`${endString}`
	);
}

function wrapCLIVoidPromises(
	src: string,
	filename: string,
	options: CLITransformerOptions,
): string {
	let sourceMapIndex: {
		start?: number;
		end?: number;
	} = {};

	let transformComment = false;
	let tree: Program;
	try {
		tree = parse(src, {
			ecmaVersion: options.ecmaVersion,
			allowHashBang: true,
			locations: true,
			onComment: (_isBlock, text, start, end) => {
				if (text.startsWith("# sourceMappingURL=")) {
					sourceMapIndex = {
						start,
						end,
					};
				}
				// look for @CLITest comment
				if (text.trim() === "@CLITestTransform") {
					transformComment = true;
				}
			},
		});
	} catch (e) {
		console.error(
			`Unable to transform ${filename} - parser error: ${e instanceof Error ? e.message : JSON.stringify(e)}`,
		);
		throw e;
	}

	// If __cli_run_helper is on the context, we're in the isolated module and automatically need to perform catch insertion
	if (!(global as any).___cli_run_helper) {
		if (!transformComment && !fileIsCliScript(filename, options)) return src;
	}

	console.debug(
		`TRANSFORMED FOR CLI TESTING (${transformComment ? "by comment" : "by file match"}): ${filename}`,
	);

	if (tree.type === "Program") {
		const prog = tree as WithLocation<Program>;

		let topLevelVoids = 0;
		let catchInserts = [] as WithLocation<BlockStatement>[];
		let voidExpression: WithLocation<UnaryExpression> | undefined;
		// replace top-level void expressions with awaits
		prog.body.forEach((node) => {
			if (node.type === "ExpressionStatement") {
				const statement = node as ExpressionStatement;
				if (statement.expression.type === "UnaryExpression") {
					const unary = statement.expression as WithLocation<UnaryExpression>;
					// Look for void calls at the program level to stub
					if (unary.operator === "void") {
						topLevelVoids++;
						if (topLevelVoids > 1) {
							throw new Error(`You are attempting to MockCLIRun transform a cli script with more than one void promise method call.
                            Please only have 1 for easier testing.
                            ${src.substr(statement.start, statement.end)}`);
						}
						voidExpression = unary;
					}
					const promiseCatchIdEnds: number[] = [];
					simple(unary, {
						MemberExpression(node) {
							const cast = node as MemberExpression;
							if ((cast.property as Identifier).name === "catch") {
								promiseCatchIdEnds.push(cast.end);
							}
						},
					});
					// Find the catch statement that follows our literal call so we can insert
					catchInserts = promiseCatchIdEnds.map((idEnd) => {
						let candidateDiff = Number.MAX_SAFE_INTEGER;
						let candidateNode: WithLocation<BlockStatement>;
						const inlineFunctionFind = (
							node: ArrowFunctionExpression | FunctionExpression,
							_state: unknown,
						) => {
							const cast = node as WithLocation<ArrowFunctionExpression>;
							if (cast.start > idEnd) {
								const diff = cast.start - idEnd;
								if (diff < candidateDiff) {
									candidateDiff = diff;
									candidateNode = cast.body as WithLocation<BlockStatement>;
								}
							}
						};
						simple(unary.argument, {
							ArrowFunctionExpression: inlineFunctionFind,
							FunctionExpression: inlineFunctionFind,
							// TODO: function references
						});

						return candidateNode!;
					});
				}
			}
		});

		// Find all try-catches to allow process.exit and abort to pass through
		simple(prog, {
			TryStatement: (node: TryStatement, _state: unknown) => {
				// The typings here don't seem to make sense to me. Our TryStatement
				// doesn't match that of acorn.
				const cast = node;
				if (cast.handler) {
					catchInserts.push(cast.handler.body as WithLocation<BlockStatement>);
				}
				if (cast.finalizer) {
					catchInserts.push(cast.finalizer as WithLocation<BlockStatement>);
				}
			},
		});

		return moduleWrap(src, prog, sourceMapIndex, voidExpression, catchInserts);
	}
	// For whatever reason we didn't look up a program
	return src;
}

const DEFAULT_OPTIONS: Omit<CLITransformerOptions, "ecmaVersion"> = {
	cliScripts: [],
};

const cliTransformerFactory: {
	createTransformer: TransformerCreator<
		Transformer<CLITransformerOptions>,
		CLITransformerOptions
	>;
} = {
	createTransformer(
		options?: CLITransformerOptions,
	): Transformer<CLITransformerOptions> {
		if (!options?.ecmaVersion) {
			throw new Error("Must supply ecmaVersion property for cliTransformer");
		}
		const opts = {
			...DEFAULT_OPTIONS,
			...options,
		};
		return {
			// Automatically keys on source and then we use the specific config
			getCacheKey: createCacheKeyFunction(
				[],
				[JSON.stringify(opts)],
			) as Transformer<CLITransformerOptions>["getCacheKey"],
			process(
				src: string,
				filename: string,
				_fullOpts?: TransformOptions<CLITransformerOptions>, // covered by the factory
			): TransformedSource {
				return {
					code: wrapCLIVoidPromises(src, filename, opts),
				};
			},
		};
	},
};

export default cliTransformerFactory;
