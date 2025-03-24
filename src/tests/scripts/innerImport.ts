// This function simulates a nested call that uses process.exit() and wraps everything to eat an error
// Since we throw an error, we actually want to make sure we've transformed this to throw an error again
export async function innerImport(fail: boolean) {
	try {
		if (fail) {
			process.exit(1);
		}
	} catch (_err) {
		console.log("this is me eating an error");
	}
}
