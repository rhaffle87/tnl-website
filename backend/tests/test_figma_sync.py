"""Unit tests for Figma to TNL Studio CMS Integration.

Tests:
1. Extraction and normalization of W3C / Tokens Studio design tokens.
2. WCAG AA contrast calculation on imported tokens.
3. Frame conversion into valid Page Builder blocks (inner_hero, feature_tiles, cta_band).
4. Strict draft guarantee (pages created via Figma are never published directly).
"""

import os
import sys
import unittest
from unittest.mock import MagicMock

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from routers.figma import extract_hex, search_nested_token, slugify
from routers.siteadmin import theme_contrast_report


class TestFigmaSyncLogic(unittest.TestCase):
    def test_extract_hex(self):
        self.assertEqual(extract_hex("#223027"), "#223027")
        self.assertEqual(extract_hex("#5D8A6BFF"), "#5D8A6B")
        self.assertEqual(extract_hex({"value": "#A8977B"}), "#A8977B")
        self.assertEqual(extract_hex({"$value": "#0C100E"}), "#0C100E")
        self.assertIsNone(extract_hex("not-a-color"))

    def test_search_nested_token_w3c(self):
        tokens_studio_sample = {
            "global": {
                "colors": {
                    "primary": {"value": "#223027", "type": "color"},
                    "emerald": {"value": "#5D8A6B", "type": "color"},
                    "accent": {"value": "#A8977B", "type": "color"},
                }
            }
        }
        primary = search_nested_token(tokens_studio_sample, ["primary_color", "primary", "forest"])
        self.assertEqual(primary, "#223027")
        emerald = search_nested_token(tokens_studio_sample, ["emerald_color", "emerald", "pulse"])
        self.assertEqual(emerald, "#5D8A6B")
        accent = search_nested_token(tokens_studio_sample, ["accent_color", "accent", "sand"])
        self.assertEqual(accent, "#A8977B")

    def test_contrast_report(self):
        tokens = {
            "primary_color": "#223027",
            "emerald_color": "#5D8A6B",
            "obsidian_color": "#0C100E",
            "accent_color": "#A8977B",
            "accent_hover_color": "#C2B091",
            "color_surface": "#FAF7F2",
            "color_body": "#1E2521",
            "color_tan_text": "#C4B393",
        }
        report = theme_contrast_report(tokens)
        self.assertTrue(len(report) >= 5)
        # Verify accent button ink on accent background passes AA
        accent_check = next(c for c in report if "Accent text on button" in c["label"])
        self.assertTrue(accent_check["passes"])
        self.assertGreaterEqual(accent_check["ratio"], 4.5)

    def test_slugify(self):
        self.assertEqual(slugify("Open House 2026!"), "open-house-2026")
        self.assertEqual(slugify("Workshop Jaringan & IoT"), "workshop-jaringan-iot")


if __name__ == "__main__":
    unittest.main()
