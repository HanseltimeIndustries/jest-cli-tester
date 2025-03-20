# CLI Script Tester

CLI Script Tester exists for running Jest against script files that have been written to not have module.exports.
This is not just a wrapper that calls spawn and has a limited ability to influence the script. This is a combination of transformer
and script wrapper that will make it so that you can run your script in the jest process with mocks and hooks that track how the 
process was supposed to exit.

## Simple Example

Example bin script (synchronous):

```javascript
// @CLITestTransform
const arg3 = process.argv[2]

console.log('we did something with arg3')
```

Example bin script (asynchronous):

```javascript
// @CLITestTransform
import {someAsyncFnc} from 'module'

const arg3 = process.argv[2]

async main() {
    await someAsyncFunc()

    console.log('we did something with arg3')
    process.exit()
}

void main()
```

A basic example jest file (using `jest-chain-transform`, `ts-jest` and this library):

```js
const { getEcmaVersionFromTsConfig } = require('@hanseltime/jest-cli-tester');
const TS_CONFIG = 'tsconfig.json'

module.exports = {
    transform: {
    "\\.[jt]sx?$": [
      'jest-chain-transform',
      {
        transformers:[
          [
            'ts-jest', {
              tsconfig: TS_CONFIG,
            }
          ],
          [
            '@hanseltime/jest-cli-tester/transform',
            {
              ecmaVersion: getEcmaVersionFromTsConfig(TS_CONFIG)
            }
          ]
        ]
      }
    ],
  },
}
```

And a basic jest test would look like:

```typescript
const logSpy = jest.spyOn(console, 'log')
const cliRunner = new CLIRunner({
  throwProcessErrors: false,
})
it('logs', () => {
  // Resolve it here since the runner doesn't know what context to resolve from
  const scriptPath = require.resolve('../bin/myScript')
  // Verify the process ended by calling process.exit()
  expect(await cliRunner.run(scriptPath, ['--someArg'])).toEqual('process.exit()')

  // Ensure the log was made by checking the spy
  expect(logSpy).toHaveBeenCalledWith('we did something with arg3')
})
```

## How it works

At a high-level, this library uses a transformer to wrap any cli script entrypoint files that are required by the CLIRunner into a module
with specific exports.

1. Jest Transform process
   1. `jest-chain-transform` should orchestrate actual transforms
   2. `<Your normal transformer>` is called first to generate transformed javascript
   3. `@hanseltime/jest-cli-tester/transform` is called
      1. The file name is evaluated against the `cliScripts` option or the src is searched for `// @CLITestTransform` at the top
      2. If the file is a match from above, the transform inserts:
         1. a module wrapper + hooks for running the file into source
         2. a "throw any process exit errors" function call in any catches

2. During a test, a script run involves:
   1. Declaring a CLIRunner that keeps track of hooks for standard process calls
   2. Passing the resolved path of the script to load
   3. Loading the resolved path and all of its dependencies in isolation (i.e. `jest.isolateModules`)
      1. The load triggers the above transform process
   4. Providing global functions for Promises, process.exit(), and process.argv that allow us to track process.exit calls
   5. The loaded module is then run via it's wrapping function and the result is reported back from `run()`
   
If you would like more nuanced notes on some of the system, see [Design](./DESIGN.md).

## Installation

You will need `jest-chain-transform`, `@hanseltime/jest-cli-test` and your base transformer of choice (i.e. babel-jest, ts-jest).

```shell
# For ts-jest
yarn add --dev jest-chain-transform @hanseltime/jest-cli-test ts-jest

# For babel-jest - babel-jest is already included
yarn add --dev jest-chain-transform @hanseltime/jest-cli-test
```

Once you have installed the correct packages, you will need to update your jest config file (we recommend using a .js config file), to chain transforms:

If using ts-jest:

```javascript
// jest.config.js
const { getEcmaVersionFromTsConfig } = require('@hanseltime/jest-cli-tester');
const TS_CONFIG = 'tsconfig.json'

module.exports = {
    transform: {
    "\\.[jt]sx?$": [
      'jest-chain-transform',
      {
        transformers:[
          [
            'ts-jest', {
              // You HAVE to keep comments if you want to use @CLITestTransform comment
              tsconfig: TS_CONFIG,
            }
          ],
          [
            '@hanseltime/jest-cli-tester/transform',
            {
              ecmaVersion: getEcmaVersionFromTsConfig(TS_CONFIG)
            }
          ]
        ]
      }
    ],
  },
}
```

If using babel-jest:

```javascript
// jest.config.js
module.exports = {
  transform: {
    "\\.[jt]sx?$": [
      'jest-chain-transform',
      {
        transformers:[
          [
            'babel-jest',
            {
              // You HAVE to keep comments if you want to use @CLITestTransform comment
              // Either - only keep the targeted comment if found
              shouldPrintComment: (c) => {
                return c.trim().startsWith('@CLITestTransform')
              },
              // OR - just keep all comments
              comments: true,
            }
          ],
          [
            '@hanseltime/jest-cli-tester/transform',
            {
              // TODO: we don't yet have a function for interpolating this - jest preset detects
              // what the current node version supports so you can choose a number close to that
              ecmaVersion: 2018
            }
          ]
        ]
      }
    ],
  },
}
```

## Marking your bin files for testing

