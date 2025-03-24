import {
	asyncLocalStorage,
	ProcessAwarePromiseFactory,
} from "./ProcessAwarePromise";

export class ProcessAwareTimers {
	private processExitErr: Error | undefined;
	// map of timeouts to parentChains
	private timeouts = new Map<NodeJS.Timeout | number, string>();
	private intervals = new Map<NodeJS.Timeout | number, string>();
	private immediates = new Map<NodeJS.Immediate, string>();

	setProcessExitError(e: Error) {
		if (this.processExitErr) {
			throw new Error(
				"Cannot set process exit error! Already set!" + e.message,
			);
		}
		this.processExitErr = e;
	}

	origSetTimeOut: typeof setTimeout;
	origSetInterval: typeof setInterval;
	origClearInterval: typeof clearInterval;
	origSetImmediate: typeof setImmediate;
	promiseFactory: ProcessAwarePromiseFactory;
	constructor(
		promiseFactory: ProcessAwarePromiseFactory,
		origSetTimeOut: typeof setTimeout,
		origSetInterval: typeof setInterval,
		origClearInterval: typeof clearInterval,
		origSetImmediate: typeof setImmediate,
	) {
		this.origSetTimeOut = origSetTimeOut;
		this.origSetInterval = origSetInterval;
		this.origClearInterval = origClearInterval;
		this.origSetImmediate = origSetImmediate;
		this.promiseFactory = promiseFactory;
	}

	makeSetImmediate() {
		return (handler: (...args: any[]) => void, ...args: any[]) => {
			// see if there is a registered parent promise
			const parentChain = asyncLocalStorage.getStore() as string;
			let immediateH: NodeJS.Immediate | undefined;
			immediateH = this.origSetImmediate(
				(...innerArgs: any[]) => {
					if (immediateH) {
						this.immediates.delete(immediateH);
					}
					try {
						if (this.processExitErr) {
							throw this.processExitErr;
						}
						handler(...innerArgs);
					} catch (e) {
						if (
							this.processExitErr &&
							(e as Error).message === this.processExitErr.message
						) {
							this.rejectNextParentInChain(parentChain);
							return;
						}
						throw e;
					}
				},
				...args,
			);
			this.immediates.set(immediateH, parentChain);

			return immediateH;
		};
	}

	makeSetTimeout() {
		return (handler: (...args: any[]) => void, ms: number, ...args: any[]) => {
			// see if there is a registered parent promise
			const parentChain = asyncLocalStorage.getStore() as string;
			let timeout: NodeJS.Timeout | number | undefined;
			timeout = this.origSetTimeOut(
				(...innerArgs: any[]) => {
					if (timeout) {
						this.timeouts.delete(timeout);
					}
					try {
						if (this.processExitErr) {
							throw this.processExitErr;
						}
						handler(...innerArgs);
					} catch (e) {
						if (
							this.processExitErr &&
							(e as Error).message === this.processExitErr.message
						) {
							this.rejectNextParentInChain(parentChain);
							return;
						}
						throw e;
					}
				},
				ms,
				...args,
			);
			this.timeouts.set(timeout, parentChain);

			return timeout;
		};
	}

	makeIntervalFuncs() {
		const factoryInstance = this;
		return {
			setInterval(
				handler: (...args: any[]) => void,
				ms: number,
				...args: any[]
			) {
				// see if there is a registered parent promise
				const parentChain = asyncLocalStorage.getStore() as string;
				let rejectedOnce = false;
				let interval: NodeJS.Timeout | number | undefined;
				interval = factoryInstance.origSetInterval(
					(...innerArgs: any[]) => {
						// Account for some timing issues
						if (rejectedOnce) {
							if (interval) {
								clearInterval(interval);
							}
							return;
						}
						try {
							if (factoryInstance.processExitErr) {
								throw factoryInstance.processExitErr;
							}
							handler(...innerArgs);
						} catch (e) {
							if (
								factoryInstance.processExitErr &&
								(e as Error).message === factoryInstance.processExitErr.message
							) {
								rejectedOnce = true;
								if (interval) {
									clearInterval(interval);
								}
								factoryInstance.rejectNextParentInChain(parentChain);
								return;
							}
							throw e;
						}
					},
					ms,
					...args,
				);
				factoryInstance.intervals.set(interval, parentChain);

				return interval;
			},
			clearInterval(interval: NodeJS.Timeout) {
				factoryInstance.intervals.delete(interval);
				return factoryInstance.origClearInterval(interval);
			},
		};
	}

	/**
	 * Rejects the first parent in a chain and expects it to cascade...
	 * @param parentChain
	 */
	private rejectNextParentInChain(parentChain?: string | undefined) {
		if (parentChain) {
			const nextParent = parentChain.split(".")[0];
			const state = this.promiseFactory.parentPool.getParentState(nextParent);
			if (!state.result) {
				state.reject(this.processExitErr);
			}
		}
	}

	clear() {
		if (!this.processExitErr) {
			if (this.timeouts.size > 0) {
				throw new Error(
					"You did not process.exit and somehow came to the end of your cli script with timers still intact!",
				);
			}
			if (this.intervals.size > 0) {
				throw new Error(
					"You did not process.exit and somehow came to the end of your cli script with intervals still intact!",
				);
			}
			if (this.immediates.size > 0) {
				throw new Error(
					"You did not process.exit and somehow came to the end of your cli script with immediates still intact!",
				);
			}
		}
		this.timeouts.forEach((parentChain, timeoutHandle) => {
			clearTimeout(timeoutHandle);
			// If there is a parent promise that isn't rejected, go ahead and reject it
			this.rejectNextParentInChain(parentChain);
		});
		this.intervals.forEach((parentChain, intervalHandle) => {
			this.origClearInterval(intervalHandle);
			// If there is a parent promise that isn't rejected, go ahead and reject it
			this.rejectNextParentInChain(parentChain);
		});
		this.immediates.forEach((parentChain, immediateHandle) => {
			clearImmediate(immediateHandle);
			// If there is a parent promise that isn't rejected, go ahead and reject it
			this.rejectNextParentInChain(parentChain);
		});

		this.timeouts.clear();
		this.intervals.clear();
		this.immediates.clear();
	}
}
