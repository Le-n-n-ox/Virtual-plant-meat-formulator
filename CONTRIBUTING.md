# Contributing

## Git rules

- Do not commit directly to `main` or `develop`.
- Open pull requests into `develop`; get at least one review before merging.
- Use commits in `type(scope): summary` format, for example `chore(frontend): add route placeholders`.
- Add the `contract-change` label to pull requests that change API contracts.

## Pull request checklist

- [ ] The change follows the frontend and backend guides.
- [ ] Frontend lint, typecheck, tests, and build pass when frontend files changed.
- [ ] Backend tests, Ruff lint/format checks, and mypy pass when backend files changed.
- [ ] No scientific data or progress behavior has been fabricated.
- [ ] API contract changes are labelled `contract-change` and documented.
- [ ] CI checks pass and the pull request has one review.

## Backend checklist

- [ ] Tests pass.
- [ ] Ruff lint and format checks pass.
- [ ] mypy passes.
- [ ] Required database migration is included.
- [ ] OpenAPI diff has been reviewed.
