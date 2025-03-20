#!/usr/bin/env ts-node

/**
 * Simple script for simulating an async CLI script
 */

import { ArgumentParser } from "argparse";

const parser = new ArgumentParser();

parser.add_argument("--fail", {
	type: String,
	required: false,
	default: "false",
});

let args: {
	fail: string;
} = parser.parse_args();

async function main() {
	if (args.fail === "true") {
		console.log("Failure");
		process.exit(14);
	} else if (args.fail === "abort") {
		process.abort();
	} else if (args.fail === "finallyCatch") {
		console.log("finallyCatch");
		await new Promise<void>((res) => {
			setTimeout(() => {
				res();
			}, 10);
		}).finally(() => process.exit());
	} else if (args.fail === "exitInPromise") {
		console.log("exitInPromise");
		await new Promise<void>((res) => {
			// biome-ignore lint: we are simulating this condition with always true
			if (true) {
				// Pretend this was some switch condition
				process.exit(12);
			}
			res();
		});
	} else if (args.fail === "exitInTimeout") {
		console.log("exitInTimeout");
		await new Promise<void>((res) => {
			setTimeout(() => {
				// biome-ignore lint: we are simulating this condition with always true
				if (true) {
					process.exit(22);
				}
				res();
			}, 100);
		});
	} else if (args.fail === "exitInInterval") {
		console.log("exitInInterval");
		await new Promise<void>((res) => {
			let idx = 0;
			setInterval(() => {
				idx++;
				if (idx == 4) {
					process.exit(33);
				} else if ( idx == 5) {
					// Simulate never getting here
					res();
				}
			}, 10);
		});
	} else if (args.fail === "exitInImmediate") {
		console.log("exitInImmediate");
		await new Promise<void>((res) => {
			setImmediate(() => {
				// biome-ignore lint: we are simulating this condition with always true
				if (true) {
					process.exit(33);
				}
				res();
			});
		});
	} else {
		console.log("Success!");
	}
}

void main()
	.then(() => {
		process.exit(); // Fast end when promise stops
	})
	.finally(() => console.log("finally called"));
