"""P2.1 sprint 0 unit tests — signature, payload guard, Bearer auth, mask_pii."""

from __future__ import annotations

import hashlib
import hmac
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import server  # noqa: E402


def make_signature(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


class VerifySignatureTests(unittest.TestCase):
    SECRET = "test-secret-abc"
    BODY = b'{"hello":"world"}'

    def test_valid(self) -> None:
        sig = make_signature(self.SECRET, self.BODY)
        self.assertTrue(server.verify_signature(self.SECRET, self.BODY, sig))

    def test_invalid(self) -> None:
        self.assertFalse(server.verify_signature(self.SECRET, self.BODY, "0" * 64))

    def test_missing_header(self) -> None:
        self.assertFalse(server.verify_signature(self.SECRET, self.BODY, ""))

    def test_missing_secret(self) -> None:
        sig = make_signature(self.SECRET, self.BODY)
        self.assertFalse(server.verify_signature("", self.BODY, sig))

    def test_case_insensitive_hex(self) -> None:
        sig = make_signature(self.SECRET, self.BODY)
        self.assertTrue(server.verify_signature(self.SECRET, self.BODY, sig.upper()))


class MaskPiiTests(unittest.TestCase):
    def test_email(self) -> None:
        out = server.mask_pii("contact me at foo@example.com please")
        self.assertIn("[이메일]", out)
        self.assertNotIn("foo@example.com", out)

    def test_phone(self) -> None:
        out = server.mask_pii("phone 010-1234-5678 here")
        self.assertIn("[전화번호]", out)

    def test_korean_name_with_title(self) -> None:
        out = server.mask_pii("김민수님이 어제 문의했어요")
        self.assertIn("[이름]", out)
        self.assertNotIn("김민수", out)

    def test_company_kr_full(self) -> None:
        out = server.mask_pii("주식회사 해빅스 에서 메시지가 왔습니다")
        self.assertIn("[회사명]", out)

    def test_company_kr_marker(self) -> None:
        out = server.mask_pii("㈜해빅스 담당자 입니다")
        self.assertIn("[회사명]", out)

    def test_company_en(self) -> None:
        out = server.mask_pii("Reply from Acme Inc. about our order")
        self.assertIn("[회사명]", out)

    def test_order_number(self) -> None:
        out = server.mask_pii("주문번호 ORD-1234567 확인 부탁드립니다")
        self.assertIn("[주문번호]", out)


if __name__ == "__main__":
    unittest.main()
