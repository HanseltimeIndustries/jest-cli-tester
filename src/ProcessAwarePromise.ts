import { AsyncLocalStorage } from "async_hooks";
import { ParentPool } from "./ParentPool";

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

export class ProcessAwarePromiseFactory {
	private processExitError: Error | undefined;
	setProcessExit(e: Error) {
		if (this.processExitError) {
			throw new Error("We already set processExitError!");
		}
		this.processExitError = e;
	}
	clearProcessExit() {
		this.processExitError = undefined;
	}
	idx = 0;
	parentPool = new ParentPool<PromiseInfo>((_id, state) => {
		if (!state.result) {
			throw new Error(
				`We are in a state where we aren't rejecting id ${_id} even though all references are gone.`,
			);
		}
	});
	transferTimers: Set<NodeJS.Timeout> = new Set();
	// We need un-throwable setTimeout since we are organizing additional process.exit behavior
	origSetTimeout: typeof setTimeout;
	from: "await-then" | "then" | "catch" | "yield-then" | "finally" | undefined;

	constructor(origSetTimeout: typeof setTimeout) {
		this.origSetTimeout = origSetTimeout;
	}

	makePromiseClass() {
		const factoryInstance = this;
		return class<T> extends Promise<T> {
			transferTimer: NodeJS.Timeout;
			/**
			 * The id of this promise as a parent in the parent pool
			 */
			selfParentId: string;
			constructor(
				executor: (
					res: (r: T | PromiseLike<T>) => void,
					rej: (e: any) => void,
				) => void,
			) {
				const isAwait = factoryInstance.from === "await-then";
				const isAsyncGenerator = factoryInstance.from === "yield-then";
				const isConstructorCall = factoryInstance.from === undefined;
				const thisIdx = `${factoryInstance.idx++}`;
				// Make sure to claim above parents so that then contexts can drop their claims
				const parentChain = asyncLocalStorage.getStore() as string | undefined;
				if (parentChain) {
					parentChain.split(".").forEach((parentId) => {
						factoryInstance.parentPool.claimParent(parentId, thisIdx);
					});
				}
				const actualExecutor =
					isAwait || isAsyncGenerator
						? executor
						: (_res: (r: T) => void, _rej: (e: any) => void) => {
								asyncLocalStorage.run(createAsyncTree(thisIdx), () => {
									const res = (v: any) => {
										// First drop ourselves from the parentPool - but maybe our children won't let us die
										factoryInstance.parentPool.tryDropSelf(thisIdx);
										// There must be child claims so update state
										if (factoryInstance.parentPool.has(thisIdx)) {
											factoryInstance.parentPool.getParentState(
												thisIdx,
											).result = "resolved";
										}
										_res(v);
									};
									const rej = (reason: any) => {
										// TODO: release any parents above this
										// First drop ourselves from the parentPool - but maybe our children won't let us die
										factoryInstance.parentPool.tryDropSelf(thisIdx);
										// There must be child claims so update state
										if (factoryInstance.parentPool.has(thisIdx)) {
											factoryInstance.parentPool.getParentState(
												thisIdx,
											).result = "rejected";
										}
										_rej(reason);
									};
									factoryInstance.parentPool.createParent(thisIdx, {
										reject: rej,
										syncExit: false,
										result: undefined,
									});

									try {
										// The then functions have this wrapped at a higher level because doing it down here messes with super wrapping code
										// We still need this behavior for new Promises being created
										if (isConstructorCall && factoryInstance.processExitError) {
											throw factoryInstance.getProcessExitError(
												factoryInstance.processExitError,
											);
										}
										executor(res, rej);
									} catch (e) {
										if (isConstructorCall) {
											// We need to make sure the Error rejects this promise
											if (factoryInstance.processExitError) {
												rej(factoryInstance.getProcessExitError(e as Error));
												return;
											}
										}
										throw e;
									} finally {
										// Set our sync exit so children can know they can't throw explicitly
										// May be empty if we called rej/res inline before the executor exited and no children claimed it
										if (factoryInstance.parentPool.has(thisIdx)) {
											factoryInstance.parentPool.getParentState(
												thisIdx,
											).syncExit = true;
										}
									}
								});
							};
				super(actualExecutor);
				this.selfParentId = thisIdx;
				// I don't like that this isn't definitive, but we can't account for every promise state, this gives us a buffer for then() calls.
				this.transferTimer = factoryInstance.origSetTimeout(() => {
					this.releaseParentClaims();
					factoryInstance.transferTimers.delete(this.transferTimer);
				}, MAX_TIME_BETWEEN_THEN);
				factoryInstance.transferTimers.add(this.transferTimer);
			}
			catch<TResult = never>(
				onrejected?:
					| ((reason: any) => TResult | PromiseLike<TResult>)
					| null
					| undefined,
			): Promise<T | TResult> {
				factoryInstance.from = "catch";
				const promise = super.catch(onrejected);
				factoryInstance.from = undefined;
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
				// Make sure the transferTimer is stopped since we want to transfer ownership here
				clearTimeout(this.transferTimer);
				const isAwait = onfulfilled?.toString()?.includes("[native code]");
				const isAsyncGenerator =
					onfulfilled?.toString().includes("asyncGeneratorStep(") &&
					onrejected?.toString().includes("asyncGeneratorStep(");
				if (factoryInstance.from !== "catch") {
					factoryInstance.from = isAwait
						? "await-then"
						: isAsyncGenerator
							? "yield-then"
							: "then";
				}

				// Do not modify await promises or things break
				if (isAwait || isAsyncGenerator) {
					return super.then(onfulfilled, onrejected);
				}

				const onfulfilledFull = onfulfilled
					? (v: T) => {
							try {
								if (factoryInstance.processExitError) {
									throw factoryInstance.getProcessExitError(
										factoryInstance.processExitError,
									);
								}
								return onfulfilled(v);
							} catch (e) {
								factoryInstance.handleThenableCatch(e as Error);
							}
						}
					: onfulfilled;

				const onrejectedFull = onrejected
					? (r: any) => {
							try {
								if (factoryInstance.processExitError) {
									throw factoryInstance.getProcessExitError(
										factoryInstance.processExitError,
									);
								}
								return onrejected?.(r);
							} catch (e) {
								factoryInstance.handleThenableCatch(e as Error);
							}
						}
					: onrejected;

				const promise = super.then(onfulfilledFull, onrejectedFull);
				// Remove our claim to our parents since we have transferred it within the then() promise creation
				this.releaseParentClaims();
				factoryInstance.from = undefined;
				return promise as any;
			}
			finally(onfinally?: (() => void) | null | undefined): Promise<T> {
				factoryInstance.from = "finally";
				const promise = super.finally(() => {
					if (factoryInstance.processExitError) {
						// Finallies shouldn't be propagating errors,
						// we should have already done it in a thenable
						return;
					}
					return onfinally?.();
				});
				factoryInstance.from = undefined;
				return promise;
			}

			releaseParentClaims() {
				const parentChain = asyncLocalStorage.getStore() as string | undefined;
				if (parentChain) {
					parentChain.split(".").forEach((parentId) => {
						factoryInstance.parentPool.dropParent(parentId, this.selfParentId);
					});
				}
			}
		};
	}

