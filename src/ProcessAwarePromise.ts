import { AsyncLocalStorage } from "async_hooks";
import { ParentPool } from "./ParentPool";
import { error } from "console";

// We use asyncLocal Storage to track succession of promises, this will allow us to detect if we need to reject an upper promise
// maybe...
export const asyncLocalStorage = new AsyncLocalStorage();

function createAsyncTree(id: string) {
	const parent = asyncLocalStorage.getStore();
	return parent ? `${id}.${parent}` : id;
}

interface PromiseInfo {
	reject: (reason: any) => void;
	syncExit: boolean;
	result: "rejected" | "resolved" | undefined;
}

const PROCESS_EXIT_DEBUG =
	process.env.PROCESS_EXIT_DEBUG?.toLowerCase() === "true";
const MAX_TIME_BETWEEN_THEN = process.env.MAX_TIME_BETWEEN_THEN
	? parseInt(process.env.MAX_TIME_BETWEEN_THEN)
	: 100;

export class ProcessAwarePromise<T> extends Promise<T> {
	private static processExitError: Error | undefined;
	static setProcessExit(e: Error) {
		if (ProcessAwarePromise.processExitError) {
			throw new Error(
				"We already set processExitError on ProcessAwarePromise!",
			);
		}
		ProcessAwarePromise.processExitError = e;
	}
	static clearProcessExit() {
		ProcessAwarePromise.processExitError = undefined;
	}
	static fromHandler: any;
	static idx = 0;
	static parentPool = new ParentPool<PromiseInfo>((_id, state) => {
		if (!state.result) {
			throw new Error(`We are in a state where we aren't rejecting id ${_id} even though all references are gone.`);
		}
	});
	static transferTimers: Set<NodeJS.Timeout> = new Set();
	static from: "await-then" | "then" | "catch" | "yield-then" | "finally" | undefined;
	transferTimer: NodeJS.Timeout;
	f: any = "placeholder";
	/**
	 * The id of this promise as a parent in the parent pool
	 */
	selfParentId: string;
	constructor(executor: (res: (r: T) => void, rej: (e: any) => void) => void) {
		const isAwait = ProcessAwarePromise.from === "await-then";
		const isAsyncGenerator = ProcessAwarePromise.from === "yield-then";
		const isCatch = ProcessAwarePromise.from === "catch";
		const isThen = ProcessAwarePromise.from === "then";
		const handler = ProcessAwarePromise.fromHandler ?? executor;
		const isConstructorCall = ProcessAwarePromise.from === undefined;
		const thisIdx = `${ProcessAwarePromise.idx++}`;
		// Make sure to claim above parents so that then contexts can drop their claims
		const parentChain = asyncLocalStorage.getStore() as string | undefined;
		if (parentChain) {
			parentChain.split(".").forEach((parentId) => {
				ProcessAwarePromise.parentPool.claimParent(parentId, thisIdx);
			});
		}
		const actualExecutor = isAwait || isAsyncGenerator ? executor : (_res: (r: T) => void, _rej: (e: any) => void) => {
				asyncLocalStorage.run(createAsyncTree(thisIdx), () => {
					const res = (v: any) => {
						// First drop ourselves from the parentPool - but maybe our children won't let us die
						ProcessAwarePromise.parentPool.tryDropSelf(thisIdx);
						// There must be child claims so update state
						if (ProcessAwarePromise.parentPool.has(thisIdx)) {
							ProcessAwarePromise.parentPool.getParentState(thisIdx).result =
								"resolved";
						}
						_res(v);
					};
					const rej = (reason: any) => {
						// TODO: release any parents above this
						// First drop ourselves from the parentPool - but maybe our children won't let us die
						ProcessAwarePromise.parentPool.tryDropSelf(thisIdx);
						// There must be child claims so update state
						if (ProcessAwarePromise.parentPool.has(thisIdx)) {
							ProcessAwarePromise.parentPool.getParentState(thisIdx).result =
								"rejected";
						}
						_rej(reason);
					};
					ProcessAwarePromise.parentPool.createParent(thisIdx, {
						reject: rej,
						syncExit: false,
						result: undefined,
					});

					try {
						executor(res, rej);
					} catch (e) {
						if (isConstructorCall) {
							// We need to make sure the Error rejects this promise
							if (ProcessAwarePromise.processExitError) {
								rej(ProcessAwarePromise.getProcessExitError(e as Error));
								return;
							}
						}
						throw e;
					} finally {
						// Set our sync exit so children can know they can't throw explicitly
						// May be empty if we called rej/res inline before the executor exited and no children claimed it
						if (ProcessAwarePromise.parentPool.has(thisIdx)) {
							ProcessAwarePromise.parentPool.getParentState(thisIdx).syncExit =
								true;
						}
					}
				});
		};
		super(actualExecutor);
		this.selfParentId = thisIdx;
		// I don't like that this isn't definitive, but we can't account for every promise state, this gives us a buffer for then() calls.
		this.transferTimer = setTimeout(() => {
			this.releaseParentClaims();
			ProcessAwarePromise.transferTimers.delete(this.transferTimer);
		}, MAX_TIME_BETWEEN_THEN);
		ProcessAwarePromise.transferTimers.add(this.transferTimer)

		this.f = executor;
	}
	catch<TResult = never>(
		onrejected?:
			| ((reason: any) => TResult | PromiseLike<TResult>)
			| null
			| undefined,
	): Promise<T | TResult> {
		ProcessAwarePromise.from = "catch";
		const promise = super.catch(onrejected);
		ProcessAwarePromise.from = undefined;
		return promise as any;
	}
	then<TResult1 = T, TResult2 = never>(
		onfulfilled?:
			| ((value: T) => TResult1 | PromiseLike<TResult1>)
			| null
			| undefined,
		onrejected?:
			| ((reason: any) => TResult2 | PromiseLike<TResult2>)
			| null
			| undefined,
	): Promise<TResult1 | TResult2> {
		ProcessAwarePromise.fromHandler = onfulfilled
		// Make sure the transferTimer is stopped since we want to transfer ownership here
		clearTimeout(this.transferTimer);
		const isAwait = onfulfilled?.toString()?.includes("[native code]");
		const isAsyncGenerator =
			onfulfilled?.toString().includes("asyncGeneratorStep(") &&
			onrejected?.toString().includes("asyncGeneratorStep(");
		if (ProcessAwarePromise.from !== "catch") {
			ProcessAwarePromise.from = isAwait
				? "await-then"
				: isAsyncGenerator
					? "yield-then"
					: "then";
		}

		// Do not modify await promises or things break
		if (isAwait || isAsyncGenerator) {
			return super.then(onfulfilled, onrejected);
		}

		const onfulfilledFull = onfulfilled ? (v: T) => {
			try {
				if (ProcessAwarePromise.processExitError) {
					throw ProcessAwarePromise.getProcessExitError(ProcessAwarePromise.processExitError);
				}
				return onfulfilled(v);
			} catch (e) {
				ProcessAwarePromise.handleThenableCatch(e as Error);
			}
		} : onfulfilled;

		const onrejectedFull = onrejected ? (r: any) => {
			try {
				if (ProcessAwarePromise.processExitError) {
					throw ProcessAwarePromise.getProcessExitError(ProcessAwarePromise.processExitError);
				}
				return onrejected?.(r);
			} catch (e) {
				ProcessAwarePromise.handleThenableCatch(e as Error);
			}
		} : onrejected;

		const promise = super.then(onfulfilledFull, onrejectedFull);
		// Remove our claim to our parents since we have transferred it within the then() promise creation
		this.releaseParentClaims();
		ProcessAwarePromise.from = undefined;
		return promise as any;
	}
	finally(onfinally?: (() => void) | null | undefined): Promise<T> {
		ProcessAwarePromise.from = "finally";
		const promise = super.finally(() => {
			if (ProcessAwarePromise.processExitError) {
				// Finallies shouldn't be propagating errors,
				// we should have already done it in a thenable
				return;
			}
			return onfinally?.();
		});
		ProcessAwarePromise.from = undefined;
		return promise;
	}

