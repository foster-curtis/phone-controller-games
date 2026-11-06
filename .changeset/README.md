# Changesets

Each file in this folder is a pending change note: which packages changed and whether the change is
`major`, `minor` or `patch`. Rules for picking the level are in `PLATFORM.md` §5.

```sh
pnpm changeset                                        # add a note (asks which packages and the level)
pnpm changeset --patch @pcg/sunny-side -m "Fix ..."   # the same, without prompts
pnpm check:changeset                                  # fails if this branch changed a package without a note
pnpm changeset version                                # on deploy: bump versions, write CHANGELOG.md files
```
