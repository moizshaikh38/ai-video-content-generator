// Converts the VireoClip lettering to stable SVG outlines. The symbol paths are
// constructed separately from reference/logo.png and are not read by this script.
import AppKit
import CoreText
import Foundation

let font = CTFontCreateWithName("AvenirNext-Bold" as CFString, 136, nil)
guard (CTFontCopyPostScriptName(font) as String) == "AvenirNext-Bold" else {
  fatalError("Avenir Next Bold is unavailable")
}

let attributed = NSAttributedString(
  string: "VireoClip",
  attributes: [kCTFontAttributeName as NSAttributedString.Key: font]
)
let line = CTLineCreateWithAttributedString(attributed)
let runs = CTLineGetGlyphRuns(line) as! [CTRun]

func number(_ value: CGFloat) -> String {
  String(format: "%.2f", Double(value))
}

func outline(_ path: CGPath, at origin: CGPoint) -> String {
  var result = ""
  path.applyWithBlock { pointer in
    let element = pointer.pointee
    func point(_ index: Int) -> String {
      let p = element.points[index]
      return "\(number(origin.x + p.x)) \(number(-p.y))"
    }
    switch element.type {
    case .moveToPoint: result += "M\(point(0))"
    case .addLineToPoint: result += "L\(point(0))"
    case .addQuadCurveToPoint: result += "Q\(point(0)) \(point(1))"
    case .addCurveToPoint: result += "C\(point(0)) \(point(1)) \(point(2))"
    case .closeSubpath: result += "Z"
    @unknown default: fatalError("Unsupported path element")
    }
  }
  return result
}

var groups = ["", ""]
var glyphIndex = 0
for run in runs {
  let count = CTRunGetGlyphCount(run)
  var glyphs = [CGGlyph](repeating: 0, count: count)
  var positions = [CGPoint](repeating: .zero, count: count)
  CTRunGetGlyphs(run, CFRangeMake(0, 0), &glyphs)
  CTRunGetPositions(run, CFRangeMake(0, 0), &positions)
  for index in 0..<count {
    guard let path = CTFontCreatePathForGlyph(font, glyphs[index], nil) else {
      fatalError("Missing glyph outline")
    }
    groups[glyphIndex < 5 ? 0 : 1] += outline(path, at: positions[index])
    glyphIndex += 1
  }
}
guard glyphIndex == 9 else { fatalError("Unexpected lettering layout") }

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
for (filename, firstColor, secondColor) in [
  ("vireoclip-logo-light.svg", "#FFFFFF", "#BFA7FF"),
  ("vireoclip-logo-dark.svg", "#101016", "#6C48FF"),
] {
  let file = root.appendingPathComponent("src/assets/brand/\(filename)")
  let original = try String(contentsOf: file, encoding: .utf8)
  let textPattern = #"<text x="232" y="155"[^>]*>.*?</text>"#
  let outlinedPattern = #"<g class="outlined-wordmark"[\s\S]*?</g>"#
  let regex = try NSRegularExpression(pattern: original.contains("outlined-wordmark") ? outlinedPattern : textPattern)
  let range = NSRange(original.startIndex..<original.endIndex, in: original)
  guard let match = regex.firstMatch(in: original, range: range),
        let swiftRange = Range(match.range, in: original) else {
    fatalError("Cannot find wordmark in \(filename)")
  }
  let replacement = """
  <g class="outlined-wordmark" transform="translate(250 155)">
    <path fill="\(firstColor)" d="\(groups[0])"/>
    <path fill="\(secondColor)" d="\(groups[1])"/>
  </g>
  """
  let updated = original.replacingCharacters(in: swiftRange, with: replacement)
  try updated.write(to: file, atomically: true, encoding: .utf8)
}
