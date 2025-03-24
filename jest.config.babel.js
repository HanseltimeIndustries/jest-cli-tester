/**
 * This tests that our transformer works with babel-jest configurations
 */
const path = require("path");
const {
	getJestNodeModulesTransformIgnore,
} = require("@hanseltime/esm-interop-tools");
const { getEcmaVersionFromTsConfig } = require("./dist/cjs");

const testTSConfig = "tsconfig.test.json";

module.exports = {
	rootDir: path.resolve(__dirname, "tmp", "babel-jest"),
	testTimeout: 15000,
	testEnvironment: "node",
	testPathIgnorePatterns: ["/node_modules/", "/pkgtest/"],
	verbose: true,
	transform: {
		"\\.[jt]sx?$": [
			"jest-chain-transform",
			{
				transformers: [
					[
						"babel-jest",
						{
							shouldPrintComment: (c) => {
								return c.trim().startsWith("@CLITestTransform");
							},
						},
					],
					// Use the cliTransformer that should have been transpiled before this call
					[
						path.join(__dirname, "dist", "cjs", "cliTransformer.js"),
						{
							cliScripts: [
								// asyncCLIScript does not have the specific comment
								new RegExp(".*src/tests/scripts/asyncCLIScript.[jt]s").source,
								//,
							],
							ecmaVersion: getEcmaVersionFromTsConfig(testTSConfig),
						},
					],
				],
			},
		],
	},
	transformIgnorePatterns: [
		getJestNodeModulesTransformIgnore({
			file: "esm-packages.json",
		}),
	],
};