You have 2 options for designating that your CLI script should be transformed for testing with the CLIRunner.

### 1 Annotated Comment (Preferred)

__Important:__ Since our transform is getting piped transformations from `babel-jest` or `ts-jest` you need to make sure that you preserve the comments during that transform.  Without it, you will get errors saying
that you are trying to run a script that wasn't transformed.

You can easily prepare your script for testing via the CLIRunner by simply adding this comment at the top of your CLI file:

```typescript
// @CLITestTransform
import something from 'something'

something()
```

Then as long as you use the CLIRunner, your file will have the necessary stubs transformed into it.

### 2 Regex configuration

You can configure which scripts should be transformed as cli-scripts by adding the cliScripts transform option.

NOTE: this opens the door for other scripts to accidentally get transformed if you make your regex too wide and makes it less explicit for people viewing a CLI script to know if it is meant to be tested.  However, if
you need to keep comments off, then you can use this.

```js
// jest.config.js
module.exports = {
    transform: {
    "\\.[jt]sx?$": [
      'jest-chain-transform',
      {
        transformers:[
          [
            'ts-jest', {
              // You HAVE to keep comments if you want to use @CLITestTransform comment
              tsconfig: TS_CONFIG,
            }
          ],
          // Use the cliTransformer that should have been transpiled before this call
          [
            '@hanseltime/jest-cli-tester/transform',
            {
              ecmaVersion: getEcmaVersionFromTsConfig(TS_CONFIG),
              cliScripts: [
                /.*\/src\/bin\/my-bin-file.ts/
              ]
            }
          ]
        ]
      }
    ],
  },
}
```

### Source Map support

Depending on your transform, if you would like to debug with source mapping, you will need to make sure that
whatever transpiler you use (ts-jest or babel-jest), creates inline source code comments.  If you do not have
these, this transformer will still work, but it cannot accurately update the source maps since it only
reads them from comments in the source code provided.

## Usage Discussion

The core concept behind this library is the CLIRunner. It essentially preps your cli script as a node.js module for execution (and wraps it into a module export with the transformer so that it can run it in the jest context).

You can create a number of CLIRunner instances for the sake of having particular tester configurations. Note, every run will reset the module loading of the test so that we can re-run just like a fresh load (but mocks will be preserved :D).

CLIRunner will stub out different non-standard process returns:

- process.exit()
- process.abort()

The returns will be thrown as an error. (Don't worry! We inject a handler into each catch and finally block in the entrypoint file so that these specific messages are thrown through).

The error messages are the equivalent to a call to the same process function.

### Known process.exit limitation

The current state of the CLI transformer is that it only performs the correct transform to throw `process.exit()` calls through catches
within the entrypoint script. So if you would like to test importing some function that calls `process.exit` within any catches or finally's,
you will get erratic behavior.

In general, it's a bad idea to have a non-entrypoint script perform a process.exit, so it feels like a fair compromise to reqeust that
the developer makes sure to propagate errors from imported files to 
the top-level and then call process.exit() there.

If you would like to test a process.exit in imported files, please submit an issue to this repository, detailing your case.

### The throwProcessErrors option

By default, we continue to throw our process.exit() and process.abort errors. This has proven to be tedious to keep up however.

Now you can set the `throwProcessErrors: false` option on your CLIRunner and simply expect the string output that would match the expected thrown Error.

###$ Example (throwProcessErrors = false):

```typescript
const cliRunner = new CLIRunner({
  throwProcessErrors: false,
})

jest.mock('Some Imported mock in my runner scripts') // We can mock any imports here and test them!

describe('something', () => {
  const myCLIScript = require.resolve('./cli') // relative paths NEED to be resolved from their relative location

  it('should run with these args', async () => {
    // This assumes we naturally let the script end
    expect(await cliRunner.run(myCLIScript, ['--flag1', '--opt', 'anOption'])).to.be.null
  })

  it('should called process.exit() - still good outcome', async () => {
    // This is when someone calls process.exit() - a good completion but sudden stop
    expect(await cliRunner.run(myCLIScript, ['--flag1', '--opt', 'anOption2'])).to.be.eql('process.exit()')
  })

  it('should fail with bad opt', async () => {
    expect(await cliRunner.run(myCLIScript, ['--flag1', '--opt', 'anOption3'])).to.be.eql('process.exit(13)')
  })
})
```

### Example (throwProcessErrors = true):

```typescript
const cliRunner = new CLIRunner()

jest.mock('Some Imported mock in my runner scripts') // We can mock any imports here and test them!

describe('something', () => {
  const myCLIScript = require.resolve('./claim-job') // relative paths NEED to be resolved from their relative location

  it('should run with these args', async () => {
    // This assumes we naturally let the script end
    await cliRunner.run(myCLIScript, ['--org', '2092302', 'bubububub'])
  })

  it('should called process.exit() - still good outcome', async () => {
    // This is when someone adds process.exit() - a good completion but sudden stop
    await expect(async () => cliRunner.run(myCLIScript, ['--org', '20923045', 'fufufufuf']))
      .rejects.toThrow('process.exit()')
  })

  it('should fail with new run though', async () => {
    await expect(async () => cliRunner.run(myCLIScript, ['--org', '20923045', 'fufufufuf']))
      .rejects.toThrow('process.exit(13)')
  })
})
```
# Developing

See [Development](./DEVELOPMENT.md)
