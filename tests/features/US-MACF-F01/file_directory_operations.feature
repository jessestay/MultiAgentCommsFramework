@US-MACF-F01
Feature: File and Directory Operations
  As a Test Automation Engineer
  I want to use reusable Behat steps for common file and directory operations
  So that I can efficiently test file system interactions within the MACF project.

  Background:
    Given I create an empty directory ".cursor/temp"
    # Ensuring a clean temp directory for some tests.
    # Some scenarios might re-create or expect specific states within .cursor/temp.

  Scenario: AC1 - Check File Existence
    Given a file named ".cursor/temp/ac1_existing_file.txt" exists
    Then the file ".cursor/temp/ac1_existing_file.txt" should exist
    Given the file ".cursor/temp/ac1_non_existent_file.txt" does not exist
    Then the file ".cursor/temp/ac1_non_existent_file.txt" should not exist
    Given a file named ".cursor/temp/file with spaces in name.txt" exists
    Then the file ".cursor/temp/file with spaces in name.txt" should exist

  Scenario: AC2 - Check Directory Existence
    Given the directory ".cursor/docs" exists
    Then the directory ".cursor/docs" should exist
    Given I create an empty directory ".cursor/temp/ac2_test_dir_exists"
    Then the directory ".cursor/temp/ac2_test_dir_exists" should exist
    Given the directory ".cursor/temp/ac2_non_existent_dir" does not exist
    Then the directory ".cursor/temp/ac2_non_existent_dir" should not exist

  Scenario: AC3 & AC4 - Read File Content and Verify
    Given the file ".cursor/temp/ac3_read_test.txt" with content "Hello Behat World for AC3!"
    When I read the content of the file ".cursor/temp/ac3_read_test.txt"
    Then the file content should be "Hello Behat World for AC3!"
    And the file content should include "Behat World"
    And the file content should not include "Goodbye"
    And the file content should not be exactly "Hello Behat World"

    When I attempt to read the content of a non-existent file ".cursor/temp/ac3_ghost_file.txt"
    Then an error should occur because the file does not exist

    Given I have read the content of a file containing "Some important details"
    Then the file content should include "important details"
    Given I have read the content of a file that is exactly "Exact Match Content Only"
    Then the file content should be exactly "Exact Match Content Only"

  Scenario: AC5 - Verify Directory is Empty
    Given I create an empty directory ".cursor/temp/ac5_empty_dir"
    Then the directory ".cursor/temp/ac5_empty_dir" should be empty

  Scenario: AC6 - Verify Directory is Not Empty
    Given the directory ".cursor/rules" exists and is not empty
    Then the directory ".cursor/rules" should not be empty
    Given I create a directory at ".cursor/temp/ac6_not_empty_dir"
    And I create an empty file at ".cursor/temp/ac6_not_empty_dir/marker.txt"
    Then the directory ".cursor/temp/ac6_not_empty_dir" should not be empty

  Scenario: AC7 - Create Files (Empty and With Content, Overwrite)
    When I create an empty file at ".cursor/temp/ac7_new_empty.txt"
    Then the file ".cursor/temp/ac7_new_empty.txt" should exist
    When I read the content of the file ".cursor/temp/ac7_new_empty.txt"
    Then the file content should be empty

    When I create a file at ".cursor/temp/ac7_new_with_content.txt" with content "Initial Content for AC7."
    Then the file ".cursor/temp/ac7_new_with_content.txt" should exist
    When I read the content of the file ".cursor/temp/ac7_new_with_content.txt"
    Then the file content should be "Initial Content for AC7."

    Given a file named ".cursor/temp/ac7_overwrite_me.txt" exists
    And I create a file at ".cursor/temp/ac7_overwrite_me.txt" with content "Original"
    When I create a file at ".cursor/temp/ac7_overwrite_me.txt" with content "New Content Overwritten"
    When I read the content of the file ".cursor/temp/ac7_overwrite_me.txt"
    Then the file content should be "New Content Overwritten"

  Scenario: AC8 - Create Directory (New and Existing)
    When I create a directory at ".cursor/temp/ac8_new_dir"
    Then the directory ".cursor/temp/ac8_new_dir" should exist
    When I attempt to create a directory that already exists ".cursor/temp/ac8_new_dir"
    Then no error should occur and the directory ".cursor/temp/ac8_new_dir" should still exist

  Scenario: AC9 - Delete File (Existing and Non-Existing)
    Given a file named ".cursor/temp/ac9_file_to_delete.txt" exists
    And I create an empty file at ".cursor/temp/ac9_file_to_delete.txt"
    Then the file ".cursor/temp/ac9_file_to_delete.txt" should exist
    When I delete the file ".cursor/temp/ac9_file_to_delete.txt"
    Then the file ".cursor/temp/ac9_file_to_delete.txt" should not exist

    When I attempt to delete a non-existent file ".cursor/temp/ac9_ghost_to_delete.txt"
    Then no error should occur
    And the file ".cursor/temp/ac9_ghost_to_delete.txt" should not exist

  Scenario: AC10 - Delete Directory (Empty, Non-Empty Non-Recursive Attempt, Recursive)
    Given I create an empty directory ".cursor/temp/ac10_empty_dir_to_delete"
    Then the directory ".cursor/temp/ac10_empty_dir_to_delete" should exist
    When I delete the directory ".cursor/temp/ac10_empty_dir_to_delete"
    Then the directory ".cursor/temp/ac10_empty_dir_to_delete" should not exist

    Given I create a directory at ".cursor/temp/ac10_non_empty_dir"
    And I create an empty file at ".cursor/temp/ac10_non_empty_dir/somefile.txt"
    When I attempt to delete the directory ".cursor/temp/ac10_non_empty_dir" non-recursively
    Then an error should occur because the directory is not empty
    And the directory ".cursor/temp/ac10_non_empty_dir" should exist

    When I recursively delete the directory ".cursor/temp/ac10_non_empty_dir"
    Then the directory ".cursor/temp/ac10_non_empty_dir" should not exist

  Scenario: AC11 - Check File Permissions (Illustrative - actual permissions depend on environment)
    # These steps assume the environment allows these states to be set/checked.
    # For "Given" steps, manual setup or more advanced context methods might be needed to ensure permissions.
    Given a file named ".cursor/temp/ac11_readable.txt" exists
    # Assume ac11_readable.txt is made readable by default or external setup
    Then the file ".cursor/temp/ac11_readable.txt" should be readable

    Given a file named ".cursor/temp/ac11_writable.txt" exists
    # Assume ac11_writable.txt is made writable by default or external setup
    Then the file ".cursor/temp/ac11_writable.txt" should be writable
    
    # True executability checks are highly OS and setup dependent.
    # Given a file named ".cursor/temp/ac11_executable.sh" exists 
    # And I create a file at ".cursor/temp/ac11_executable.sh" with content "#!/bin/bash\necho hello"
    # Then the file ".cursor/temp/ac11_executable.sh" should be executable

  Scenario: AC11 - Check Directory Permissions (Illustrative)
    Given I create an empty directory ".cursor/temp/ac11_readable_dir"
    Then the directory ".cursor/temp/ac11_readable_dir" should be readable

    Given I create an empty directory ".cursor/temp/ac11_writable_dir"
    Then the directory ".cursor/temp/ac11_writable_dir" should be writable

    # Given I create an empty directory ".cursor/temp/ac11_executable_dir"
    # Then the directory ".cursor/temp/ac11_executable_dir" should be executable # Traversable 