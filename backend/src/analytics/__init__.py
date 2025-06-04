"""Analytics module for tracking user behavior and generating insights."""

from .tracker import AnalyticsTracker
from .models import (
    PageView, SearchAnalytics, FeatureUsage, UserNote, CacheMetadata,
    PopularCommand, AnalyticsOverview, UserAnalytics
)

__all__ = [
    "AnalyticsTracker",
    "PageView",
    "SearchAnalytics", 
    "FeatureUsage",
    "UserNote",
    "CacheMetadata",
    "PopularCommand",
    "AnalyticsOverview",
    "UserAnalytics"
]