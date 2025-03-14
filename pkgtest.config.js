const nodeLinkedYarnBerry = {
	alias: "yarn node linked",
	packageManager: "yarn-berry",
	options: {
		yarnrc: {
			nodeLinker: "node-modules",
		},
	},
};

const packageManagers = [
	"npm",
	"pnpm",
	"yarn-v1",
	"yarn-berry",
	nodeLinkedYarnBerry,
];

const baseEntry = {
	scriptTests: [
		{
			name: "test",
			script: "jest",
		},
	],
	packageJson: {
		devDependencies: {
			"@jest/types": "^29.6.3",
			"@types/jest": "^29.5.14",
			jest: "^29.7.0",
			"jest-chain-transform": "^0.0.8",
			"ts-jest": "^29.2.5",
			typescript: "^5.7.2",
			"@types/node": "^20",
		},
	},
	timeout: 10000,
	packageManagers: packageManagers,
};

// Yarn plug'n'play does not play well with local installs and ts-node.  We'll wait for pkgtest to find a fix
const cjsProjects = {
	...baseEntry,
	additionalFiles: ["fixtures/cjs/"],
	moduleTypes: ["commonjs"],
};

const esmProjects = {
	...baseEntry,
	additionalFiles: ["fixtures/esm/"],
	moduleTypes: ["esm"],
};

module.exports = {
	rootDir: "pkgtest",
	locks: true,
	matchIgnore: ["fixtures/**"],
	entries: [cjsProjects, esmProjects],
};
