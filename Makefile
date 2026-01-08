.PHONY: install dev build clean electron help

# Default target
all: install dev

# Install dependencies
install:
	npm install

# Run development server (web-only, fastest for testing)
dev:
	npm run dev

# Run with Electron (desktop app)
electron: install
	npm run electron:dev

# Build for production
build:
	npm run build

# Clean build artifacts
clean:
	rm -rf dist node_modules

# Run the simulator (alias for dev)
run: dev

# Quick start - install and run
start: install dev

help:
	@echo "RoboCup Jr. Simulator - Available commands:"
	@echo ""
	@echo "  make install  - Install npm dependencies"
	@echo "  make dev      - Run development server (web browser)"
	@echo "  make electron - Run as Electron desktop app"
	@echo "  make build    - Build for production"
	@echo "  make clean    - Remove build artifacts and node_modules"
	@echo "  make start    - Install dependencies and run dev server"
	@echo "  make run      - Alias for 'make dev'"
	@echo ""
	@echo "Quick start: make start"

