# Contributing to Multi-agent Communications Framework

Thank you for your interest in contributing to the Multi-agent Communications Framework! This document outlines our contribution process, Agile workflow, role responsibilities, and coding standards.

## Table of Contents

- [Agile Development Process](#agile-development-process)
- [Role Responsibilities](#role-responsibilities)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Pull Request Process](#pull-request-process)
- [Communication Guidelines](#communication-guidelines)

## Agile Development Process

We follow a 2-week sprint cycle with the following ceremonies:

### Sprint Planning
- Occurs at the beginning of each sprint
- User stories are selected from the backlog
- Story points are estimated
- Tasks are assigned to roles
- Sprint goals are established

### Daily Stand-ups
- Asynchronous updates using pull request comments
- Each contributor shares:
  - What they accomplished yesterday
  - What they plan to do today
  - Any blockers they're facing

### Sprint Review
- Occurs at the end of each sprint
- Completed features are demonstrated
- Feedback is collected
- Product backlog is updated

### Sprint Retrospective
- Follows the Sprint Review
- Team discusses what went well
- Areas for improvement are identified
- Action items are created for the next sprint

## Role Responsibilities

Each contributor should focus on their role-specific responsibilities:

### Executive Secretary (ES)
- Coordinate sprint planning and retrospectives
- Maintain the product backlog
- Track sprint progress
- Remove impediments
- Ensure process adherence

### Software Engineering Team (SET)
- Implement technical solutions
- Write automated tests
- Review code
- Maintain technical documentation
- Ensure code quality and performance

### Copy/Technical Writer (CTW)
- Create user and developer documentation
- Review technical writing for clarity
- Maintain style guides
- Support demo preparation
- Ensure consistent terminology

### Designer (DES)
- Create visual designs and UI components
- Ensure accessibility compliance
- Maintain design consistency
- Validate user experience
- Create visual assets

### Dating and Relationship Coach (DRC)
- Provide relationship guidance features
- Ensure communication clarity
- Support personal growth features
- Review user interaction patterns

## Getting Started

1. **Fork the Repository**
   ```bash
   git clone https://github.com/YOUR-USERNAME/multiagent-communications-framework.git
   cd multiagent-communications-framework
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Development Environment**
   See [development-setup.md](./development-setup.md) for detailed instructions.

4. **Find an Issue to Work On**
   - Check [open issues](https://github.com/automaticjesse/multiagent-communications-framework/issues)
   - Issues labeled "good first issue" are ideal for newcomers

## Development Workflow

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
   
   Follow the branch naming convention:
   - `feature/` - for new features
   - `bugfix/` - for bug fixes
   - `docs/` - for documentation changes
   - `refactor/` - for code refactoring
   - `test/` - for adding or modifying tests

2. **User Story Format**
   
   All features should be based on a user story following the format:
   ```
   US-EXT-XX: Short description
   
   As a [user type]
   I want [capability]
   So that [benefit]
   
   Acceptance Criteria:
   1. [Criterion 1]
   2. [Criterion 2]
   ...
   ```

3. **Test-Driven Development**
   - Write tests before implementing features
   - Ensure tests cover acceptance criteria
   - Run tests frequently

4. **Regular Commits**
   - Make small, focused commits
   - Include the user story ID in commit messages
   - Example: `git commit -m "US-EXT-01: Implement role activation"`

5. **Documentation**
   - Update documentation alongside code changes
   - Document public APIs with JSDoc comments
   - Update README if necessary

6. **Code Review**
   - Request review from at least one team member
   - Address all review comments
   - Ensure tests pass before requesting review

## Coding Standards

### TypeScript Guidelines

- Use strict typing (avoid `any` types when possible)
- Follow interface naming convention with `I` prefix (e.g., `IRole`)
- Use private class members with leading underscore (e.g., `private _roleManager`)
- Document public APIs with JSDoc comments
- Use async/await for asynchronous operations

### Code Formatting

- Use 2 spaces for indentation
- Use single quotes for strings
- End statements with semicolons
- Use trailing commas in multi-line arrays and objects
- Limit line length to 100 characters

### Testing Standards

- Maintain test coverage above 80%
- Use descriptive test names that explain expected behavior
- Follow the "Arrange-Act-Assert" pattern
- Mock external dependencies
- Test error cases as well as happy paths

### File Organization

- One class/interface per file (with exceptions for related interfaces)
- Group related files in appropriate directories
- Use barrel exports (index.ts) for public APIs
- Follow the directory structure outlined in [directory-structure.md](./directory-structure.md)

## Pull Request Process

1. **Create Pull Request**
   - Use the PR template
   - Reference related issues
   - Describe changes and their purpose
   - List manual testing performed

2. **PR Title Format**
   - Include user story ID
   - Brief description of changes
   - Example: `US-EXT-01: Implement role management system`

3. **PR Description**
   - What does this PR do?
   - How should reviewers test it?
   - Any background context?
   - Screenshots (if UI changes)

4. **CI Checks**
   - Ensure all automated tests pass
   - Address any linting issues
   - Maintain code coverage thresholds

5. **Review Process**
   - At least one approval is required
   - Address all comments
   - Resolve conversations

6. **Merging**
   - Squash and merge to maintain clean history
   - Update the user story status
   - Delete the branch after merging

## Communication Guidelines

### Role-based Communication

When discussing changes, use the role-addressing syntax to indicate perspectives:

```
@ES: This feature needs more refinement before implementation.
@SET: The current implementation might have performance issues.
@CTW: The documentation needs to be updated to reflect these changes.
@DES: The UI component needs accessibility improvements.
```

### Issue Discussions

- Be respectful and constructive
- Focus on the code, not the person
- Provide context and reasoning
- Include examples when possible

### Sprint Ceremonies

- Attend all sprint ceremonies
- Come prepared with updates
- Actively participate in discussions
- Be open to feedback and suggestions

Thank you for contributing to the Multi-agent Communications Framework! Together, we can build an exceptional tool for AI-assisted development. 