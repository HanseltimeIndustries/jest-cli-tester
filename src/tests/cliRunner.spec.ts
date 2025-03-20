import { extname } from "path";
import { CLIRunner } from "../CLIRunner";

const mockLogFn = jest.spyOn(console, "log");

async function checkForExit(
	runFunc: () => Promise<any>,
	exitMsg: string | null,
	runHasThrowSetting: boolean,
) {
	if (runHasThrowSetting) {
		if (!exitMsg) {
			await runFunc();
		} else {
			await expect(runFunc).rejects.toThrow(exitMsg);
		}
	} else {
		if (!exitMsg) {
			expect(await runFunc()).toBeNull();
		} else {
			expect(await runFunc()).toBe(exitMsg);
		}
	}
}

describe.each([
	[true],
	// [false]
])("cliRunner (Throws exit calls: %s)", (runHasThrowSetting: boolean) => {
	beforeEach(() => {
		mockLogFn.mockClear();
	});
	const cliRunner = new CLIRunner({
		throwProcessErrors: runHasThrowSetting,
	});
	const asyncScript = require.resolve("./scripts/asyncCLIScript");
	const innerImportScript = require.resolve("./scripts/innerImportCli");
	const nonTransformedScript = require.resolve("./scripts/notTransformed");
	const commentTransformedScript = require.resolve(
		"./scripts/transformByComment",
	);
	const catchTransformedScript = require.resolve("./scripts/catchTransforms");
	const voidOnLastLineScript = require.resolve("./scripts/voidOnLastLine");
	// fit("works for nested process.exit", async () => {
	// 	await checkForExit(
	// 		async () => {
	// 			return await cliRunner.run(innerImportScript, ["--fail", "true"]);
	// 		},
	// 		"process.exit(1)",
	// 		runHasThrowSetting,
	// 	);
	// 	expect(mockLogFn).toHaveBeenCalledWith("Failure");
	// });
	it("works for void main finallyCatch", async () => {
		await checkForExit(
			async () => {
				return await cliRunner.run(asyncScript, ["--fail", "finallyCatch"]);
			},
			"process.exit()",
			runHasThrowSetting,
		);
		expect(mockLogFn).toHaveBeenCalledWith("finallyCatch");
	});
	it("works for void main failure", async () => {
		await checkForExit(
			async () => {
				return await cliRunner.run(asyncScript, ["--fail", "true"]);
			},
			"process.exit(14)",
			runHasThrowSetting,
		);
		expect(mockLogFn).toHaveBeenCalledWith("Failure");
	});
	it("works for void main abort", async () => {
		await checkForExit(
			async () => {
				return await cliRunner.run(asyncScript, ["--fail", "abort"]);
			},
			"process.abort()",
			runHasThrowSetting,
		);
	});
	it("works for void main success process.exit()", async () => {
		await checkForExit(
			async () => {
				return await cliRunner.run(asyncScript, ["--fail", "false"]);
			},
			"process.exit()",
			runHasThrowSetting,
		);
		expect(mockLogFn).toHaveBeenCalledWith("Success!");
	});
	it("works for scripts with the @ClITestTransform", async () => {
		await checkForExit(
			async () => {
				return await cliRunner.run(commentTransformedScript, [
					"--yay",
					"yahoo",
				]);
			},
			null,
			runHasThrowSetting,
		);
		expect(mockLogFn).toHaveBeenCalledWith("Here we are! yahoo");
	});
	it("works with promise catch process exit", async () => {
		await checkForExit(
			async () => {
				return await cliRunner.run(catchTransformedScript, [
					"--exitAt",
					"main",
				]);
			},
			"process.exit(14)",
			runHasThrowSetting,
		);
		expect(mockLogFn).toHaveBeenCalledWith("Exit At Main");
		expect(mockLogFn).not.toHaveBeenCalledWith("caught the errors");
	});
	it("works with try catch finally process abort", async () => {
		await checkForExit(
			async () => {
				return await cliRunner.run(catchTransformedScript, [
					"--exitAt",
					"tryCatch",
				]);
			},
			"process.abort()",
			runHasThrowSetting,
		);
		expect(mockLogFn).not.toHaveBeenCalledWith("try catch error");
		expect(mockLogFn).not.toHaveBeenCalledWith("caught the errors");
		expect(mockLogFn).not.toHaveBeenCalledWith("in the finally");
	});
	it("works with try finally process abort", async () => {
		await checkForExit(
			async () => {
				return await cliRunner.run(catchTransformedScript, [
					"--exitAt",
					"finallyOnly",
				]);
			},
			"process.exit(1)",
			runHasThrowSetting,
		);
		expect(mockLogFn).toHaveBeenCalledWith("Exit only finally");
		expect(mockLogFn).not.toHaveBeenCalledWith("caught the errors");
		expect(mockLogFn).not.toHaveBeenCalledWith("in the finally");
	});
	it("fails if the script has not been transformed", async () => {
		await expect(async () => {
			return await cliRunner.run(nonTransformedScript, ["something"]);
		}).rejects.toThrow(
			`Attempting to call CLIRunner on non-cliTransformed file: ${nonTransformedScript}.  Please verify that cliTransformer regex or comment (// @CLITestTransform) is present for file.`,
		);
	});
	it("works for void main on last line", async () => {
		await checkForExit(
			async () => {
				return await cliRunner.run(voidOnLastLineScript, ["--exitAt", "true"]);
			},
			"process.exit()",
			runHasThrowSetting,
		);
		expect(mockLogFn).toHaveBeenCalledWith("Success!");
	});
	it("does not eat module loading errors", async () => {
		// detect the file name to support our transpiling of this test for babel-jest
		const file =
			extname(__filename) === ".js" ? "src/CLIRunner.js" : "CLIRunner.ts";
		await expect(async () => {
			return await cliRunner.run("not-a-module", ["--fail", "true"]);
		}).rejects.toThrow(`Cannot find module 'not-a-module' from '${file}'`);
	});
	it("works for void main exitInPromise", async () => {
		await checkForExit(
			async () => {
				return await cliRunner.run(asyncScript, ["--fail", "exitInPromise"]);
			},
			"process.exit(12)",
			runHasThrowSetting,
		);
		expect(mockLogFn).toHaveBeenCalledWith("exitInPromise");
	});
});
