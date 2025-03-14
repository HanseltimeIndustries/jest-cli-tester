// @CLITestTransform
import { ArgumentParser } from "argparse";

const parser = new ArgumentParser();

parser.add_argument("--yay", {
	type: String,
	required: false,
	default: "whoo",
});

let args: {
	yay: string;
} = parser.parse_args();

console.log(`Here we are! ${args.yay}`);
