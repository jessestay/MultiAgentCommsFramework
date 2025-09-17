# LinkedIn Safe Research System - Command Reference

## Account Management

### Add a new LinkedIn account:
```bash
python linkedin_automation.py account add --email "your_email@example.com" --username "your_username" --password "your_password"
```

### List all accounts:
```bash
python linkedin_automation.py account list
```

## Research

### View LinkedIn profiles from a file:
```bash
python linkedin_automation.py research --urls data/profile_urls.txt --limit 5 --headless
```

## Outreach

### Export prospects for manual outreach:
```bash
python linkedin_automation.py outreach export --limit 15 --filename "mexico_prospects.csv"
```

### Update prospect status after messaging:
```bash
python linkedin_automation.py outreach update --url "https://www.linkedin.com/in/johndoe" --status "contacted" --notes "Sent message about Canva workshop"
```

## Configuration

### Generate default config file:
```bash
python linkedin_automation.py config generate
``` 