# On Creation of your repo from the base template

**Note: please keep this file in your repo so that when new template syncs occur you can see if you need to make any retro-active changes**

This Github template hopefully helps create a standard boilerplate for github actions that enforces things like:

- Linting and testing patterns
- Typescript configuration
- Dual CommonJS and ESM support
- Semantic Versioning and major version tagging
- CI/CD standardized integrations
- A standard documentation site through github pages

## Getting Started

There are a few things that you need to change from this template:

### [package.json](./package.json)

- `name: <your package name>`
- `description: <your description>`
- `repository: <Your github url>`
- `bugs: <your github issues url>`
- `hompage: <your homepage url>`
- `author: <your author name>`

### [docs](./docs/)

Currently, everything but the Contributing page is place holder.  You will want to run `mkdocs serve` and at least create a minimum placeholder
for your website.

### [mkdocs.yml](./mkdocs.yml)

You will want to update the `site_name` and `repo_url` to reflect your package and Github repository.

### [README.md](./README.md)

The README.md currently links to the raw `docs/` folder.  There is an additional link that should link to your gitub pages site url (the one
that you can preview via `mkdocs serve`) which will be a more robust version of markdown.  Edit that link to be the actual url that will exist.

## [pkgtest](./pkgtest)

You will also want to write some actual pkgtest file tests that at least import your library and run something so that you can evaluate if your
project runs well in all variations of package manager + module type for NodeJS.

### [pkgtest.config.js](./pkgtest.config.js)

The current pkgtest config file is set up just to do fileTests.  If you are writing `bin` scripts or need to test how your package works within
another tool, you should change the test entry configuration to have those configurations.

### Github configuration

**TODO: it would be nice to provide a pulumi set of IAC to configure the github repo completely**

Because template repositories cannot carry their permissions configuration, you will need to set up a few extra pieces to your Github repository.
Please note, that you should still check other policies, but these are a minimum set of requirements.

#### Auto-commit Github Application

Because of the way that `semantic-release` will create CHANGELOG notes, update a version to your package.json and then push a new commit
to your release branch, you will need to be able to write back onto the deploy branch as part of your release process. 
In order to do this, we heavily recommend using a Github Application with the appropriate permissions (in fact, that is how the deploy.yaml is currently set up).

You will need a Github application that has:

- Repository Contents - read + write
- Metadata - read-only

For setting this up, you will want to be an Organization Admin and
[create a simple private github application](https://docs.github.com/en/apps/creating-github-apps).  
Once you have done that, you will want to install the application in your organization and (recommended) limit the repositories for that application.

Once you have the application, you will want to generate a private key and then copy that private key into an agreed upon Github Secret value and then
delete the private key from any other locations.

##### About Security posture for Github Application key

At the most naive, you can create an agreed upon organization secret for the private key with something like "private" or "all". This type of position,
while not insecure, is also subject to you trusting that maintainers do not allow malicious github actions into the repo that could try to acquire that
private key and that all maintainers across your entire organization are good actors.

1. Limiting repositories

   The simplest way to limit the scope of this primary key exposure is to change its visibility to only the repos that you specify instead of the mass private/all.

   If this is your set up, you will need to add this new repo as an allowed repo to the secret.

2. Using environments

   Depending on your Github pricing tier and the public/private nature of your repos, you may find it easier to create a Github Environment and update your workflow to use that environment. You can restrict your github environment to only deploy on agreed upon branches, and therefore restrict this
   key to the release flow on its release branches.

3. An app per action

   The 2 preceding options deal with restricting exposure of a private key that might be re-used across diffferent actions repos. A way to minimize the
   concern about this leaking would be to create multiple applications, with the most aggressive strategy for this approach being to make a separate
   github application for every repo that needs to release.

All the strategies listed above depend on your team's security tolerances.

\_\_For your template, regardless of strategy, please update the app_id and private key in [release.yaml](./.github/workflows/release.yaml) to match the
correct secrets with the App Id and corresponding Private Key of the application.

#### Repository Rule Sets

Now that we have our special auto-commit application set up, we can set up protections on this repository to ensure that only the auto-commit application
can perform direct actions on release branches.

# For release:

- Create a rule set in the repo settings
- Set the branches to:
  - main - for actual release
  - alpha - for alpha channel release
- Add a "bypass exception" for the application that you just specified in the workflow file
- Ensure status checks are required
  - You will have to run your statuses once to add them
  - At the very least, you will want to add:
    - no-committed-bundle
    - ci-checks
- Add additional checks that you would like

# For github pages documentation

- Create a rule set in the repo settings
- Set the branches to:
  - gh-pages
- Add a "bypass exception" for the applciation that you just specified in the workflow file
- Block force pushes, creations, and updates

Important! - Before you enable the github pages application, make sure to push an empty branch to gh-pages.
Do not push a clone of main, as we actually want dissociated branch histories (since we will be building things
that are normally gitignored). 