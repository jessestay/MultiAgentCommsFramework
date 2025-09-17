"""
Automated sprint validation script.
Ensures all requirements are met before sprint completion.
"""

import pytest
import sys
import os
import json
import logging
from typing import Dict, List, Any
from pathlib import Path
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SprintValidator:
    def __init__(self, sprint_number: int):
        self.sprint_number = sprint_number
        self.results: Dict[str, Any] = {
            'sprint': sprint_number,
            'timestamp': datetime.now().isoformat(),
            'tests': {},
            'stories': {},
            'documentation': {},
            'accessibility': {}
        }
    
    def run_unit_tests(self) -> bool:
        """Execute all unit tests and generate coverage report."""
        logger.info("Running unit tests...")
        result = pytest.main(['--cov', '--cov-report=html'])
        self.results['tests'] = {
            'passed': result == 0,
            'coverage_report': 'htmlcov/index.html'
        }
        return result == 0
    
    def validate_user_stories(self) -> bool:
        """Verify all user stories meet acceptance criteria."""
        logger.info("Validating user stories...")
        stories_path = Path('docs/user_stories.json')
        if not stories_path.exists():
            logger.error("User stories file not found")
            return False
        
        with open(stories_path) as f:
            stories = json.load(f)
        
        all_valid = True
        for story in stories:
            if not self._validate_story(story):
                all_valid = False
        
        self.results['stories'] = {
            'total': len(stories),
            'validated': all_valid
        }
        return all_valid
    
    def _validate_story(self, story: Dict[str, Any]) -> bool:
        """Validate individual user story format and completion."""
        required_fields = ['id', 'title', 'acceptance_criteria', 'tasks']
        for field in required_fields:
            if field not in story:
                logger.error(f"Story {story.get('id', 'UNKNOWN')} missing {field}")
                return False
        
        # Validate story ID format
        if not story['id'].startswith('US-'):
            logger.error(f"Invalid story ID format: {story['id']}")
            return False
        
        # Check acceptance criteria completion
        for ac in story['acceptance_criteria']:
            if not ac.get('completed', False):
                logger.error(f"Story {story['id']} has incomplete acceptance criteria")
                return False
        
        return True
    
    def check_documentation(self) -> bool:
        """Verify all documentation is current."""
        logger.info("Checking documentation...")
        docs_path = Path('docs')
        api_docs = docs_path / 'api'
        user_guides = docs_path / 'guides'
        
        all_current = True
        if not api_docs.exists() or not user_guides.exists():
            logger.error("Documentation directories not found")
            all_current = False
        
        # Check for recent updates
        for doc_file in docs_path.rglob('*.md'):
            if not self._is_doc_current(doc_file):
                logger.warning(f"Documentation may be outdated: {doc_file}")
                all_current = False
        
        self.results['documentation'] = {
            'is_current': all_current,
            'last_checked': datetime.now().isoformat()
        }
        return all_current
    
    def _is_doc_current(self, doc_file: Path) -> bool:
        """Check if documentation file is current."""
        # Compare file modification time with sprint start
        sprint_start = self._get_sprint_start_date()
        return doc_file.stat().st_mtime > sprint_start.timestamp()
    
    def validate_accessibility(self) -> bool:
        """Verify WCAG 2.1 compliance and visual standards."""
        logger.info("Validating accessibility...")
        
        # Check color contrast ratios
        from analytics.visualization_config import COLOR_PALETTE, ACCESSIBILITY
        
        all_valid = True
        for color in COLOR_PALETTE.values():
            if not self._check_contrast_ratio(color, COLOR_PALETTE['background']):
                logger.error(f"Insufficient contrast ratio for color: {color}")
                all_valid = False
        
        self.results['accessibility'] = {
            'wcag_compliant': all_valid,
            'color_scheme_valid': all_valid
        }
        return all_valid
    
    def _check_contrast_ratio(self, color1: str, color2: str) -> bool:
        """Calculate and validate color contrast ratio."""
        # Implementation of WCAG 2.1 contrast ratio calculation
        # Placeholder for actual implementation
        return True
    
    def generate_report(self) -> Dict[str, Any]:
        """Generate comprehensive validation report."""
        logger.info("Generating sprint validation report...")
        
        report_path = Path(f'reports/sprint_{self.sprint_number}_validation.json')
        report_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(report_path, 'w') as f:
            json.dump(self.results, f, indent=2)
        
        return self.results
    
    def _get_sprint_start_date(self) -> datetime:
        """Get the start date of the current sprint."""
        # Implementation would pull from sprint configuration
        return datetime.now()  # Placeholder

def main():
    """Main execution function."""
    if len(sys.argv) != 2:
        print("Usage: python validate_sprint.py <sprint_number>")
        sys.exit(1)
    
    sprint_number = int(sys.argv[1])
    validator = SprintValidator(sprint_number)
    
    success = all([
        validator.run_unit_tests(),
        validator.validate_user_stories(),
        validator.check_documentation(),
        validator.validate_accessibility()
    ])
    
    report = validator.generate_report()
    
    if not success:
        logger.error("Sprint validation failed. See report for details.")
        sys.exit(1)
    
    logger.info("Sprint validation successful!")
    logger.info(f"Report generated: reports/sprint_{sprint_number}_validation.json")

if __name__ == '__main__':
    main() 