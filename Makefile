.PHONY: test watch deploy deploy-junglemd

test:
	pnpm test

watch:
	pnpm test:watch

deploy:
	pnpm wrangler deploy

deploy-junglemd:
	pnpm wrangler deploy --env junglemd
