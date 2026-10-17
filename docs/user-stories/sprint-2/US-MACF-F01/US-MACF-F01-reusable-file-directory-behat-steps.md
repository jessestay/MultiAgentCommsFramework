# US-MACF-F01: Create Reusable Behat Steps for Common File and Directory Operations

As a Test Automation Engineer (part of SET)
I want a set of reusable Behat step definitions for common file and directory operations (create, read, update, delete, check existence, check permissions, check emptiness) within the MACF project context
So that I can write Behat scenarios more efficiently, reduce code duplication in context files, and ensure consistent verification of file system states across different MACF project tests.

## Business Value
This user story will significantly improve the efficiency and maintainability of Behat tests within the MACF project by providing a standardized library of steps for common file system interactions. This reduces boilerplate code in individual feature context files and promotes consistency.

## Acceptance Criteria
1.  **AC1**: Define Behat steps for checking if a file exists or does not exist at a given path.
    *   `Given the file ".cursor/rules/001-core-protocol.mdc" exists`
    *   `Then the file ".cursor/rules/001-core-protocol.mdc" should exist`
    *   `Given the file ".cursor/temp/non_existent_file.txt" does not exist` (ensure this by attempting deletion if necessary in a setup step)
    *   `Then the file ".cursor/temp/non_existent_file.txt" should not exist`
    *   `Given a file named ".cursor/temp/file with spaces.txt" exists`
    *   `Then the file ".cursor/temp/file with spaces.txt" should exist`

2.  **AC2**: Define Behat steps for checking if a directory exists or does not exist at a given path.
    *   `Given the directory ".cursor/docs" exists`
    *   `Then the directory ".cursor/docs" should exist`
    *   `Given the directory ".cursor/temp/non_existent_dir/" does not exist` (ensure this by attempting deletion if necessary)
    *   `Then the directory ".cursor/temp/non_existent_dir/" should not exist`

3.  **AC3**: Define Behat steps for reading the content of a file (storing it for subsequent checks).
    *   `Given the file ".cursor/temp/read_test_file.txt" with content "Hello Behat World"` (create this file in a background step)
    *   `When I read the content of the file ".cursor/temp/read_test_file.txt"`
    *   `Then the stored content should be "Hello Behat World"`
    *   `When I attempt to read the content of a non-existent file ".cursor/temp/ghost_file.txt"`
    *   `Then an error should occur because the file does not exist` (Context should handle this gracefully and allow an assertion)

4.  **AC4**: Define Behat steps for verifying the last read file content includes, does not include, matches exactly, or does not match exactly specific text.
    *   `Given I have read the content of a file containing "Expected text here and other details"`
    *   `Then the file content should include "Expected text here"`
    *   `And the file content should not include "Unexpected nonsense"`
    *   `Given I have read the content of a file that is exactly "Exact Match Content"`
    *   `Then the file content should be exactly "Exact Match Content"`
    *   `And the file content should not be exactly "Almost Exact Match Content"`

5.  **AC5**: Define Behat steps for verifying a directory is empty.
    *   `Given I create an empty directory ".cursor/temp/an_empty_directory"`
    *   `Then the directory ".cursor/temp/an_empty_directory" should be empty`

6.  **AC6**: Define Behat steps for verifying a directory is not empty.
    *   `Given the directory ".cursor/rules" exists and is not empty`
    *   `Then the directory ".cursor/rules" should not be empty`

7.  **AC7**: Define Behat steps for creating a new empty file, or creating a file with specified content.
    *   `When I create an empty file at ".cursor/temp/new_empty_file.txt"`
    *   `Then the file ".cursor/temp/new_empty_file.txt" should exist`
    *   `When I read the content of the file ".cursor/temp/new_empty_file.txt"`
    *   `Then the file content should be empty` (or exactly `""`)
    *   `When I create a file at ".cursor/temp/new_file_with_content.txt" with content "Initial content."`
    *   `Then the file ".cursor/temp/new_file_with_content.txt" should exist`
    *   `When I read the content of the file ".cursor/temp/new_file_with_content.txt"`
    *   `Then the file content should be "Initial content."`
    *   `When I create a file at ".cursor/temp/existing_file_to_overwrite.txt" with content "Original"` (create in background)
    *   `And I create a file at ".cursor/temp/existing_file_to_overwrite.txt" with content "New Content"` (This step should overwrite)
    *   `When I read the content of the file ".cursor/temp/existing_file_to_overwrite.txt"`
    *   `Then the file content should be "New Content"`

