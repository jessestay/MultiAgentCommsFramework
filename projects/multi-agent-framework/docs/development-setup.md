# Development Setup

This document provides instructions for setting up your development environment to work on the Multi-agent Communications Framework extension.

## Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v14.x or higher)
- [npm](https://www.npmjs.com/) (v7.x or higher)
- [Visual Studio Code](https://code.visualstudio.com/) (v1.60.0 or higher)
- [Git](https://git-scm.com/) (v2.30.0 or higher)

## Setup Steps

1. **Clone the Repository**

```bash
git clone https://github.com/automaticjesse/multiagent-communications-framework.git
cd multiagent-communications-framework
```

2. **Install Dependencies**

```bash
npm install
```

3. **Configure VSCode**

Install the recommended extensions:

- ESLint
- Prettier
- TypeScript Extension Pack
- Jest Runner

4. **Build the Extension**

```bash
npm run compile
```

5. **Run Tests**

```bash
npm test
```

## Development Workflow

### Running the Extension

To run the extension in development mode:

1. Open the project in VSCode
2. Press `F5` to start debugging
3. A new VSCode instance will open with the extension loaded

### Making Changes

1. Edit source files in the `src` directory
2. Run `npm run compile` to build or use the watch mode with `npm run watch`
3. Reload the VSCode window to see your changes (`Ctrl+R` or `Cmd+R`)

### Running Tests

- Run all tests: `npm test`
- Run specific tests: `npm test -- -t "test name"`
- Run tests in watch mode: `npm run test:watch`

### Linting

- Lint the codebase: `npm run lint`
- Fix linting issues: `npm run lint -- --fix`

## Project Structure

The project follows the directory structure outlined in [directory-structure.md](./directory-structure.md).

## Coding Standards

### TypeScript Guidelines

- Use strict typing (avoid `any` types when possible)
- Follow the interface naming convention with `I` prefix (e.g., `IRole`)
- Use private class members with leading underscore (e.g., `private _roleManager`)
- Document public APIs with JSDoc comments

### Testing Guidelines

- Write unit tests for all new functionality
- Maintain test coverage above 80%
- Use descriptive test names that explain expected behavior
- Follow the "Arrange-Act-Assert" pattern

### Git Workflow

1. Create a feature branch from `main`
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit with descriptive messages
   ```bash
   git commit -m "US-EXT-XX: Brief description of changes"
   ```

3. Push your branch and create a pull request
   ```bash
   git push -u origin feature/your-feature-name
   ```

4. Ensure tests pass and review requirements are met
5. Request review from team members
6. Merge to `main` once approved

## Debugging Tips

### Extension Debugging

- Use `console.log` statements for quick debugging (remove before committing)
- Utilize the VSCode debugger for step-through debugging
- Check the Output panel (`Ctrl+Shift+U` or `Cmd+Shift+U`) and select "Extension Host" for logs

### Common Issues

1. **Extension not loading**
   - Check for syntax errors in your code
   - Verify extension manifest (package.json) is correctly formatted
   - Check console output for activation errors

2. **Command not working**
   - Verify command is registered in package.json
   - Check console for command registration errors
   - Verify command handler is implemented correctly

3. **TypeScript errors**
   - Run `npm run compile` to see detailed errors
   - Check for missing or incorrect type definitions
   - Verify import paths are correct

## Additional Resources

- [VSCode Extension API Documentation](https://code.visualstudio.com/api)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [ESLint Documentation](https://eslint.org/docs/user-guide/getting-started) 