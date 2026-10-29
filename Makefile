# No host Node required: npm runs in the official image when `npm` isn't on PATH.
HOST_NPM := $(shell command -v npm 2>/dev/null)
DOCKER_RUN = docker run --rm -u $$(id -u):$$(id -g) -e HOME=/tmp -v $(CURDIR):/repo $(1) node:22-bookworm-slim
DOCKER_NPM = $(call DOCKER_RUN,-w /repo/web $(1)) npm
NPM ?= $(if $(HOST_NPM),npm,$(call DOCKER_NPM,))
NPM_DEV ?= $(if $(HOST_NPM),npm,$(call DOCKER_NPM,-p $(PORT):$(PORT)))
NODE ?= $(if $(HOST_NPM),node,$(call DOCKER_RUN,-w /repo -p $(MOCK_PORT):$(MOCK_PORT) -e MOCK_PORT=$(MOCK_PORT)) node)
UV ?= uv
PORT ?= 3000
MOCK_PORT ?= 8106

.PHONY: help install dev mock fixture build test lint check clean

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install:  ## Web dependencies
	cd web && $(NPM) ci

dev:  ## next dev on :$(PORT), calling darkroom at NEXT_PUBLIC_DARKROOM_URL (default http://localhost:8106)
	cd web && $(NPM_DEV) run dev -- --hostname 0.0.0.0 --port $(PORT)

mock:  ## Serve the fixture as a darkroom on :$(MOCK_PORT) (no GPU)
	$(NODE) scripts/mock_darkroom.mjs

fixture:  ## Redraw the committed fixture records and images (needs uv)
	$(UV) run scripts/make_fixture.py

build:  ## next build
	cd web && $(NPM) run build

test:  ## vitest
	cd web && $(NPM) test

lint:  ## eslint + tsc
	cd web && $(NPM) run lint && $(NPM) run typecheck

check: lint test build  ## Everything CI runs

clean:  ## Remove build output and dependencies
	rm -rf web/node_modules web/.next web/out
