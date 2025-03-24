/**
 * This taks a "stub" object and wraps it in a proxy to ensure that ONLY the defined properties on the stub
 * are what is called.  This helps solve for things like void function calls that have impacts on application
 * performance at runtime but might be tolerated by code that could be ?. evaluating that function, etc.
 * @param toStub
 * @returns
 */
export function createStrictStub<T extends object>(toStub: Partial<T>) {
	return new Proxy<T>(toStub as T, {
		get(target, prop, receiver) {
			if (Reflect.has(target, prop)) {
				return Reflect.get(target, prop, receiver);
			}
			// Tolerate jest properties that are called
			if (prop === "__isMockFunction") {
				return false;
			}
			throw new Error(
				`Attempting to use a non-stubbed function of a strict stub: ${prop.toString()}.  Please provide an implementation for the method or fix why it is being called if it is unexpected.`,
			);
		},
	});
}
