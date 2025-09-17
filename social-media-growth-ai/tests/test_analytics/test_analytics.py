import os
import unittest
import json
import datetime
from unittest.mock import MagicMock, patch
import tempfile
import sqlite3

# Import our analytics modules (to be implemented)
from src.analytics.insights import FacebookInsights
from src.analytics.metrics import MetricsCalculator
from src.analytics.dashboard import DashboardData
from src.analytics.db import AnalyticsDatabase


class TestFacebookInsights(unittest.TestCase):
    """Test Facebook Insights data retrieval."""
    
    def setUp(self):
        """Set up test environment."""
        self.mock_fb_client = MagicMock()
        self.insights = FacebookInsights(self.mock_fb_client)
        
        # Sample response data
        self.sample_post_insights = {
            "data": [
                {
                    "name": "post_impressions",
                    "period": "lifetime",
                    "values": [{"value": 1200}],
                },
                {
                    "name": "post_engagements",
                    "period": "lifetime",
                    "values": [{"value": 150}],
                },
                {
                    "name": "post_reactions_by_type_total",
                    "period": "lifetime",
                    "values": [{
                        "value": {
                            "like": 100,
                            "love": 30,
                            "wow": 10,
                            "haha": 5,
                            "sad": 3,
                            "angry": 2
                        }
                    }],
                }
            ]
        }
        
        # Configure mock to return sample data
        self.mock_fb_client.get_post_insights.return_value = self.sample_post_insights
    
    def test_get_post_insights(self):
        """Test retrieving insights for a specific post."""
        # Arrange
        post_id = "123456789_987654321"
        
        # Act
        insights = self.insights.get_post_insights(post_id)
        
        # Assert
        self.mock_fb_client.get_post_insights.assert_called_once_with(post_id)
        self.assertEqual(insights["impressions"], 1200)
        self.assertEqual(insights["engagements"], 150)
        self.assertEqual(insights["reactions"]["like"], 100)
    
    def test_get_page_insights(self):
        """Test retrieving insights for a page."""
        # Arrange
        page_id = "123456789"
        start_date = datetime.date(2023, 1, 1)
        end_date = datetime.date(2023, 1, 31)
        
        # Sample page insights data
        sample_page_insights = {
            "data": [
                {
                    "name": "page_impressions",
                    "period": "day",
                    "values": [
                        {"value": 500, "end_time": "2023-01-01T08:00:00+0000"},
                        {"value": 600, "end_time": "2023-01-02T08:00:00+0000"},
                    ]
                },
                {
                    "name": "page_engaged_users",
                    "period": "day",
                    "values": [
                        {"value": 50, "end_time": "2023-01-01T08:00:00+0000"},
                        {"value": 60, "end_time": "2023-01-02T08:00:00+0000"},
                    ]
                }
            ]
        }
        
        self.mock_fb_client.get_page_insights.return_value = sample_page_insights
        
        # Act
        insights = self.insights.get_page_insights(page_id, start_date, end_date)
        
        # Assert
        self.mock_fb_client.get_page_insights.assert_called_once()
        self.assertEqual(len(insights["daily_data"]), 2)
        self.assertEqual(insights["daily_data"][0]["impressions"], 500)
        self.assertEqual(insights["daily_data"][1]["engaged_users"], 60)
        self.assertEqual(insights["total_impressions"], 1100)
    
    def test_get_insights_for_date_range(self):
        """Test retrieving insights for multiple posts in a date range."""
        # Arrange
        page_id = "123456789"
        start_date = datetime.date(2023, 1, 1)
        end_date = datetime.date(2023, 1, 7)
        
        # Sample posts data
        sample_posts = {
            "data": [
                {
                    "id": "123456789_111",
                    "created_time": "2023-01-01T10:00:00+0000",
                    "message": "Post 1"
                },
                {
                    "id": "123456789_222",
                    "created_time": "2023-01-03T10:00:00+0000",
                    "message": "Post 2"
                }
            ]
        }
        
        self.mock_fb_client.get_page_posts.return_value = sample_posts
        
        # Act
        insights = self.insights.get_insights_for_date_range(page_id, start_date, end_date)
        
        # Assert
        self.mock_fb_client.get_page_posts.assert_called_once()
        self.assertEqual(len(insights["posts"]), 2)
        self.assertEqual(insights["total_posts"], 2)