8.  **AC8**: Define Behat steps for creating a new directory.
    *   `When I create a directory at ".cursor/temp/new_test_directory_f01"`
    *   `Then the directory ".cursor/temp/new_test_directory_f01" should exist`
    *   `When I attempt to create a directory that already exists ".cursor/temp/new_test_directory_f01"`
    *   `Then no error should occur and the directory ".cursor/temp/new_test_directory_f01" should still exist` (or step fails if it should error, TBD by implementation preference)

9.  **AC9**: Define Behat steps for deleting a file.
    *   `Given I create an empty file at ".cursor/temp/file_to_delete.txt"`
    *   `When I delete the file ".cursor/temp/file_to_delete.txt"`
    *   `Then the file ".cursor/temp/file_to_delete.txt" should not exist`
    *   `When I attempt to delete a non-existent file ".cursor/temp/ghost_to_delete.txt"`
    *   `Then no error should occur` (or step should indicate failure/warning, TBD)

10. **AC10**: Define Behat steps for deleting a directory (recursively or non-recursively).
    *   `Given I create an empty directory ".cursor/temp/dir_to_delete_empty"`
    *   `When I delete the directory ".cursor/temp/dir_to_delete_empty"`
    *   `Then the directory ".cursor/temp/dir_to_delete_empty" should not exist`
    *   `Given I create a directory ".cursor/temp/dir_with_file_to_delete"`
    *   `And I create an empty file at ".cursor/temp/dir_with_file_to_delete/somefile.txt"`
    *   `When I attempt to delete the directory ".cursor/temp/dir_with_file_to_delete" non-recursively`
    *   `Then an error should occur because the directory is not empty`
    *   `When I recursively delete the directory ".cursor/temp/dir_with_file_to_delete"`
    *   `Then the directory ".cursor/temp/dir_with_file_to_delete" should not exist`

11. **AC11 (Permissions)**: Define Behat steps for checking file/directory permissions (readability, writability, executability).
    *   `Given the file ".cursor/temp/readable_file.txt" is readable` (Requires setup to ensure this. May involve `chmod` if context has permissions)
    *   `Then the file ".cursor/temp/readable_file.txt" should be readable`
    *   `Given the file ".cursor/temp/writable_file.txt" is writable`
    *   `Then the file ".cursor/temp/writable_file.txt" should be writable`
    *   `Given the file ".cursor/temp/executable_file.sh" is executable`
    *   `Then the file ".cursor/temp/executable_file.sh" should be executable`
    *   `Given the file ".cursor/temp/non_writable_file.txt" is not writable` (e.g., `chmod a-w`)
    *   `Then the file ".cursor/temp/non_writable_file.txt" should not be writable`
    *   *(Similar steps for directories)*

12. **AC12**: All new step definitions MUST be added to `AutomaticJesse\Cursor\Tests\Behat\Context\CursorProjectContext`, be well-documented with PHPDoc, and follow existing coding standards. Use `webmozart/assert` for assertions.

13. **AC13**: Create a Behat feature file (`.cursor/tests/features/US-MACF-F01/file_directory_operations.feature`) demonstrating the usage of all new step definitions with various scenarios, including positive and negative cases, and handling of paths like `.cursor/some/path`. Use `@US-MACF-F01` tag.

## Technical Notes
-   These steps should operate relative to the MACF project root (which is `.cursor/` within the `AustinShows` workspace, but Behat tests will likely run from `AustinShows/` so paths need to be like `.cursor/some/path`).
-   Error handling: Steps should throw appropriate exceptions if operations fail unexpectedly (e.g., trying to read a non-existent file if the step implies it should exist).
-   Consider using a library like `webmozart/assert` for assertions within the step definitions if not already in use.
-   Focus on platform-agnostic operations where possible (e.g., using `DIRECTORY_SEPARATOR`).

## Tasks
1.  [ ] SET: Refine Acceptance Criteria, especially for AC11 (permissions).
2.  [ ] SET: Design and implement the Behat step definitions in the chosen context class(es).
3.  [ ] SET: Ensure all new methods are documented with PHPDoc.
4.  [ ] SET: Create the `file_directory_operations.feature` file with comprehensive scenarios.
5.  [ ] SET: Run Behat tests to verify all new steps and scenarios pass.
6.  [ ] CTW: Review documentation (PHPDoc in context, feature file clarity).
7.  [ ] ES: Update Sprint 2 status in `.cursor/docs/sprint-status.md`.

## Definition of Done
1.  All acceptance criteria (AC1-AC13) are met and verified.
2.  All specified Behat step definitions are implemented and functional.
3.  The `file_directory_operations.feature` file exists and its scenarios pass when run with Behat.
4.  Code (context class) is documented and adheres to standards.
5.  The solution is integrated into the existing `CursorProjectContext.php` or a new, logically structured context file. 