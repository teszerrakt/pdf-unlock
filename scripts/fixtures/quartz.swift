// Writes locked PDFs with Apple's Quartz, the engine behind Preview: a producer other than qpdf.
// Run on macOS: swift scripts/fixtures/quartz.swift
import CoreGraphics
import CoreText
import Foundation

func write(_ name: String, _ options: [CFString: Any]) {
  let url = URL(fileURLWithPath: "test/fixtures/\(name)") as CFURL
  var box = CGRect(x: 0, y: 0, width: 300, height: 144)
  var info: [CFString: Any] = [kCGPDFContextCreator: "Sphynx fixtures (Quartz)", kCGPDFContextEncryptionKeyLength: 128]
  info.merge(options) { $1 }
  let context = CGContext(url, mediaBox: &box, info as CFDictionary)!
  context.beginPDFPage(nil)
  let font = CTFontCreateWithName("Helvetica" as CFString, 24, nil)
  let text = NSAttributedString(string: "Sphynx fixture", attributes: [kCTFontAttributeName as NSAttributedString.Key: font])
  context.textPosition = CGPoint(x: 20, y: 60)
  CTLineDraw(CTLineCreateWithAttributedString(text), context)
  context.endPDFPage()
  context.closePDF()
}

write("quartz-open-password.pdf", [kCGPDFContextUserPassword: "sphynx", kCGPDFContextOwnerPassword: "owner"])
write("quartz-restricted.pdf", [
  kCGPDFContextOwnerPassword: "owner",
  kCGPDFContextAllowsPrinting: false,
  kCGPDFContextAllowsCopying: false,
])
