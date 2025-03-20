# Developing

## Install dependencies

```shell
corepack enable
yarn install
```

## Build the package

```shell
yarn build
```

## Run tests

```shell
# run tests that use ts-jest
yarn test:ts-jest
# run tests that use babel-jest
yarn test:babel-jest

# Or run all tests at once
yarn test
```

## Pkgtest

We also use pkgtest to verify that our package works when imported by different package managers
and module systems.  The file fixtures for the project (esm and cjs) are located within the 
[pkgtest folder](./pkgtest/).

You can run pkgtest to make sure the configurations work by calling:

```shell
yarn pkgtest
```

Please see the [pkgtest documentation](https://hanseltimeindustries.github.io/pkgtest/latest/) for debugging and how to filter tests, etc.

## Formatting & linting

```shell
yarn lint --fix
yarn format --fix
```
