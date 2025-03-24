const path = require("path");
const {
	getJestNodeModulesTransformIgnore,
} = require("@hanseltime/esm-interop-tools");
const { getEcmaVersionFromTsConfig } = require("./dist/cjs");

const testTSConfig = "tsconfig.test.json";

module.exports = {
	rootDir: path.resolve(__dirname, "src"),
	testTimeout: 15000,
	testEnvironment: "node",
	testPathIgnorePatterns: ["/node_modules/", "/pkgtest/"],
	verbose: true,
	transform: {
		"\\.tsx?$": [
			"jest-chain-transform",
			{
				transformers: [
					[
						"ts-jest",
						{
							tsconfig: testTSConfig,
						},
					],
					// Use the cliTransformer that should have been transpiled before this call
					[
						path.join(__dirname, "dist", "cjs", "cliTransformer.js"),
						{
							cliScripts: [
								// asyncCLIScript does not have the specific comment
								/.*src\/tests\/scripts\/asyncCLIScript.[jt]s/.source,
							],
							ecmaVersion: getEcmaVersionFromTsConfig(testTSConfig),
						},
					],
				],
			},
		],
		"\\.jsx?$": [
			"jest-chain-transform",
			{
				transformers: [
					"babel-jest",
					{
						plugins: ["@babel/plugin-transform-modules-commonjs"],
					},
					// Use the cliTransformer that should have been transpiled before this call
					[
						path.join(__dirname, "dist", "cjs", "cliTransformer.js"),
						{
							cliScripts: [
								// asyncCLIScript does not have the specific comment
								/.*src\/tests\/scripts\/asyncCLIScript.[jt]s/.source,
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
