#!/usr/bin/env ts-node
// @CLITestTransform
/**
 * Simple script for simulating an async CLI script
 * TODO - this is not implemented yet given the additional overhead.  Feel free to enable the test that uses this
 *     and contribute the feature for transformation.
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
	} catch (_err) {
		console.log("another catch");
	}
}

void main().then(() => {
	process.exit(); // Fast end when promise stops
});
