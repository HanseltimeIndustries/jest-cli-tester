#!/usr/bin/env ts-node

// @CLITestTransform

/**
 * Simple script for handling failed catches
 */

import { ArgumentParser } from "argparse";

const parser = new ArgumentParser();

parser.add_argument("--exitAt", {
	type: String,
	required: false,
	default: "none",
});

let args: {
	exitAt: string;
} = parser.parse_args();

async function main() {
	if (args.exitAt === "main") {
		console.log("Exit At Main");
		process.exit(14);
	} else if (args.exitAt === "tryCatch") {
		try {
			process.abort();
		} catch (_err) {
			console.log("try catch error");
		} finally {
			console.log("in the finally");
		}
	} else if (args.exitAt === "finallyOnly") {
		console.log("Exit only finally");
		try {
			process.exit(1);
		} finally {
			console.log("in the finally");
		}
	} else {
		console.log("Success!");
	}
}

void main()
	.then(() => {
		process.exit(); // Fast end when promise stops
	})
	.catch(() => {
		console.log("caught the errors");
	});
