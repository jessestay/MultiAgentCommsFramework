# Calendar & Task Integration System

A secure system that allows AI roles to access, update, and create events in Google Calendar, Google Tasks, and Google Reminders.

## Project Structure

```
calendar_integration/
├── README.md                  # Project documentation
├── requirements.txt           # Python dependencies
├── .env.example               # Example environment variables
├── tests/                     # Test directory
│   ├── __init__.py
│   ├── conftest.py            # Test configuration
│   ├── test_auth.py           # Authentication tests
│   ├── test_calendar.py       # Calendar service tests
│   ├── test_tasks.py          # Tasks service tests
│   └── test_privacy.py        # Privacy filter tests
├── calendar_integration/      # Main package
│   ├── __init__.py
│   ├── auth/                  # Authentication module
│   │   ├── __init__.py
│   │   ├── oauth.py           # OAuth 2.0 implementation
│   │   └── token_storage.py   # Secure token storage
│   ├── privacy/               # Privacy module
│   │   ├── __init__.py
│   │   └── filters.py         # PII filtering implementation
│   ├── services/              # API service modules
│   │   ├── __init__.py
│   │   ├── calendar_service.py # Calendar API interface
│   │   ├── task_service.py    # Tasks API interface
│   │   └── reminder_service.py # Reminders interface
│   ├── models/                # Data models
│   │   ├── __init__.py
│   │   ├── event.py           # Calendar event model
│   │   └── task.py            # Task model
│   └── utils/                 # Utility functions
│       ├── __init__.py
│       └── logger.py          # Logging utilities
└── scripts/                   # Utility scripts
    └── setup_credentials.py   # Script to set up OAuth credentials
```

## Getting Started

### Prerequisites

- Python 3.8 or higher
- Google Cloud Platform account
- Google Calendar API enabled
- Google Tasks API enabled

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/calendar-integration.git
cd calendar-integration
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Copy the example environment file and update with your credentials:
```bash
cp .env.example .env
# Edit .env with your credentials
```

5. Run the setup script to configure OAuth:
```bash
python scripts/setup_credentials.py
```

## Development

### Running Tests

```bash
pytest
```

### Code Style

This project follows PEP 8 style guidelines. To check your code:

```bash
flake8 calendar_integration tests
```

## Agile Development

This project follows Agile methodology with:
- 1-week sprints
- Test-driven development
- User stories with acceptance criteria
- Sprint demos

See `calendar_integration_agile_plan.md` for the full Agile plan.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 