class TestMetricsCalculator(unittest.TestCase):
    """Test metrics calculation functionality."""
    
    def setUp(self):
        """Set up test environment."""
        self.calculator = MetricsCalculator()
        
        # Sample data for testing
        self.sample_post_data = {
            "impressions": 1000,
            "engagements": 100,
            "reactions": {
                "like": 80,
                "love": 15,
                "wow": 5
            },
            "comments": 10,
            "shares": 5
        }
    
    def test_calculate_engagement_rate(self):
        """Test engagement rate calculation."""
        # Act
        engagement_rate = self.calculator.calculate_engagement_rate(
            self.sample_post_data["engagements"],
            self.sample_post_data["impressions"]
        )
        
        # Assert
        self.assertEqual(engagement_rate, 10.0)  # (100 / 1000) * 100 = 10%
    
    def test_calculate_reaction_distribution(self):
        """Test reaction distribution calculation."""
        # Act
        distribution = self.calculator.calculate_reaction_distribution(
            self.sample_post_data["reactions"]
        )
        
        # Assert
        self.assertEqual(distribution["like"], 80.0)  # 80/100 * 100 = 80%
        self.assertEqual(distribution["love"], 15.0)  # 15/100 * 100 = 15%
        self.assertEqual(distribution["wow"], 5.0)    # 5/100 * 100 = 5%
    
    def test_calculate_post_performance_score(self):
        """Test post performance score calculation."""
        # Act
        score = self.calculator.calculate_post_performance_score(self.sample_post_data)
        
        # Assert
        # Score formula might be complex, just check it's calculated
        self.assertTrue(isinstance(score, (int, float)))
        self.assertTrue(0 <= score <= 100)  # Score should be normalized to 0-100


class TestDashboardData(unittest.TestCase):
    """Test dashboard data preparation."""
    
    def setUp(self):
        """Set up test environment."""
        self.mock_insights = MagicMock()
        self.mock_calculator = MagicMock()
        self.dashboard = DashboardData(self.mock_insights, self.mock_calculator)
        
        # Sample insights data
        self.sample_date_range_insights = {
            "posts": [
                {
                    "id": "123456789_111",
                    "message": "Post 1",
                    "created_time": "2023-01-01T10:00:00+0000",
                    "impressions": 1000,
                    "engagements": 100,
                    "reactions": {"like": 80, "love": 15, "wow": 5},
                    "comments": 10,
                    "shares": 5
                },
                {
                    "id": "123456789_222",
                    "message": "Post 2",
                    "created_time": "2023-01-03T10:00:00+0000",
                    "impressions": 1500,
                    "engagements": 200,
                    "reactions": {"like": 150, "love": 30, "wow": 20},
                    "comments": 20,
                    "shares": 10
                }
            ],
            "total_posts": 2,
            "total_impressions": 2500,
            "total_engagements": 300
        }
        
        self.mock_insights.get_insights_for_date_range.return_value = self.sample_date_range_insights
        
        # Mock performance scores
        self.mock_calculator.calculate_post_performance_score.side_effect = [75, 85]
        
        # Mock engagement rates
        self.mock_calculator.calculate_engagement_rate.side_effect = [10.0, 13.33]
    
    def test_get_dashboard_data(self):
        """Test retrieving formatted data for the dashboard."""
        # Arrange
        page_id = "123456789"
        start_date = datetime.date(2023, 1, 1)
        end_date = datetime.date(2023, 1, 7)
        
        # Act
        dashboard_data = self.dashboard.get_dashboard_data(page_id, start_date, end_date)
        
        # Assert
        self.mock_insights.get_insights_for_date_range.assert_called_once_with(
            page_id, start_date, end_date
        )
        
        # Check summary data
        self.assertEqual(dashboard_data["summary"]["total_posts"], 2)
        self.assertEqual(dashboard_data["summary"]["total_impressions"], 2500)
        self.assertEqual(dashboard_data["summary"]["total_engagements"], 300)
        self.assertEqual(dashboard_data["summary"]["avg_engagement_rate"], 11.67)
        
        # Check posts data
        self.assertEqual(len(dashboard_data["posts"]), 2)
        self.assertEqual(dashboard_data["posts"][0]["performance_score"], 75)
        self.assertEqual(dashboard_data["posts"][1]["performance_score"], 85)
    
    def test_filter_by_performance(self):
        """Test filtering posts by performance score."""
        # Arrange
        page_id = "123456789"
        start_date = datetime.date(2023, 1, 1)
        end_date = datetime.date(2023, 1, 7)
        
        # Act
        dashboard_data = self.dashboard.get_dashboard_data(page_id, start_date, end_date)
        top_performers = self.dashboard.filter_by_performance(dashboard_data, min_score=80)
        
        # Assert
        self.assertEqual(len(top_performers), 1)
        self.assertEqual(top_performers[0]["id"], "123456789_222")


