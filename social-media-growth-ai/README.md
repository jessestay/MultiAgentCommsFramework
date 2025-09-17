# Facebook Growth AI

An AI-powered system for optimizing Facebook page growth through automated content creation, scheduling, and analytics.

## Features

- **Content Generation**: AI-powered content creation for Facebook posts
- **Smart Scheduling**: Optimal posting times based on audience engagement
- **Analytics Dashboard**: Comprehensive analytics and insights
- **Growth Optimization**: Data-driven recommendations for page growth
- **Audience Targeting**: Tailored content for specific audience segments

## Getting Started

### Prerequisites

- Python 3.8+
- Facebook Developer Account
- Facebook Page Access Token

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/facebook-growth-ai.git
   cd facebook-growth-ai
   ```

2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Configure your Facebook credentials:
   ```
   cp .env.example .env
   # Edit .env with your Facebook credentials
   ```

## Usage

### Content Generation

Generate AI-powered content for your Facebook page:

```
python -m src.content.generator --topic "product announcement" --tone "professional" --count 5
```

### Post Scheduling

Schedule posts at optimal times:

```
python -m src.scheduler.scheduler --days 7 --posts-per-day 2
```

### Analytics Dashboard

Run the analytics dashboard:

```
python -m src.analytics.dashboard --page-id YOUR_PAGE_ID
```

### Analytics Demo

To see a demonstration of the analytics capabilities without requiring Facebook API access:

```
python -m src.analytics.demo
```

This demo showcases:
- Metrics processing and calculations
- Content performance analysis
- Best posting times analysis
- Demographics analysis
- Personalized recommendations
- Report generation

The demo will generate a sample performance report in the `analytics_reports` directory.

## Project Structure

```
facebook-growth-ai/
├── src/
│   ├── analytics/        # Analytics and insights
│   ├── content/          # Content generation
│   ├── scheduler/        # Post scheduling
│   └── utils/            # Utility functions
├── tests/                # Test suite
├── data/                 # Data storage
├── analytics_reports/    # Generated analytics reports
├── requirements.txt      # Dependencies
└── README.md             # This file
```

## Testing

Run the test suite:

```
python -m unittest discover -s tests
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Facebook Graph API
- OpenAI for AI capabilities
- Contributors and maintainers 