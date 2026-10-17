"""Tests for the analytics export functionality."""

import os
import json
import pandas as pd
import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timedelta

from facebook_growth_ai.analytics.dashboard import AnalyticsDashboard
from facebook_growth_ai.analytics.insights import FacebookInsightsClient
from facebook_growth_ai.analytics.storage import AnalyticsStorage

@pytest.fixture
def sample_report():
    """Create a sample report for testing."""
    return {
        'performance_metrics': [
            {
                'date': '2024-03-01',
                'engagement_rate': 5.2,
                'reach': 1000,
                'impressions': 1500
            },
            {
                'date': '2024-03-02',
                'engagement_rate': 6.1,
                'reach': 1200,
                'impressions': 1800
            }
        ],
        'content_analysis': [
            {
                'type': 'video',
                'performance_score': 8.5,
                'engagement': 500
            },
            {
                'type': 'image',
                'performance_score': 7.2,
                'engagement': 300
            }
        ]
    }

@pytest.fixture
def dashboard(tmp_path):
    """Create a dashboard instance with mock dependencies."""
    mock_client = Mock(spec=FacebookInsightsClient)
    mock_storage = Mock(spec=AnalyticsStorage)
    
    return AnalyticsDashboard(
        page_id='123456789',
        insights_client=mock_client,
        storage=mock_storage,
        export_dir=str(tmp_path)
    )

def test_export_json(dashboard, sample_report, tmp_path):
    """Test JSON export functionality."""
    # Export report
    result = dashboard.export_report(
        sample_report,
        'test_report',
        format='json',
        include_visualizations=True
    )
    
    assert result is True
    
    # Check if file exists
    export_path = os.path.join(str(tmp_path), 'test_report.json')
    assert os.path.exists(export_path)
    
    # Verify content
    with open(export_path, 'r') as f:
        exported_data = json.load(f)
    
    assert 'performance_metrics' in exported_data
    assert 'content_analysis' in exported_data
    assert 'visualizations' in exported_data
    assert 'engagement_trend' in exported_data['visualizations']
    assert 'content_performance' in exported_data['visualizations']

def test_export_csv(dashboard, sample_report, tmp_path):
    """Test CSV export functionality."""
    # Export report
    result = dashboard.export_report(
        sample_report,
        'test_report',
        format='csv',
        include_visualizations=True
    )
    
    assert result is True
    
    # Check if files exist
    csv_path = os.path.join(str(tmp_path), 'test_report.csv')
    viz_dir = os.path.join(str(tmp_path), 'test_report_visualizations')
    
    assert os.path.exists(csv_path)
    assert os.path.exists(viz_dir)
    assert os.path.exists(os.path.join(viz_dir, 'engagement_trend.png'))
    assert os.path.exists(os.path.join(viz_dir, 'content_performance.png'))
    
    # Verify CSV content
    df = pd.read_csv(csv_path)
    assert 'section' in df.columns
    assert len(df) > 0

def test_export_excel(dashboard, sample_report, tmp_path):
    """Test Excel export functionality."""
    # Export report
    result = dashboard.export_report(
        sample_report,
        'test_report',
        format='excel',
        include_visualizations=True
    )
    
    assert result is True
    
    # Check if file exists
    excel_path = os.path.join(str(tmp_path), 'test_report.xlsx')
    assert os.path.exists(excel_path)
    
    # Verify Excel content
    df = pd.read_excel(excel_path, sheet_name='Report Data')
    assert 'section' in df.columns
    assert len(df) > 0
    
    # Check if visualization sheet exists
    df_viz = pd.read_excel(excel_path, sheet_name='Visualizations')
    assert len(df_viz) > 0

def test_real_time_updates(dashboard, sample_report, tmp_path):
    """Test real-time update functionality."""
    # Export report with real-time updates
    result = dashboard.export_report(
        sample_report,
        'test_report',
        format='json',
        real_time_update=True
    )
    
    assert result is True
    
    # Verify callback registration
    dashboard.storage.register_update_callback.assert_called_once()
    
    # Simulate update
    callback = dashboard.storage.register_update_callback.call_args[0][0]
    
    # Create updated data
    updated_report = sample_report.copy()
    updated_report['performance_metrics'].append({
        'date': '2024-03-03',
        'engagement_rate': 7.0,
        'reach': 1500,
        'impressions': 2000
    })
    
    # Trigger update
    callback(updated_report)
    
    # Check if file was updated
    export_path = os.path.join(str(tmp_path), 'test_report.json')
    with open(export_path, 'r') as f:
        updated_data = json.load(f)
    
    assert len(updated_data['performance_metrics']) == 3
    assert updated_data['performance_metrics'][-1]['engagement_rate'] == 7.0

def test_export_error_handling(dashboard, sample_report):
    """Test error handling in export functionality."""
    # Test with invalid format
    with pytest.raises(ValueError):
        dashboard.export_report(sample_report, 'test_report', format='invalid')
    
    # Test with invalid directory
    dashboard.export_dir = '/nonexistent/directory'
    result = dashboard.export_report(sample_report, 'test_report')
    assert result is False

def test_data_flattening(dashboard, sample_report):
    """Test dictionary flattening functionality."""
    df = dashboard._report_to_dataframe(sample_report)
    
    assert 'section' in df.columns
    assert 'engagement_rate' in df.columns
    assert 'performance_score' in df.columns
    assert len(df) == len(sample_report['performance_metrics']) + len(sample_report['content_analysis'])

def test_visualization_generation(dashboard, sample_report):
    """Test visualization generation."""
    plots = dashboard._generate_visualizations(sample_report)
    
    assert 'engagement_trend' in plots
    assert 'content_performance' in plots
    assert len(plots) == 2 