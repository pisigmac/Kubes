.PHONY: start stop restart status logs doctor seed test build lint verify test-e2e

start:
	@bash ./scripts/start_all.sh $(ARGS)

stop:
	@bash ./scripts/stop_all.sh $(ARGS)

restart:
	@bash ./scripts/restart_all.sh $(ARGS)

status:
	@bash ./scripts/status.sh

logs:
	@bash ./scripts/logs.sh $(ARGS)

doctor:
	@bash ./scripts/doctor.sh

seed:
	@bash ./scripts/seed_data.sh

test:
	@pnpm test

test-e2e:
	@pnpm run test:ui

build:
	@pnpm build

lint:
	@pnpm lint

verify:
	@bash ./scripts/verify.sh
