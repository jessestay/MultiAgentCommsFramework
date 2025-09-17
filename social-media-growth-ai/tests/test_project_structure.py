import os
import pytest
from pathlib import Path

@pytest.fixture
def project_root():
    """Return the project root directory."""
    return Path(__file__).parent.parent

def test_directory_structure(project_root):
    """Test that all required directories exist."""
    required_dirs = ['src', 'tests', 'docs', 'config']
    for dir_name in required_dirs:
        assert (project_root / dir_name).is_dir(), f"Directory {dir_name} not found"

def test_required_files(project_root):
    """Test that all required files exist."""
    required_files = [
        'README.md',
        'requirements.txt',
        'LICENSE',
        'docs/USER_STORIES.md',
        'docs/CONTRIBUTING.md'
    ]
    for file_path in required_files:
        assert (project_root / file_path).is_file(), f"File {file_path} not found"

def test_gitignore(project_root):
    """Test that .gitignore exists and contains common entries."""
    gitignore_path = project_root / '.gitignore'
    assert gitignore_path.is_file(), ".gitignore not found"
    
    required_ignores = [
        '__pycache__',
        '*.pyc',
        '.env',
        'venv/',
        '.pytest_cache/',
        '*.egg-info/'
    ]
    
    content = gitignore_path.read_text()
    for entry in required_ignores:
        assert entry in content, f"Missing {entry} in .gitignore"

def test_readme_content(project_root):
    """Test that README.md contains required sections."""
    readme_path = project_root / 'README.md'
    content = readme_path.read_text()
    
    required_sections = [
        '# Facebook Growth AI',
        '## Project Overview',
        '## Development Setup',
        '## Project Structure'
    ]
    
    for section in required_sections:
        assert section in content, f"Missing section {section} in README.md"

def test_file_permissions(project_root):
    """Test that files have correct permissions."""
    for path in project_root.rglob('*'):
        if path.is_file():
            # Check that file is readable
            assert os.access(path, os.R_OK), f"File {path} is not readable"
            # If it's a Python file, check that it's executable
            if path.suffix == '.py':
                assert os.access(path, os.X_OK), f"Python file {path} is not executable" 