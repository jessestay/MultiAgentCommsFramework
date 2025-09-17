"""Enhanced configuration with JSON file support"""
import os
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    # Default config values
    DEFAULT_CONFIG = {
        "browser": {
            "headless": False,
            "user_agent_rotation": True,
            "stealth_mode": True
        },
        "accounts": {
            "daily_view_limit": 15,
            "rotation_strategy": "least_used_first"
        },
        "research": {
            "min_delay_between_profiles": 180,
            "max_delay_between_profiles": 480,
            "scroll_behavior": "natural"
        },
        "paths": {
            "screenshots_dir": "profile_screenshots",
            "logs_dir": "logs",
            "database": "linkedin_research.db"
        },
        "messaging": {
            "templates_file": "message_templates.json",
            "auto_personalize": True
        }
    }
    
    @classmethod
    def load(cls):
        """Load configuration from file or use defaults"""
        config = cls.DEFAULT_CONFIG.copy()
        
        # Try to load from config file
        if os.path.exists('config.json'):
            try:
                with open('config.json', 'r') as f:
                    user_config = json.load(f)
                    
                # Deep merge configs
                cls._merge_configs(config, user_config)
            except Exception as e:
                print(f"Error loading config.json: {e}")
                
        return config
    
    @classmethod
    def _merge_configs(cls, base, override):
        """Recursively merge config dictionaries"""
        for key, value in override.items():
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                cls._merge_configs(base[key], value)
            else:
                base[key] = value
    
    @classmethod
    def save_default(cls):
        """Save default config to file"""
        with open('config.json', 'w') as f:
            json.dump(cls.DEFAULT_CONFIG, f, indent=2)
            
# Load configuration
CONFIG = Config.load()

# Create accessor functions
def get_config(section=None, key=None):
    """Get configuration value"""
    if section and key:
        return CONFIG.get(section, {}).get(key)
    elif section:
        return CONFIG.get(section, {})
    else:
        return CONFIG

# LinkedIn credentials (from existing .env file)
LINKEDIN_EMAIL = os.getenv('LINKEDIN_EMAIL')
LINKEDIN_PASSWORD = os.getenv('LINKEDIN_PASSWORD')

# System settings
DEFAULT_DAILY_VIEW_LIMIT = 15
PROFILE_VIEW_MIN_DELAY = 180  # 3 minutes
PROFILE_VIEW_MAX_DELAY = 480  # 8 minutes
SCREENSHOTS_DIR = "profile_screenshots"
LOGS_DIR = "logs"

# Load message templates
def load_message_templates():
    """Load message templates from JSON file or use defaults"""
    template_file = "message_templates.json"
    
    default_templates = [
        """Hi {first_name},

I just wrote the book, Canva For Dummies, and wanted to share a special event I'm hosting just for residents of Mexico. I'm hosting a live 2-day Canva training on March 6-7 where I'll teach how to make money using Canva—selling templates, working with international clients, and using Canva for business.

If you're interested, you can check out more details here: 
https://jessestay.com/makemoneyoncanvamexico

Let me know if you have any questions!""",
        
        """Hello {first_name},

I noticed your background in {title} and wanted to reach out. I recently authored Canva For Dummies and am hosting a specialized 2-day workshop for Mexico-based professionals on March 6-7.

The focus will be on monetizing Canva skills through template sales, international client work, and business applications.

Details are available at: https://jessestay.com/makemoneyoncanvamexico

Would this be relevant to your work?"""
    ]
    
    # Try to load custom templates if they exist
    try:
        if os.path.exists(template_file):
            with open(template_file, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading message templates: {e}")
    
    # Return default templates if we couldn't load custom ones
    return default_templates

# Message templates
MESSAGE_TEMPLATES = load_message_templates() 