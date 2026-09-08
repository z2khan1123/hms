# Publishing this repo to GitHub

The repository has 34 commits on `main` and no remote. This document is the
hand-off: the steps below create a **private** GitHub repository and push `main`
to it. They have to be run by the owner, because the one interactive step —
authentication — opens a browser and needs a human at the keyboard.

The GitHub CLI (`gh`) is already installed, version 2.100.0, at
`C:\Program Files\GitHub CLI\gh.exe`. A PowerShell window that was already open
before the install will not have it on `PATH`; open a new one so the commands
below resolve.

## 1. Authenticate

```bash
gh auth login
```

Answer the prompts: **GitHub.com**, then **HTTPS** as the Git protocol, then
**Yes** to authenticate Git with your GitHub credentials, then **Login with a
web browser**. The CLI shows a one-time code and opens github.com; paste the
code there and approve. This flow stores its own credential — you do not need a
personal access token, and nothing should ask you to type a password or token
into the terminal.

Confirm it worked:

```bash
gh auth status
```

It should report that you are logged in to github.com as your account.

## 2. Create the repository and push

Run this from the repository root, `D:\HMS`:

```bash
gh repo create hms --private --source=. --remote=origin --push
```

`--source=.` uses this existing local repo instead of creating an empty one,
`--remote=origin` wires the new GitHub repo up under the usual remote name, and
`--push` sends `main` in the same step. The repo is created as `<your-user>/hms`.
If that name is already taken on your account, change the first argument and
leave the rest as-is.

## 3. Verify

```bash
git remote -v
```

Both the fetch and push lines should point at
`https://github.com/<your-user>/hms.git`.

```bash
git log --oneline -1
```

Note the commit hash, then open the repo on github.com and check the same hash
sits at the top of `main`. That confirms the push landed in full.

## The repository is private

`--private` was deliberate. This is commercial multi-tenant hospital software and
it should not be public. GitHub keeps whatever visibility you create the repo
with; it does not change on its own.

If it ever needs to be public:

```bash
gh repo edit --visibility public
```

Run that from `D:\HMS`. `--visibility private` reverses it.

## Never commit `apps/api/.env`

`apps/api/.env` holds the real database credentials. It is listed in
`.gitignore`, it has never been committed, and it must stay that way — only the
`.env.example` placeholder files are tracked. Before any `git add`, check that
`git status` does not show `apps/api/.env`.

Publishing to a private repo does not expose that file. But if the Neon database
password has ever been pasted somewhere it could be read by someone else — a
chat, an issue, a screenshot, a commit on another machine — rotate it in the
Neon console now. A private repo is not a reason to leave a leaked credential in
place.
