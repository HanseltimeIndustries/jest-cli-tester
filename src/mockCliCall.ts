export async function mockCliCall(args: string[], func: () => Promise<void>) {
	const oldArgv = process.argv;
	try {
		process.argv = [...oldArgv.slice(0, 2), ...args];
		await func();
	} finally {
		process.argv = oldArgv;
	}
}
