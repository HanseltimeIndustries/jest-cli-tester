import { AsyncLocalStorage } from "async_hooks";

// We use asyncLocal Storage to track succession of promises, this will allow us to detect if we need to reject an upper promise
// maybe...
export const asyncLocalStorage = new AsyncLocalStorage();

function createAsyncTree(id: string) {
	const parent = asyncLocalStorage.getStore();
	return parent ? `${id}.${parent}` : id;
}

interface PromiseInfo {
	reject?: (reason: any) => void;
	syncExit?: boolean;
	promise?: ProcessAwarePromise<any>;
}

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
	static idx = 0;
	static inflight = new Map<
		(...args: any[]) => any,
		[(...args: any[]) => void, { prom: Promise<any> | undefined }]
	>();
	static promiseRejects = new Map<string, PromiseInfo>();
	static from: "await-then" | "then" | "catch" | "catch-patch" | undefined;
	result: 'resolved' | any | undefined;
	parent: undefined | Promise<any>;
	constructor(executor: (res: (r: T) => void, rej: (e: any) => void) => void) {
		const isAwait = ProcessAwarePromise.from === "await-then";
		const parentIdx = asyncLocalStorage.getStore() as string;
		const thisId = `${ProcessAwarePromise.idx++}`;
		let actualExecutor = (_res: (r: T) => void, _rej: (e: any) => void) => {
						asyncLocalStorage.run(thisId, () => {
							const trackMap = ProcessAwarePromise.promiseRejects;
							// Track our promise for lookup
							if (!trackMap.has(thisId)) {
								trackMap.set(thisId, {
									reject: _rej,
									syncExit: false,
								})
							} else {
								trackMap.get(thisId)!.reject = _rej;
							}
							const res = (v: any) => {
								// trackMap.delete(thisId);
								this.result = 'resolved';
								_res(v);
							};
							const rej = (reason: any) => {
								// trackMap.delete(thisId);
								this.result = reason;
								_rej(reason);
							};
							try {
								executor(res, rej);
							} catch (e) {
								if (e === ProcessAwarePromise.processExitError) {
									// Track the parentIdx
									if (parentIdx) {
										if (!ProcessAwarePromise.promiseRejects.has(parentIdx)) {
											throw new Error('The promise has a parent but we cannot find it');
										}
										const parent = ProcessAwarePromise.promiseRejects.get(parentIdx);
										if (!parent) {
											throw new Error('Unable to get a lazy promise for parent index!')
										}
										if (parent?.syncExit) {
											// We probably aren't in a catch context
											if (!parent.promise?.result) {
												parent?.reject?.(e);
												return;
											}
										}
									}
								}
								throw e
							}
							finally {
								// Set our sync exit so children can know they can't throw explicitly
								if (trackMap.has(thisId)) {
									trackMap.get(thisId)!.syncExit = true;
								}
							}
						});
					};
		super(actualExecutor);
	}
	catch<TResult = never>(
		onrejected?:
			| ((reason: any) => TResult | PromiseLike<TResult>)
			| null
			| undefined,
	): Promise<T | TResult> {
		if (ProcessAwarePromise.from !== "catch-patch") {
			ProcessAwarePromise.from = "catch";
		}
		const doNotChange = ProcessAwarePromise.from === "catch-patch";
		const onrejectedFull = doNotChange ? onrejected : (r: any) => {
			if (ProcessAwarePromise.processExitError) {
				throw ProcessAwarePromise.processExitError;
			}
			return onrejected?.(r);
		};
		const promise = super.catch(onrejectedFull);
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
		const isAwait = onfulfilled?.toString()?.includes("[native code]") && onrejected?.toString()?.includes("[native code]");
		if (isAwait) {
			return super.then(onfulfilled, onrejected);
		}
		if (ProcessAwarePromise.processExitError) {
			// We now know that we're always going to return the same then that failed
			return this as any;
		}
		// Hmmmmm
		// So if we try catch everything in the then, we can catch the processExitErr
		// We can then check to see if we have a reject() that wasn't rejected
		// if it wasn't rejected, go ahead and reject
		return super.then(onfulfilled, onrejected);
	}
	finally(onfinally?: (() => void) | null | undefined): Promise<T> {
		return super.finally(() => {
			if (ProcessAwarePromise.processExitError) {
				throw ProcessAwarePromise.processExitError;
			}
			return onfinally?.();
		});
	}
}
