import os
import subprocess
import pytest
from pathlib import Path
import venv
import json

@pytest.fixture
def project_root():
    """Return the project root directory."""
    return Path(__file__).parent.parent

def test_venv_setup(project_root, tmp_path):
    """Test virtual environment creation."""
    # Create a temporary venv for testing
    venv_path = tmp_path / "test_venv"
    venv.create(venv_path, with_pip=True)
    
    # Verify venv structure
    assert (venv_path / "Scripts").exists()  # Windows
    assert (venv_path / "pyvenv.cfg").exists()

def test_dependencies(project_root):
    """Test that all required packages can be installed."""
    requirements_file = project_root / "requirements.txt"
    assert requirements_file.exists(), "requirements.txt not found"
    
    # Read requirements file
    with open(requirements_file) as f:
        requirements = f.read()
    
    # Check core dependencies are present
    required_packages = [
        "langchain",
        "python-dotenv",
        "pytest",
        "black",
        "flake8"
    ]
    
    for package in required_packages:
        assert package in requirements, f"Missing required package: {package}"

def test_env_config(project_root):
    """Test environment variables configuration."""
    env_example = project_root / ".env.example"
    assert env_example.exists(), ".env.example not found"
    
    # Check required environment variables are documented
    required_vars = [
        "FACEBOOK_APP_ID",
        "FACEBOOK_APP_SECRET",
        "FACEBOOK_ACCESS_TOKEN"
    ]
    
    env_content = env_example.read_text()
    for var in required_vars:
        assert var in env_content, f"Missing environment variable: {var}"

def test_dev_server(project_root):
    """Test development server configuration."""
    server_file = project_root / "src" / "server.py"
    assert server_file.exists(), "Development server file not found"
    
    # Check server file has required imports
    server_content = server_file.read_text()
    required_imports = [
        "fastapi",
        "uvicorn"
    ]
    
    for imp in required_imports:
        assert imp in server_content, f"Missing import: {imp}"

def test_pre_commit(project_root):
    """Test pre-commit hooks configuration."""
    pre_commit_config = project_root / ".pre-commit-config.yaml"
    assert pre_commit_config.exists(), "Pre-commit config not found"
    
    # Check required hooks are configured
    config_content = pre_commit_config.read_text()
    required_hooks = [
        "black",
        "flake8",
        "pytest"
    ]
    
    for hook in required_hooks:
        assert hook in config_content, f"Missing pre-commit hook: {hook}"

def test_code_formatting(project_root):
    """Test code formatting configuration."""
    # Check black config
    pyproject_toml = project_root / "pyproject.toml"
    assert pyproject_toml.exists(), "pyproject.toml not found"
    
    # Check flake8 config
    flake8_config = project_root / ".flake8"
    assert flake8_config.exists(), "Flake8 config not found"
    
    # Verify black configuration
    pyproject_content = pyproject_toml.read_text()
    assert "[tool.black]" in pyproject_content, "Black configuration missing"
    
    # Verify flake8 configuration
    flake8_content = flake8_config.read_text()
    assert "[flake8]" in flake8_content, "Flake8 configuration missing" 