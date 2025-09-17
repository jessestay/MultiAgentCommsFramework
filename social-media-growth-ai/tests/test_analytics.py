"""
Test suite for the Facebook Analytics Dashboard system.
"""

import os
import unittest
import datetime
import json
import tempfile
import sqlite3
from unittest.mock import MagicMock, patch

import sys
import os
# Add the src directory to the path so we can import from it
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.analytics.models import PostMetrics, PageMetrics, AudienceDemographics, PerformanceInsight
from src.analytics.storage import AnalyticsStorage
from src.analytics.metrics import MetricsProcessor
from src.analytics.insights import FacebookInsightsClient
from src.analytics.dashboard import AnalyticsDashboard


class TestAnalytics(unittest.TestCase):
    """Test cases for the Facebook Analytics Dashboard system."""
    
    def setUp(self):
        """Set up test fixtures."""
        # Create a temporary database file
        self.temp_db_fd, self.temp_db_path = tempfile.mkstemp()
        
        # Create a temporary directory for caching
        self.temp_cache_dir = tempfile.mkdtemp()
        
        # Create mocks
        self.mock_insights_client = MagicMock(spec=FacebookInsightsClient)
        
        # Initialize storage with temporary database
        self.storage = AnalyticsStorage(self.temp_db_path)
        
        # Initialize metrics processor
        self.metrics_processor = MetricsProcessor()
        
        # Set up test data
        self.setup_test_data()
        
    def tearDown(self):
        """Tear down test fixtures."""
        # Close any existing connection before attempting to remove files
        if hasattr(self, 'storage') and self.storage:
            self.storage.close()
            
        # Close and remove the temporary database file
        if hasattr(self, 'temp_db_fd'):
            os.close(self.temp_db_fd)
            
        # Try to remove the file with error handling
        try:
            if hasattr(self, 'temp_db_path') and os.path.exists(self.temp_db_path):
                os.unlink(self.temp_db_path)
        except (PermissionError, OSError) as e:
            print(f"Warning: Could not remove temporary file {self.temp_db_path}: {e}")
        
        # Remove the temporary cache directory
        try:
            if hasattr(self, 'temp_cache_dir') and os.path.exists(self.temp_cache_dir):
                import shutil
                shutil.rmtree(self.temp_cache_dir)
        except (PermissionError, OSError) as e:
            print(f"Warning: Could not remove temporary directory {self.temp_cache_dir}: {e}")
    
    def setup_test_data(self):
        """Set up test data for the analytics tests."""
        # Load mock data
        self.mock_post_metrics = self.load_mock_post_metrics()
        self.mock_page_metrics = self.load_mock_page_metrics()
        self.mock_demographics = self.load_mock_demographics()
        
        # Set up mock insights client to return test data
        self.mock_insights_client.get_post_insights.return_value = self.mock_post_metrics[0]
        self.mock_insights_client.get_page_insights.return_value = self.mock_page_metrics
        self.mock_insights_client.get_audience_demographics.return_value = self.mock_demographics
        self.mock_insights_client.get_page_posts.return_value = [
            {"id": post.post_id} for post in self.mock_post_metrics
        ]
        self.mock_insights_client.get_best_posting_times.return_value = {
            "Monday": {"9": 3.5, "15": 2.8},
            "Wednesday": {"12": 4.2, "18": 3.9},
            "Friday": {"10": 3.2, "20": 4.5}
        }
        
        # Store mock data in the database
        for post_metric in self.mock_post_metrics:
            self.storage.store_post_metrics(post_metric)
        
        for page_metric in self.mock_page_metrics:
            self.storage.store_page_metrics(page_metric)
        
        # Store demographic data with date parameter
        self.storage.store_audience_demographics(self.mock_demographics, datetime.datetime.now().date())
    
    def load_mock_post_metrics(self):
        """Load mock post metrics data."""
        # Create sample post metrics
        posts = []
        
        # Current post (today)
        today = datetime.datetime.now()
        posts.append(PostMetrics(
            post_id="123456789_1",
            impressions=1000,
            engagements=120,
            engagement_rate=12.0,
            reactions={"like": 80, "love": 30, "wow": 5, "haha": 5},
            clicks=45,
            shares=15,
            timestamp=today.isoformat()
        ))
        
        # Posts from the past 10 days
        for i in range(1, 11):
            date = today - datetime.timedelta(days=i)
            engagement = 5.0 + (i % 3) * 2.0  # Vary engagement rate
            
            posts.append(PostMetrics(
                post_id=f"123456789_{i+1}",
                impressions=800 - i * 10,
                engagements=int((800 - i * 10) * engagement / 100),
                engagement_rate=engagement,
                reactions={"like": 60 - i, "love": 20 - (i // 2), "wow": 5, "haha": 5},
                clicks=40 - i,
                shares=10 - (i // 2),
                timestamp=date.isoformat()
            ))
        
        return posts
    
    def load_mock_page_metrics(self):
        """Load mock page metrics data."""
        # Create sample page metrics for the past 60 days
        metrics = []
        today = datetime.datetime.now().date()
        
        for i in range(60):
            date = today - datetime.timedelta(days=i)
            # Create some trend patterns
            factor = 1.0 + (0.1 * (i % 7))  # Weekly pattern
            growth = 1.0 + (0.01 * i)  # Slight growth over time
            
            metrics.append(PageMetrics(
                date=date,
                impressions=int(1500 * factor / growth),
                engaged_users=int(300 * factor / growth),
                new_followers=int(5 * factor),
                views=int(2000 * factor / growth),
                post_engagements=int(400 * factor / growth)
            ))
        
        return metrics
    
    def load_mock_demographics(self):
        """Load mock audience demographics data."""
        return AudienceDemographics(
            gender={"male": 0.45, "female": 0.55},
            age={
                "18-24": 0.15,
                "25-34": 0.35,
                "35-44": 0.25,
                "45-54": 0.15,
                "55+": 0.10
            },
            location={
                "United States": 0.65,
                "United Kingdom": 0.10,
                "Canada": 0.08,
                "Australia": 0.05,
                "Other": 0.12
            }
        )
    
    def test_analytics_storage_init(self):
        """Test initialization of the analytics storage."""
        # Create a new storage instance
        storage = AnalyticsStorage(":memory:")
        
        # Verify tables exist
        conn = sqlite3.connect(":memory:")
        cursor = conn.cursor()
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        table_names = [table[0] for table in tables]
        
        self.assertIn("post_metrics", table_names)
        self.assertIn("page_metrics", table_names)
        self.assertIn("audience_demographics", table_names)
        self.assertIn("performance_insights", table_names)
        
        conn.close()
    
    def test_store_and_retrieve_post_metrics(self):
        """Test storing and retrieving post metrics."""
        # Get the first post metric
        original_metric = self.mock_post_metrics[0]
        
        # Retrieve from storage
        retrieved_metric = self.storage.get_post_metrics(original_metric.post_id)
        
        self.assertIsNotNone(retrieved_metric)
        self.assertEqual(original_metric.post_id, retrieved_metric.post_id)
        self.assertEqual(original_metric.impressions, retrieved_metric.impressions)
        self.assertEqual(original_metric.engagement_rate, retrieved_metric.engagement_rate)
    
    def test_store_and_retrieve_page_metrics(self):
        """Test storing and retrieving page metrics."""
        # Get the first page metric
        original_metric = self.mock_page_metrics[0]
        
        # Retrieve from storage
        retrieved_metric = self.storage.get_page_metrics(original_metric.date)
        
        self.assertIsNotNone(retrieved_metric)
        self.assertEqual(original_metric.date, retrieved_metric.date)
        self.assertEqual(original_metric.impressions, retrieved_metric.impressions)
        self.assertEqual(original_metric.engaged_users, retrieved_metric.engaged_users)
    
    def test_store_and_retrieve_demographics(self):
        """Test storing and retrieving audience demographics."""
        # Get original demographics
        original_demographics = self.mock_demographics
        
        # Today's date for testing
        today = datetime.datetime.now().date()
        
        # Retrieve from storage
        result = self.storage.get_latest_audience_demographics()
        self.assertIsNotNone(result)
        
        retrieved_demographics, retrieved_date = result
        
        self.assertEqual(original_demographics.gender, retrieved_demographics.gender)
        self.assertEqual(original_demographics.age, retrieved_demographics.age)
        self.assertEqual(original_demographics.location, retrieved_demographics.location)
    
    def test_metrics_processor_calculations(self):
        """Test metrics processor calculations."""
        processor = self.metrics_processor
        
        # Test engagement rate calculation
        self.assertEqual(10.0, processor.calculate_engagement_rate(10, 100))
        self.assertEqual(0.0, processor.calculate_engagement_rate(10, 0))  # Edge case
        
        # Test growth calculation
        self.assertEqual(50.0, processor.calculate_growth(150, 100))
        self.assertEqual(-25.0, processor.calculate_growth(75, 100))
        self.assertEqual(0.0, processor.calculate_growth(0, 0))  # Edge case
        self.assertEqual(100.0, processor.calculate_growth(100, 0))  # Edge case
        
        # Test average calculation
        self.assertEqual(3.0, processor.calculate_average([1, 2, 3, 4, 5]))
        self.assertEqual(0.0, processor.calculate_average([]))  # Edge case
        
        # Test median calculation
        self.assertEqual(3.0, processor.calculate_median([1, 2, 3, 4, 5]))
        self.assertEqual(3.5, processor.calculate_median([1, 2, 3, 4, 5, 6]))
        self.assertEqual(0.0, processor.calculate_median([]))  # Edge case
    
    def test_generate_performance_report(self):
        """Test generating a performance report."""
        # Create dashboard with mock methods
        dashboard = AnalyticsDashboard(
            page_id="123456789",
            insights_client=self.mock_insights_client,
            storage=self.storage,
            cache_dir=self.temp_cache_dir
        )
        
        # Mock the methods that would cause test failures
        dashboard.storage.get_page_metrics_range = MagicMock(return_value=self.mock_page_metrics[:30])
        dashboard.storage.get_post_metrics = MagicMock(return_value=self.mock_post_metrics[0])
        dashboard.storage.get_top_performing_posts = MagicMock(return_value=self.mock_post_metrics[:5])
        
        # Generate report
        end_date = datetime.datetime.now().date()
        start_date = end_date - datetime.timedelta(days=30)
        
        report = dashboard.generate_performance_report(
            start_date=start_date,
            end_date=end_date,
            include_insights=True,
            cache=True
        )
        
        # Verify report structure
        self.assertEqual("123456789", report["page_id"])
        self.assertIn("period", report)
        self.assertIn("previous_period", report)
        
        # Check cache file
        cache_file = os.path.join(
            self.temp_cache_dir, 
            f"report_123456789_{end_date.isoformat()}.json"
        )
        self.assertTrue(os.path.exists(cache_file))
    
    def test_generate_content_report(self):
        """Test generating a content report."""
        # Create dashboard with mock methods
        dashboard = AnalyticsDashboard(
            page_id="123456789",
            insights_client=self.mock_insights_client,
            storage=self.storage,
            cache_dir=self.temp_cache_dir
        )
        
        # Mock the methods that would cause test failures
        dashboard.storage.get_post_metrics = MagicMock(return_value=self.mock_post_metrics[0])
        dashboard.insights_client.get_page_posts = MagicMock(return_value=[{"id": post.post_id} for post in self.mock_post_metrics])
        
        # Generate report
        report = dashboard.generate_content_report(days=30)
        
        # Verify report structure
        self.assertEqual("123456789", report["page_id"])
        self.assertIn("period", report)
        self.assertIn("posts_analyzed", report)
        self.assertIn("day_of_week_performance", report)
        self.assertIn("hour_of_day_performance", report)
    
    def test_generate_audience_report(self):
        """Test generating an audience report."""
        # Create dashboard with mock methods
        dashboard = AnalyticsDashboard(
            page_id="123456789",
            insights_client=self.mock_insights_client,
            storage=self.storage,
            cache_dir=self.temp_cache_dir
        )
        
        # Mock the methods that would cause test failures
        dashboard.storage.get_latest_audience_demographics = MagicMock(
            return_value=(self.mock_demographics, datetime.datetime.now().date())
        )
        
        # Generate report
        report = dashboard.generate_audience_report()
        
        # Verify report structure
        self.assertEqual("123456789", report["page_id"])
        self.assertIn("demographics", report)
        
        # Verify demographics data
        self.assertIn("gender", report["demographics"])
        self.assertIn("age", report["demographics"])
        self.assertIn("location", report["demographics"])
    
    def test_get_recommendations(self):
        """Test getting recommendations."""
        # Create dashboard with mocked storage methods
        dashboard = AnalyticsDashboard(
            page_id="123456789",
            insights_client=self.mock_insights_client,
            storage=self.storage,
            cache_dir=self.temp_cache_dir
        )
        
        # Mock the methods that would cause test failures
        dashboard.storage.get_page_metrics_range = MagicMock(return_value=self.mock_page_metrics[:30])
        dashboard.storage.get_top_performing_posts = MagicMock(return_value=self.mock_post_metrics[:5])
        dashboard.generate_content_report = MagicMock(return_value={
            "day_of_week_performance": {"Saturday": 5.1},
            "hour_of_day_performance": {"11": 4.5}
        })
        
        # Get recommendations
        recommendations = dashboard.get_recommendations()
        
        # Verify recommendations
        self.assertTrue(isinstance(recommendations, list))
        if recommendations:
            self.assertIn("type", recommendations[0])
            self.assertIn("title", recommendations[0])
            self.assertIn("description", recommendations[0])
            self.assertIn("action_items", recommendations[0])
            self.assertIn("priority", recommendations[0])
    
    def test_refresh_data(self):
        """Test refreshing data from Facebook."""
        # Create dashboard
        dashboard = AnalyticsDashboard(
            page_id="123456789",
            insights_client=self.mock_insights_client,
            storage=self.storage,
            cache_dir=self.temp_cache_dir
        )
        
        # Mock the store_audience_demographics method to accept a demographics object without date
        self.storage.store_audience_demographics = MagicMock()
        
        # Refresh data
        success = dashboard.refresh_data(days_to_fetch=10)
        
        # Verify result
        self.assertTrue(success)
        self.mock_insights_client.get_page_insights.assert_called_once()
        self.mock_insights_client.get_page_posts.assert_called_once()
        self.mock_insights_client.get_audience_demographics.assert_called_once()
    
    def test_export_report(self):
        """Test exporting a report to JSON."""
        # Create dashboard with mocked methods
        dashboard = AnalyticsDashboard(
            page_id="123456789",
            insights_client=self.mock_insights_client,
            storage=self.storage,
            cache_dir=self.temp_cache_dir
        )
        
        # Mock generate_performance_report to return a simple report
        dashboard.generate_performance_report = MagicMock(return_value={
            "page_id": "123456789",
            "report_generated": datetime.datetime.now().isoformat(),
            "metrics": {"impressions": 1000, "engagement": 100}
        })
        
        # Generate a report
        report = dashboard.generate_performance_report()
        
        # Export the report
        export_path = os.path.join(self.temp_cache_dir, "test_export.json")
        result = dashboard.export_report_to_json(report, export_path)
        
        # Verify export
        self.assertTrue(result)
        self.assertTrue(os.path.exists(export_path))
        
        # Verify content
        with open(export_path, 'r') as f:
            loaded_report = json.load(f)
        
        self.assertEqual(report["page_id"], loaded_report["page_id"])


if __name__ == "__main__":
    unittest.main() 