	private getProcessExitError(e: Error) {
		return PROCESS_EXIT_DEBUG ? new Error(e.message) : this.processExitError;
	}

	/**
	 * Used to make sure we don't overlap state
	 */
	public clear() {
		this.processExitError = undefined;
		this.from = undefined;
		// Remove the timers so we can clear stuff
		this.transferTimers.forEach((t) => {
			clearTimeout(t);
		});
		this.transferTimers.clear();
		// Need to clear the parent transitions too.  and somehow we are still overhanging promises
		this.parentPool.clear();
		this.idx = 0;
	}

	private handleThenableCatch(e: Error) {
		if (this.processExitError && e.message === this.processExitError.message) {
			const parentChain = asyncLocalStorage.getStore() as string | undefined;
			// We're at the top level, we only know how to throw since there's no detectable reject()
			if (!parentChain) {
				throw this.getProcessExitError(e);
			}

			const nextParentId = parentChain.split(".")[0];
			const nextParent = this.parentPool.getParentState(nextParentId);

			if (nextParent.syncExit) {
				if (nextParent.result) {
					// Something has already triggered next parent and we're not sync so we're gonna just return to avoid uncaught errors
					return;
				}
				// We call reject here because we have left the await/sync context that can catch an actual error
				nextParent.reject(this.getProcessExitError(e));
				return;
			}
			// We are sync still, throw so that the upper promise can catch it
			throw this.getProcessExitError(e);
		}
		throw e;
	}
}
