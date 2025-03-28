import { createStrictStub } from "./createStrictStub";
import { mockCliCall } from "./mockCliCall";
import { ProcessAwarePromiseFactory } from "./ProcessAwarePromise";
import { ProcessAwareTimers } from "./ProcessAwareTimers";

declare let console: Console;

// Helper object that we get from the runner and the transformer can insert calls to
interface RunHelper {
	/**
	 * This should be called at the front of every catch and finally block, it will propagate the stubbed error to the top
	 */
	handleProcessExitCatchFinally(): boolean;
}

// The Expected module that we get from cliTransformer
interface CLITransformedModule {
	run(___cli_run_helper: RunHelper): Promise<void>;
	wrapped: true;
}

interface CLIRunnerOptions {
	/**
	 * If true, we throw process.exit and process.abort as errors, if false, we return them as strings from run
	 */
	throwProcessErrors: boolean;
	/**
	 * A map of environment variables to add
	 */
	env?: Record<string, string>;
	/**
	 * Callback function that will be trigger when std out is called by the process
	 *
	 * @param data
	 * @returns
	 */
	onStdOut?: (data: string) => void;
	/**
	 * Callback function that will be trigger when std err is called by the process
	 *
	 * @param data
	 * @returns
	 */
	onStdErr?: (data: string) => void;
}

export class CLIRunner {
	readonly throwProcessErrors: boolean; // TODO: this is a legacy switch that we will remove as tech debt once all tests use the return
	readonly env: Record<string, string>;
	private onStdOut?: (data: string) => void;
	private onStdErr?: (data: string) => void;

	constructor(
		options: CLIRunnerOptions = {
			throwProcessErrors: true,
			env: {},
		},
	) {
		this.throwProcessErrors = options.throwProcessErrors;
		if (options?.env?.TESTING && process.env.TESTING !== options.env.TESTING) {
			throw new Error(
				"Cannot override the global TESTING environment variable!",
			);
		}
		this.env = options.env ?? {};
		this.onStdOut = options.onStdOut;
		this.onStdErr = options.onStdErr;
	}

