# Writes a legacy RC4 40-bit locked PDF with pypdf: a producer other than qpdf.
# Run: python3 -m venv /tmp/v && /tmp/v/bin/pip install pypdf && /tmp/v/bin/python scripts/fixtures/pypdf-rc4.py
from pypdf import PdfWriter

writer = PdfWriter()
writer.add_blank_page(width=300, height=144)
writer.add_metadata({"/Producer": "Sphynx fixtures (pypdf)"})
writer.encrypt(user_password="sphynx", owner_password="owner", algorithm="RC4-40")
with open("test/fixtures/pypdf-rc4-40.pdf", "wb") as f:
    writer.write(f)
