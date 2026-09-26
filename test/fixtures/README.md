# Real-world fixtures

Locked PDFs made by producers other than qpdf, so the tests are not only qpdf reading its own files.
Most fixtures are built at test time instead: see `test/fixtures.ts`.

| File | Producer | Lock | Open password |
| --- | --- | --- | --- |
| `quartz-open-password.pdf` | Apple Quartz (Preview's engine) | Open password, 128-bit | `sphynx` |
| `quartz-restricted.pdf` | Apple Quartz | Restrictions only (no print, no copy) | none |
| `pypdf-rc4-40.pdf` | pypdf | Open password, legacy RC4 40-bit | `sphynx` |

The owner password is `owner` in every file. Rebuild from the repo root:

```sh
swift scripts/fixtures/quartz.swift
python3 -m venv /tmp/pypdf && /tmp/pypdf/bin/pip install pypdf && /tmp/pypdf/bin/python scripts/fixtures/pypdf-rc4.py
```

Never add a real document here, not even with its password removed: statements, payslips and tax forms
stay in git history for good. Make a synthetic file with a script instead.