	/**
	 *
	 * @param cliModuleUrl - the resolved url of the script : require.resolve('.my-script-local-path')
	 * @param args - cli arguments array that you want to have present on the running
	 * @return the string message equivalent of the process.exit or abort that ended the process or null if it exited organically
	 */
	async run(cliModuleUrl: string, args: string[] = []): Promise<string | null> {
		const oldExit = process.exit;
		let processExitErr: Error | undefined;
		const origPromise = Promise;
		const origSetTimeout = global.setTimeout;
		const origSetInterval = global.setInterval;
		const origClearInterval = global.clearInterval;
		const origSetImmediate = global.setImmediate;
		const originalExitCodeDescriptor = Object.getOwnPropertyDescriptor(
			process,
			"exitCode",
		)!;
		const promiseFactory = new ProcessAwarePromiseFactory(origSetTimeout);
		const timers = new ProcessAwareTimers(
			promiseFactory,
			origSetTimeout,
			origSetInterval,
			origClearInterval,
			origSetImmediate,
		);

		let mockExitCode: string = "";
		const mockExit = (code: number) => {
			// If we encounter cascading process.exit() preserve the first one since that is how a real exit looks
			if (processExitErr) throw processExitErr;
			processExitErr = new Error(`process.exit(${code ?? mockExitCode})`);
			promiseFactory.setProcessExit(processExitErr);
			timers.setProcessExitError(processExitErr);
			throw processExitErr;
		};
		process.exit = mockExit as (code: number) => never;
		const oldAbort = process.abort;
		const mockAbort = () => {
			if (processExitErr) throw processExitErr;
			processExitErr = new Error("process.abort()");
			promiseFactory.setProcessExit(processExitErr);
			timers.setProcessExitError(processExitErr);
			throw processExitErr;
		};
		process.abort = mockAbort;

		const oldEnv = { ...process.env };

		// We'll just wrap the stdout and stderr write methods
		const stdoutWrite = process.stdout.write;
		const stdErrWrite = process.stderr.write;
		const oldConsole = { ...console };

		// Helper functions for calling in try-catches (TO BE Done still in the transformer)
		const cliRunHelper = {
			handleProcessExitCatchFinally() {
				if (processExitErr) {
					throw processExitErr;
				}
				return false;
			},
		};

		let modLoaded = false;
		let error: unknown | undefined;
		// Messages for replay after reverting console.log
		let toStdMessages: { to: "out" | "err"; msg: string }[] = [];
		try {
			// Let require run with new arguments
			await mockCliCall(args, async () => {
				process.env = { ...oldEnv, ...this.env };
				// Since jest writes metadata to the stream, we need to keep a placeholder so we can log the non-metadata part
				let consoleToOut: string,
					consoleToErr: string = "";
				let fromConsole = false;
				console = createStrictStub<Console>({
					log: (...args) => {
						consoleToOut = `${args.join(" ")}\n`;
						fromConsole = true;
						oldConsole.log(...args);
						fromConsole = false;
					},
					warn: (...args) => {
						consoleToOut = `${args.join(" ")}\n`;
						fromConsole = true;
						oldConsole.warn(...args);
						fromConsole = false;
					},
					debug: (...args) => {
						consoleToOut = `${args.join(" ")}\n`;
						fromConsole = true;
						oldConsole.debug(...args);
						fromConsole = false;
					},
					error: (...args) => {
						consoleToErr = `${args.join(" ")}\n`;
						fromConsole = true;
						oldConsole.error(...args);
						fromConsole = false;
					},
				});
				process.stdout.write = (buffer: Uint8Array | string, ...args) => {
					// Apply the single console message instead of its metadata if it is part of console
					if (fromConsole) {
						if (consoleToOut) {
							toStdMessages.push({ to: "out", msg: consoleToOut });
						}
						consoleToOut = "";
					} else {
						toStdMessages.push({ to: "out", msg: buffer.toString() });
					}
					return stdoutWrite.bind(process.stdout)(buffer, ...(args as any[]));
				};
				process.stderr.write = (buffer: Uint8Array | string, ...args) => {
					// Apply the single console message instead of its metadata if it is part of console
					if (fromConsole) {
						if (consoleToErr) {
							toStdMessages.push({ to: "err", msg: consoleToErr });
						}
						consoleToErr = "";
					} else {
						toStdMessages.push({ to: "err", msg: buffer.toString() });
					}
					return stdErrWrite.bind(process.stderr)(buffer, ...(args as any[]));
				};
				const mod = await new Promise<CLITransformedModule>((res, rej) => {
					jest.isolateModules(() => {
						// use import so that we can support esm
						import(cliModuleUrl)
							.then((m) => {
								res(m);
							})
							.catch((e) => {
								rej(e);
							});
					});
				});
				modLoaded = !!mod!.wrapped;
				if (!modLoaded) {
					throw new Error(
						`Attempting to call CLIRunner on non-cliTransformed file: ${cliModuleUrl}.  Please verify that cliTransformer regex or comment (// @CLITestTransform) is present for file.`,
					);
				}
				(global as any).___cli_run_helper = cliRunHelper;
				global.Promise = promiseFactory.makePromiseClass();
				(global as any).setTimeout = timers.makeSetTimeout();
				const intervalFuncs = timers.makeIntervalFuncs();
				(global as any).setInterval = intervalFuncs.setInterval;
				(global as any).clearInterval = intervalFuncs.clearInterval;
				(global as any).setImmediate = timers.makeSetImmediate();
				// Override the setter for process.exitCode
				Object.defineProperty(process, "exitCode", {
					set: function (value) {
						mockExitCode = `${value}`;
					},
					get: function () {
						return mockExitCode || undefined;
					},
				});
				await mod!.run(cliRunHelper);
				global.Promise = origPromise;
				global.setTimeout = origSetTimeout;
				global.setInterval = origSetInterval;
				global.clearInterval = origClearInterval;
				global.setImmediate = origSetImmediate;
				Object.defineProperty(process, "exitCode", originalExitCodeDescriptor);
				(global as any).___cli_run_helper = cliRunHelper;
			});
			return mockExitCode || null;
		} catch (err) {
			global.Promise = origPromise;
			global.setTimeout = origSetTimeout;
			global.setInterval = origSetInterval;
			global.clearInterval = origClearInterval;
			global.setImmediate = origSetImmediate;
			Object.defineProperty(process, "exitCode", originalExitCodeDescriptor);
			if (err !== processExitErr) {
				// Log the error to the current console as if it hit stdErr
				console.error(err);
			}
			// Compare messages since debugging may replay the error from promises, etc.
			if (
				!this.throwProcessErrors &&
				(err as Error).message === processExitErr?.message
			) {
				return processExitErr!.message;
			}
			error = err;
			throw err;
		} finally {
			process.exit = oldExit;
			process.abort = oldAbort;
			timers.clear();
			promiseFactory.clear();
			process.env = oldEnv;
			process.stdout.write = stdoutWrite;
			process.stderr.write = stdErrWrite;
			console = oldConsole;
			// If we failed here, it would've been because the module wasn't wrapped and tried to execute
			if (!modLoaded) {
				// If an error caused the modLoaded issue, prioritize that
				if (error) {
					// biome-ignore lint:late handling of module loading requires this
					throw error;
				}
				// biome-ignore lint:late handling of module loading requires this
				throw new Error(
					`Attempting to call CLIRunner on non-cliTransformed file: ${cliModuleUrl}.  Please verify that cliTransformer regex or comment (// @CLITestTransform) is present for fil.`,
				);
			}

			// Replay the messages to stdOut and stdErr in order
			toStdMessages.forEach((toMsg) => {
				if (toMsg.to === "out") {
					this.onStdOut?.(toMsg.msg);
				}
				if (toMsg.to === "err") {
					this.onStdErr?.(toMsg.msg);
				}
			});
		}
	}
}
