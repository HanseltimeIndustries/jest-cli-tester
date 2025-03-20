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
				if (true) {
					// Pretend this was some switch condition
					process.exit(12);
				}
				res();
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
