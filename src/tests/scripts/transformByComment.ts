// @CLITestTransform
import { ArgumentParser } from "argparse";

const parser = new ArgumentParser();

parser.add_argument("--yay", {
	type: String,
	required: false,
	default: "whoo",
});

parser.add_argument("--code", {
	type: String,
	required: false,
})

let args: {
	yay: string;
	code?: string;
} = parser.parse_args();

if (args.code) {
	process.exitCode = args.code;
}

console.log(`Here we are! ${args.yay}`);
