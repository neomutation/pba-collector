// 앱 아이콘(1024px PNG) 그리기: 남색 바탕에 흰공·노란공·빨간공
//   swift make_icon.swift <출력.png>
import Cocoa

let size: CGFloat = 1024
let img = NSImage(size: NSSize(width: size, height: size))
img.lockFocus()
let bg = NSBezierPath(roundedRect: NSRect(x: 80, y: 80, width: 864, height: 864), xRadius: 190, yRadius: 190)
NSGradient(starting: NSColor(red: 0.07, green: 0.20, blue: 0.40, alpha: 1), ending: NSColor(red: 0.02, green: 0.09, blue: 0.20, alpha: 1))!.draw(in: bg, angle: -90)
func ball(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ c: NSColor) {
    let rect = NSRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)
    NSGraphicsContext.current?.saveGraphicsState()
    let sh = NSShadow(); sh.shadowBlurRadius = 30; sh.shadowOffset = NSSize(width: 0, height: -16); sh.shadowColor = NSColor(white: 0, alpha: 0.5); sh.set()
    let p = NSBezierPath(ovalIn: rect)
    NSGradient(colors: [c.blended(withFraction: 0.55, of: .white)!, c, c.blended(withFraction: 0.45, of: .black)!])!
        .draw(in: p, relativeCenterPosition: NSPoint(x: -0.35, y: 0.35))
    NSGraphicsContext.current?.restoreGraphicsState()
}
ball(350, 600, 170, NSColor(red: 0.97, green: 0.97, blue: 0.95, alpha: 1))
ball(670, 610, 170, NSColor(red: 0.98, green: 0.78, blue: 0.10, alpha: 1))
ball(512, 340, 170, NSColor(red: 0.85, green: 0.12, blue: 0.12, alpha: 1))
img.unlockFocus()
let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