class TestAnalyticsDatabase(unittest.TestCase):
    """Test analytics database functionality."""
    
    def setUp(self):
        """Set up test environment."""
        # Create a temporary database for testing
        self.db_fd, self.db_path = tempfile.mkstemp()
        self.analytics_db = AnalyticsDatabase(self.db_path)
        self.analytics_db.init_db()
    
    def tearDown(self):
        """Clean up after tests."""
        # Make sure to close the database connection before removing the file
        if self.analytics_db:
            self.analytics_db.close()
        
        # Close the file descriptor
        if hasattr(self, 'db_fd'):
            os.close(self.db_fd)
        
        # Try to remove the file, with error handling
        try:
            if hasattr(self, 'db_path') and os.path.exists(self.db_path):
                os.unlink(self.db_path)
        except (PermissionError, OSError) as e:
            print(f"Warning: Could not remove temporary file {self.db_path}: {e}")
    
    def test_store_post_insights(self):
        """Test storing post insights in the database."""
        # Arrange
        post_id = "123456789_111"
        post_insights = {
            "impressions": 1000,
            "engagements": 100,
            "reactions": {"like": 80, "love": 15, "wow": 5},
            "comments": 10,
            "shares": 5
        }
        
        # Act
        success = self.analytics_db.store_post_insights(post_id, post_insights)
        
        # Assert
        self.assertTrue(success)
        
        # Verify data was stored correctly
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM post_insights WHERE post_id = ?", (post_id,))
        row = cursor.fetchone()
        
        self.assertIsNotNone(row)
        self.assertEqual(row["impressions"], 1000)
        self.assertEqual(row["engagements"], 100)
        self.assertEqual(json.loads(row["reactions"])["like"], 80)
        
        conn.close()
    
    def test_get_post_insights_history(self):
        """Test retrieving post insights history."""
        # Arrange
        post_id = "123456789_111"
        timestamp1 = datetime.datetime.now() - datetime.timedelta(days=2)
        timestamp2 = datetime.datetime.now() - datetime.timedelta(days=1)
        
        # Store two insights records with different timestamps
        self.analytics_db.store_post_insights(post_id, {
            "impressions": 800,
            "engagements": 80,
            "timestamp": timestamp1.isoformat()
        })
        
        self.analytics_db.store_post_insights(post_id, {
            "impressions": 1000,
            "engagements": 100,
            "timestamp": timestamp2.isoformat()
        })
        
        # Act
        history = self.analytics_db.get_post_insights_history(post_id)
        
        # Assert
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["impressions"], 800)
        self.assertEqual(history[1]["impressions"], 1000)


if __name__ == '__main__':
    unittest.main() 