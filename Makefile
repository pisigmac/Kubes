.PHONY: start stop restart status logs doctor seed test build lint verify test-e2e help

start:
	@./kubes start $(ARGS)

stop:
	@./kubes stop $(ARGS)

restart:
	@./kubes restart $(ARGS)

status:
	@./kubes status

logs:
	@./kubes logs $(ARGS)

doctor:
	@./kubes doctor

seed:
	@./kubes seed

test:
	@./kubes test $(ARGS)

test-e2e:
	@pnpm run test:ui

build:
	@./kubes build

lint:
	@./kubes lint

verify:
	@./kubes verify

help:
	@./kubes help
