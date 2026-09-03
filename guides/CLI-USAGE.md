# Forge

Forge is a desktop application. All functionality is accessed through the Electron desktop UI.

## Getting Started

1. Download an artifact for a verified platform from the [Releases page](https://github.com/j-tide/Forge/releases)
2. Install and launch the application
3. Open your project (a git repository folder)
4. Configure an available provider using its legitimate authentication method in Settings
5. Create a task, review its configuration, and explicitly start it when ready

## Running the App from Source

```bash
# Install dependencies
npm run install:all

# Development mode (hot reload)
npm run dev

# Production build + run
npm start
```

## Configuration

All configuration is done through the app's Settings UI. You can:

- Connect Claude accounts (OAuth or API key)
- Configure multiple provider profiles (Anthropic, OpenAI, Google, etc.)
- Configure the project memory provider
- Set default models and thinking budgets
- Configure Linear/GitHub/GitLab integrations
