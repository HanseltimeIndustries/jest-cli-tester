import { CLIRunner } from "@hanseltime/jest-cli-tester";

const logSpy = jest.spyOn(console, "log");
const cliRunner = new CLIRunner({
	throwProcessErrors: false,
});
it("logs", async () => {
	// Resolve it here since the runner doesn't know what context to resolve from
	const scriptPath = require.resolve("./testBinAsync");
	// Verify the process ended by calling process.exit()
	expect(await cliRunner.run(scriptPath, ["--someArg"])).toEqual(
		"process.exit()",
	);

	// Ensure the log was made by checking the spy
	expect(logSpy).toHaveBeenCalledWith("we did something with arg: --someArg");
});
