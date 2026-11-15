# No host Node required: npm runs in the official image when `npm` isn't on PATH.
HOST_NPM := $(shell command -v npm 2>/dev/null)
DOCKER_RUN = docker run --rm -u $$(id -u):$$(id -g) -e HOME=/tmp -v $(CURDIR):/repo $(1) node:22-bookworm-slim
DOCKER_NPM = $(call DOCKER_RUN,-w /repo/web $(1)) npm
# A container sees none of the caller's environment. `-e NAME` forwards a variable when it is set and nothing when it is not.
WEB_ENV = -e NEXT_PUBLIC_DARKROOM_URL -e SAFELIGHT_DEV_ORIGINS
MOCK_ENV = $(foreach name,NSFW_ALLOWED DEVMODE OLLAMA SINGGUARD NUDENET AGE STEP_MS SCAN_MS,-e MOCK_$(name))
NPM ?= $(if $(HOST_NPM),npm,$(call DOCKER_NPM,$(WEB_ENV)))
NPM_DEV ?= $(if $(HOST_NPM),npm,$(call DOCKER_NPM,-p $(PORT):$(PORT) $(WEB_ENV)))
NODE ?= $(if $(HOST_NPM),node,$(call DOCKER_RUN,-w /repo -p $(MOCK_PORT):$(MOCK_PORT) -e MOCK_PORT=$(MOCK_PORT) $(MOCK_ENV)) node)
UV ?= uv
PORT ?= 3097
MOCK_PORT ?= 8106

.PHONY: help install dev mock fixture sync wire build test lint check clean tape-sample tape pages shared-check browser-check

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

sync:  ## Move to darkroom's dev HEAD: schema, wire types, docs, then re-record the fixture (network; needs uv)
	cd web && $(NPM) run darkroom:pull
	$(MAKE) fixture

wire:  ## Regenerate the wire types from the committed schema (web/schema/pins.json)
	cd web && $(NPM) run darkroom:types

build:  ## next build
	cd web && $(NPM) run build

test:  ## vitest
	cd web && $(NPM) test

lint:  ## eslint + tsc + the darkroom sync record (docs, wire types, fixture version)
	cd web && $(NPM) run lint && $(NPM) run typecheck && $(NPM) run darkroom:check

check: lint test build  ## Everything CI runs

# ---- Static demo (safelight.dragonhound.dev): a recorded tape, served without darkroom.

PYTHON ?= python3
# Where the tape is written; the page reads it at NEXT_PUBLIC_SAFELIGHT_TAPE_URL (/data-tape by default).
TAPE_DIR ?= web/public/data-tape
DARKROOM_URL ?= http://localhost:8106
TAKES ?= docs/demo-takes.json
DARKROOM_COMMIT ?=
NOTE ?=

tape-sample:  ## The stand-in tape: fixture/ records and placeholders, labelled Sample data (needs Pillow)
	$(PYTHON) scripts/record_tape.py sample --out $(TAPE_DIR) \
		--note "The repo's fixture records with hand-written verdicts and flat-colour placeholder images, standing in until the demo set is recorded."

tape:  ## Record TAKES against the darkroom at DARKROOM_URL (GPU host; only once the take list is approved)
	$(PYTHON) scripts/record_tape.py live --darkroom $(DARKROOM_URL) --takes $(TAKES) --out $(TAPE_DIR) \
		$(if $(DARKROOM_COMMIT),--darkroom-commit $(DARKROOM_COMMIT)) $(if $(NOTE),--note "$(NOTE)")

pages:  ## Static export (SAFELIGHT_STATIC=1) of the tape to web/out/, with a hash CSP on every page
	cd web && NEXT_PUBLIC_SAFELIGHT_TAPE_URL=/$(patsubst web/public/%,%,$(TAPE_DIR)) $(NPM) run build:pages

shared-check:  ## The vendored Dragonhound shared layer is unedited and matches the published v1 manifest
	node web/vendor/dh/sync-shared.mjs --check . --against https://dragonhound.dev/brand/v1/manifest.json --allow-outdated

browser-check:  ## Browser check of web/out at 1440 and 390, light and dark (needs PLAYWRIGHT_DIR; SHOTS=dir for screenshots)
	$(if $(SHOTS),SHOTS=$(SHOTS)) node web/scripts/demo-e2e.mjs web/out

clean:  ## Remove build output and dependencies
	rm -rf web/node_modules web/.next web/out