	static handleThenableCatch(e: Error) {
		if (
			ProcessAwarePromise.processExitError &&
			e.message === ProcessAwarePromise.processExitError.message
		) {
			const parentChain = asyncLocalStorage.getStore() as string | undefined;
			// We're at the top level, we only know how to throw since there's no detectable reject()
			if (!parentChain) {
				throw ProcessAwarePromise.getProcessExitError(e);
			}

			const nextParentId = parentChain.split(".")[0];
			const nextParent =
				ProcessAwarePromise.parentPool.getParentState(nextParentId);

			if (nextParent.syncExit) {
				if (nextParent.result) {
					// Something has already triggered next parent and we're not sync so we're gonna just return to avoid uncaught errors
					return;
				}
				// We call reject here because we have left the await/sync context that can catch an actual error
				nextParent.reject(ProcessAwarePromise.getProcessExitError(e));
				return;
			}
			// We are sync still, throw so that the upper promise can catch it
			throw ProcessAwarePromise.getProcessExitError(e);
		}
		throw e;
	}

	private releaseParentClaims() {
		const parentChain = asyncLocalStorage.getStore() as string | undefined;
		if (parentChain) {
			parentChain.split(".").forEach((parentId) => {
				ProcessAwarePromise.parentPool.dropParent(parentId, this.selfParentId);
			});
		}
	}

	private static getProcessExitError(e: Error) {
		return PROCESS_EXIT_DEBUG
			? new Error(e.message)
			: ProcessAwarePromise.processExitError;
	}

	/**
	 * Used to make sure we don't overlap state
	 */
	public static clear() {
		ProcessAwarePromise.processExitError = undefined;
		ProcessAwarePromise.from = undefined;
		// Remove the timers so we can clear stuff
		ProcessAwarePromise.transferTimers.forEach((t) => {
			clearTimeout(t);
		});
		ProcessAwarePromise.transferTimers.clear();
		// Need to clear the parent transitions too.  and somehow we are still overhanging promises
		ProcessAwarePromise.parentPool.clear();
		ProcessAwarePromise.idx = 0;
	}

}
