#!/usr/bin/env ts-node
// @CLITestTransform

/**
 * Simple script for simulating an async CLI script where the void is the last line for source-map processing
 */

async function main() {
	console.log("Success!");
}

void main().then(() => process.exit());
