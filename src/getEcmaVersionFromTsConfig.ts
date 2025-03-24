import { getTsconfig } from "get-tsconfig";
import { basename, dirname, isAbsolute, join } from "path";
import { ecmaVersion } from "acorn";

export function getEcmaVersionFromTsConfig(configPath?: string): ecmaVersion {
	let path: string;
	if (!configPath) {
		path = join(process.cwd(), "tsconfig.json");
	} else {
		path = isAbsolute(configPath)
			? configPath
			: join(process.cwd(), configPath);
	}

	const res = getTsconfig(dirname(path), basename(path));

	if (!res) {
		throw new Error(`Cannot find tsconfig file at: ${path}`);
	}
	if (!res.config.compilerOptions?.target) {
		throw new Error(`Must supply target entry in order to infer ecmaVersion`);
	}
	const { target } = res.config.compilerOptions! as { target: string };
	if (target.toLowerCase() === "esnext") {
		return "latest";
	}

	// We replace the 'es' prefix to get to the ecmaversion
	return parseInt(target.replace("es", "")) as ecmaVersion;
}
