.PHONY: deps dev check

# Install workspace dependencies exactly as locked.
deps:
	pnpm install --frozen-lockfile

# Start the web app dev server on http://localhost:5173.
dev:
	pnpm --filter @yagura/web dev

# The single canonical gate; CI runs exactly this target.
check: deps
	pnpm -r build
	pnpm -r typecheck
	pnpm -r test
	pnpm -r lint
	pnpm lint
	pnpm format:check
	pnpm depcruise
