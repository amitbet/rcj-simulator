.PHONY: install dev build clean electron debug debug-web debug-physics trace-server help

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

# Strategy trace server only
trace-server:
	TRACE_PORT=8787 TRACE_FILE=logs/strategy-trace.jsonl npm run trace:server

# Full debug mode (Electron + trace capture)
debug: install
	VITE_STRATEGY_TRACE=1 VITE_TRACE_URL=http://127.0.0.1:8787/trace TRACE_PORT=8787 TRACE_FILE=logs/strategy-trace.jsonl npm run debug:electron

# Web debug mode (browser + trace capture)
debug-web: install
	VITE_STRATEGY_TRACE=1 VITE_TRACE_URL=http://127.0.0.1:8787/trace TRACE_PORT=8787 TRACE_FILE=logs/strategy-trace.jsonl npm run debug:dev

# Debug mode with physics observations as default strategy input
debug-physics: install
	VITE_STRATEGY_TRACE=1 VITE_TRACE_URL=http://127.0.0.1:8787/trace VITE_USE_CAMERA_DATA=0 TRACE_PORT=8787 TRACE_FILE=logs/strategy-trace.jsonl npm run debug:electron

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
	@echo "  make trace-server - Run trace capture server"
	@echo "  make debug    - Run Electron + trace capture (logs/strategy-trace.jsonl)"
	@echo "  make debug-web - Run web dev + trace capture (logs/strategy-trace.jsonl)"
	@echo "  make debug-physics - Run Electron debug with physics data default"
	@echo "  make build    - Build for production"
	@echo "  make clean    - Remove build artifacts and node_modules"
	@echo "  make start    - Install dependencies and run dev server"
	@echo "  make run      - Alias for 'make dev'"
	@echo ""
	@echo "Quick start: make start"
