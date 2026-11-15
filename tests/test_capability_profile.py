import unittest
from reference.capability_profile import ProfileError, validate_profile


class ProfileValidatorTest(unittest.TestCase):
    def test_unverified_does_not_claim_support(self):
        value = {"schema_version": 1, "backend": "llvm", "target": "native",
                 "capabilities": {"actors": {
                     "status": "unverified", "source_sha": None,
                     "evidence_sha256": None, "executed_cases": 0
                 }}}
        self.assertEqual(validate_profile(value), value)
        value["capabilities"]["actors"] = {
            "status": "verified", "source_sha": "a" * 40,
            "evidence_sha256": "b" * 64, "executed_cases": 9
        }
        self.assertEqual(validate_profile(value), value)

    def test_fail_closed_claims(self):
        base = {"schema_version": 1, "backend": "llvm", "target": "native",
                "capabilities": {"actors": {
                    "status": "verified", "source_sha": "a" * 40,
                    "evidence_sha256": "b" * 64, "executed_cases": 0
                }}}
        with self.assertRaises(ProfileError):
            validate_profile(base)
        base["capabilities"]["actors"]["executed_cases"] = 1
        self.assertEqual(validate_profile(base), base)
        for status in ["pending", "skipped", "passed", True]:
            base["capabilities"]["actors"]["status"] = status
            with self.assertRaises(ProfileError):
                validate_profile(base)


if __name__ == "__main__":
    unittest.main()
