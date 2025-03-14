#!/usr/bin/env ts-node
// @CLITestTransform
/**
 * Simple script for simulating an async CLI script
 */

import { ArgumentParser } from "argparse";
import { innerImport } from "./innerImport";

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
	await new Promise<void>((res) => {
		setTimeout(() => {
			res();
		}, 100);
	});
	try {
		innerImport(args.fail === "true");
	} catch (err) {
		console.log("another catch");
	}
}

void main().then(() => {
	process.exit(); // Fast end when promise stops
});
