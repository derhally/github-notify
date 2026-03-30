# Install npm dependencies
install:
    npm ci

# Build the Swift mic-detector binary (macOS only)
build-swift:
    cd swift-mic-detector && swift build -c release

# Run the app locally in development mode
dev: install
    npm start

# Run the app locally on macOS (builds Swift binary first)
[macos]
dev-mac: install build-swift
    npm start

# Build distributables for the current platform
[macos]
make: install build-swift
    npm run make

[windows]
make: install
    npm run make

# Build, install to /Applications, and unquarantine (macOS only)
[macos]
deploy: make
    @echo "Installing to /Applications..."
    rm -rf /Applications/GitHubNotify.app
    cp -R out/GitHubNotify-darwin-arm64/GitHubNotify.app /Applications/
    xattr -cr /Applications/GitHubNotify.app
    @echo "Installed and unquarantined."

# Remove quarantine attribute from installed app (macOS only)
[macos]
unquarantine:
    xattr -cr /Applications/GitHubNotify.app

# Run TypeScript type checking
check:
    npx tsc --noEmit

# Run linting
lint:
    npm run lint
