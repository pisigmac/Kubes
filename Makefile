.PHONY: start stop restart status logs doctor seed test build lint verify

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

build:
	@pnpm build

lint:
	@pnpm lint

verify:
	@bash ./scripts/verify.sh
