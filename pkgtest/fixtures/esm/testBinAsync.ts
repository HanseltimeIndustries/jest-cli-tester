// @CLITestTransform
const arg = process.argv[2];

async function main() {
	await new Promise<void>((res, rej) => {
		setTimeout(() => {
			res();
		});
	});
	console.log("we did something with arg: " + arg);
	process.exit();
}

void main();
