[**@hanseltime/jest-cli-tester**](../README.md)

***

[@hanseltime/jest-cli-tester](../README.md) / CLIRunner

# Class: CLIRunner

## Constructors

### new CLIRunner()

> **new CLIRunner**(`options`): `CLIRunner`

#### Parameters

##### options

`CLIRunnerOptions` = `...`

#### Returns

`CLIRunner`

## Properties

### env

> `readonly` **env**: `Record`\<`string`, `string`\>

***

### throwProcessErrors

> `readonly` **throwProcessErrors**: `boolean`

## Methods

### run()

> **run**(`cliModuleUrl`, `args`): `Promise`\<`null` \| `string`\>

#### Parameters

##### cliModuleUrl

`string`

the resolved url of the script : require.resolve('.my-script-local-path')

##### args

`string`[] = `[]`

cli arguments array that you want to have present on the running

#### Returns

`Promise`\<`null` \| `string`\>

the string message equivalent of the process.exit or abort that ended the process or null if it exited organically
