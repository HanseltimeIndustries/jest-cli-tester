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
	} else {
		console.log("Success!");
	}
}

void main().then(() => {
	process.exit(); // Fast end when promise stops
});
