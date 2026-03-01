import unittest

try:
    from ml.infra_inference import (
        infer_report_type,
        safety_band_for_score,
        score_severity_text,
        urgency_for_band,
    )
    IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover - environment dependency guard
    IMPORT_ERROR = exc


class RiskUtilsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if IMPORT_ERROR is not None:
            raise unittest.SkipTest(f"Skipping risk util tests: {IMPORT_ERROR}")

    def test_safety_band_thresholds(self) -> None:
        self.assertEqual(safety_band_for_score(0.0), "low")
        self.assertEqual(safety_band_for_score(0.3), "guarded")
        self.assertEqual(safety_band_for_score(0.55), "elevated")
        self.assertEqual(safety_band_for_score(0.75), "critical")

    def test_urgency_mapping(self) -> None:
        self.assertEqual(urgency_for_band("low"), "monitor")
        self.assertEqual(urgency_for_band("guarded"), "schedule_30d")
        self.assertEqual(urgency_for_band("elevated"), "schedule_7d")
        self.assertEqual(urgency_for_band("critical"), "immediate_48h")

    def test_report_type_and_severity_signal(self) -> None:
        text = "Bridge deck shows corrosion and spalling near expansion joint."
        self.assertEqual(infer_report_type(text), "corrosion")
        self.assertGreater(score_severity_text(text), 0.35)


if __name__ == "__main__":
    unittest.main()
