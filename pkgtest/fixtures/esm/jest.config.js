// Test file to verify our integration into other projects
import { getEcmaVersionFromTsConfig } from "@hanseltime/jest-cli-tester";
const TS_CONFIG = "tsconfig.test.json";

export default {
	testTimeout: 15000,
	testEnvironment: "node",
	testPathIgnorePatterns: ["/node_modules/"],
	transform: {
		"\\.[jt]sx?$": [
			"jest-chain-transform",
			{
				transformers: [
					[
						"ts-jest",
						{
							tsconfig: TS_CONFIG,
						},
					],
					// Use the cliTransformer that should have been transpiled before this call
					[
						"@hanseltime/jest-cli-tester/transform",
						{
							ecmaVersion: getEcmaVersionFromTsConfig(TS_CONFIG),
						},
					],
				],
			},
		],
	},
};
