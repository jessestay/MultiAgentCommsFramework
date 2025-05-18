@US-MACF-F01
Feature: Basic File and Directory Operations
  As a Test Automation Engineer
  I want to use reusable Behat steps for common file and directory operations
  So that I can efficiently test functionalities involving the file system within the MACF project.

  Background:
    Given I ensure the directory ".cursor/temp/" exists and is empty

  Scenario: AC1 - Check if a file exists or does not exist
    Given the file ".cursor/rules/001-core-protocol.mdc" exists
    Then the file ".cursor/rules/001-core-protocol.mdc" should exist
    Given the file ".cursor/temp/non_existent_file.txt" does not exist
    Then the file ".cursor/temp/non_existent_file.txt" should not exist
    Given I create an empty file at ".cursor/temp/file with spaces.txt"
    Then a file named ".cursor/temp/file with spaces.txt" should exist
    Given I delete the file ".cursor/temp/file with spaces.txt"
    Then a file named ".cursor/temp/file with spaces.txt" should not exist

  Scenario: AC2 - Check if a directory exists or does not exist
    Given the directory ".cursor/docs" exists
    Then the directory ".cursor/docs" should exist
    Given the directory ".cursor/temp/non_existent_dir/" does not exist
    Then the directory ".cursor/temp/non_existent_dir/" should not exist

  Scenario: AC3 - Read file content and handle non-existent file
    Given I create a file at ".cursor/temp/read_test_file.txt" with content "Hello Behat World"
    When I read the content of the file ".cursor/temp/read_test_file.txt"
    Then the stored content should be "Hello Behat World"
    When I attempt to read the content of a non-existent file ".cursor/temp/ghost_file.txt"
    Then an error should occur because the file does not exist

  Scenario: AC4 - Verify file content variations
    Given I create a file at ".cursor/temp/content_check_file.txt" with content "Expected text here and other details"
    When I read the content of the file ".cursor/temp/content_check_file.txt"
    Then the file content should include "Expected text here"
    And the file content should not include "Unexpected nonsense"
    Given I create a file at ".cursor/temp/exact_content_file.txt" with content "Exact Match Content"
    When I read the content of the file ".cursor/temp/exact_content_file.txt"
    Then the file content should be exactly "Exact Match Content"
    And the file content should not be exactly "Almost Exact Match Content"

  Scenario: AC5 & AC6 - Verify directory emptiness
    Given I create an empty directory ".cursor/temp/an_empty_directory"
    Then the directory ".cursor/temp/an_empty_directory" should be empty
    Given the directory ".cursor/rules" exists
    Then the directory ".cursor/rules" should not be empty

  Scenario: AC7 - Create empty file and file with content (including overwrite)
    When I create an empty file at ".cursor/temp/new_empty_file.txt"
    Then the file ".cursor/temp/new_empty_file.txt" should exist
    When I read the content of the file ".cursor/temp/new_empty_file.txt"
    Then the file content should be empty
    When I create a file at ".cursor/temp/new_file_with_content.txt" with content "Initial content."
    Then the file ".cursor/temp/new_file_with_content.txt" should exist
    When I read the content of the file ".cursor/temp/new_file_with_content.txt"
    Then the file content should be "Initial content."
    Given I create a file at ".cursor/temp/existing_file_to_overwrite.txt" with content "Original"
    When I create a file at ".cursor/temp/existing_file_to_overwrite.txt" with content "New Content"
    Then the file ".cursor/temp/existing_file_to_overwrite.txt" should exist
    When I read the content of the file ".cursor/temp/existing_file_to_overwrite.txt"
    Then the file content should be "New Content"

  Scenario: AC8 - Create new directory and handle existing directory
    When I create a directory at ".cursor/temp/new_test_directory_f01"
    Then the directory ".cursor/temp/new_test_directory_f01" should exist
    When I attempt to create a directory that already exists ".cursor/temp/new_test_directory_f01"
    Then no error should occur and the directory ".cursor/temp/new_test_directory_f01" should still exist

  Scenario: AC9 - Delete file and handle non-existent file
    Given I create an empty file at ".cursor/temp/file_to_delete.txt"
    Then the file ".cursor/temp/file_to_delete.txt" should exist
    When I delete the file ".cursor/temp/file_to_delete.txt"
    Then the file ".cursor/temp/file_to_delete.txt" should not exist
    When I attempt to delete a non-existent file ".cursor/temp/ghost_to_delete.txt"
    Then no error should occur

  Scenario: AC10 - Delete directory (empty, non-empty non-recursively, non-empty recursively)
    Given I create an empty directory ".cursor/temp/dir_to_delete_empty"
    Then the directory ".cursor/temp/dir_to_delete_empty" should exist
    When I delete the directory ".cursor/temp/dir_to_delete_empty"
    Then the directory ".cursor/temp/dir_to_delete_empty" should not exist

    Given I create a directory at ".cursor/temp/dir_with_file_to_delete"
    And I create an empty file at ".cursor/temp/dir_with_file_to_delete/somefile.txt"
    When I attempt to delete the directory ".cursor/temp/dir_with_file_to_delete" non-recursively
    Then an error should occur because the directory is not empty
    Then the directory ".cursor/temp/dir_with_file_to_delete" should exist
    When I recursively delete the directory ".cursor/temp/dir_with_file_to_delete"
    Then the directory ".cursor/temp/dir_with_file_to_delete" should not exist

  Scenario: AC11 - Check file permissions (readable, writable, executable)
    Given I create a file at ".cursor/temp/perm_check_file.txt" with content "permissions test"
    And I make the file ".cursor/temp/perm_check_file.txt" readable
    Then the file ".cursor/temp/perm_check_file.txt" should be readable
    And I make the file ".cursor/temp/perm_check_file.txt" writable
    Then the file ".cursor/temp/perm_check_file.txt" should be writable
    # Executable check might be more involved, assuming a simple text file for now
    # And I make the file ".cursor/temp/perm_check_file.txt" executable 
    # Then the file ".cursor/temp/perm_check_file.txt" should be executable

    Given I make the file ".cursor/temp/perm_check_file.txt" not writable
    Then the file ".cursor/temp/perm_check_file.txt" should not be writable
    And I make the file ".cursor/temp/perm_check_file.txt" not readable
    Then the file ".cursor/temp/perm_check_file.txt" should not be readable

  Scenario: AC11 - Check directory permissions (readable, writable)
    Given I create a directory at ".cursor/temp/perm_check_dir"
    And I make the directory ".cursor/temp/perm_check_dir" readable
    Then the directory ".cursor/temp/perm_check_dir" should be readable
    And I make the directory ".cursor/temp/perm_check_dir" writable
    Then the directory ".cursor/temp/perm_check_dir" should be writable
    
    Given I make the directory ".cursor/temp/perm_check_dir" not writable
    Then the directory ".cursor/temp/perm_check_dir" should not be writable
    Given I make the directory ".cursor/temp/perm_check_dir" not readable
    Then the directory ".cursor/temp/perm_check_dir" should not be readable 