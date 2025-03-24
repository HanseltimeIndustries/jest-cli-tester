# Contributing

There are multiple ways that you can contribute to this project.  In all of them, please
make sure to be respectful of fellow users and developers.

- [Contributing](#contributing)
  - [Submitting an issue](#submitting-an-issue)
  - [Developing a Feature or Fix](#developing-a-feature-or-fix)
    - [Opening a PR](#opening-a-pr)
    - [Development setup](#development-setup)
    - [Commit syntax](#commit-syntax)
    - [Development Testing](#development-testing)
      - [Optional - Personal CI checks](#optional---personal-ci-checks)
      - [Optional - Debugging](#optional---debugging)
  
*Table of Contents generated with VSCode Markdown All In One extension*

## Submitting an issue

The simplest way that you can contribute to this project is to submit a issue asking for a
feature or reporting a bug fix.

*TODO: bugfix template*

For bugfixes, please make sure to include any relevant output from the cli or context issues.

For feature requests, a rationale behind need (ideally if you have a real world example) and then
the proposed change in (at least) terms of how the user experience would go.

## Developing a Feature or Fix

### Opening a PR

When opeing a PR from a fork, please link the issue that you are solving (and if one does not exist, please make one).
Afterwards, please provide a description of the main file changes.

If you would like to contribute a fix or feature proposal, please fork the repo and...

### Development setup

1. Ensure you are on node >=20 and that corepack is enabled: `corepack enable`
2. Explicitly run `yarn install`

### Commit syntax

We make use of the [angular commit syntax](https://www.npmjs.com/package/@commitlint/config-angular) rules for commitlint.

Additionally, our release process uses [semantic-release](https://semantic-release.gitbook.io/semantic-release/), because of this
particular angular commits trigger a release:

| Commit Subject | Version bump | Use for                                                                                   |
|----------------|--------------|-------------------------------------------------------------------------------------------|
| feat           | minor bump   | use for all features that are new compared to previous functionaliy                       |
| fix            | patch bump   | use for all fixes to bugs or if there's a another need for a re-release                   |
| ci             | no bump      | use if just making improvements to ci processes                                           | 
| docs           | no bump      | use if updating documentation (that does not need to be submitted to npm)                 |
| build          | no bump      | if just updating build dependencies, typically for building that don't affect output code |
| test           | no bump      | for updates to just testing related code                                                  |
| * the rest     | no bump      | use as you see fit                                                                        |

### Development Testing

See [Development](./DEVELOPMENT.md)

#### Optional - Personal CI checks

Github allows public repos to run CI/CD for free on github actions.  The [pr-checks.yaml](./.github/workflows/pr-checks.yaml) is set up
to not require any specific secrets.  If you would like to test your PRs before submitting them back to the main repo, it is recommended that:

1. You enable the Github Actions
2. You disable the release job (that requires secrets specific to the package)
3. Run your PR against your main or alpha branch

#### Optional - Debugging

One way to debug runs of code in this project is through the VSCode javascript debugger terminal.  The benefit of this debugger approach
is that any javascript process that runs will automatically be run and available to debug.  This means that running the integration test
scripts from that terminal will also hit break points when the cli portion of the application is run.
