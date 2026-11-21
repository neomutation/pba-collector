// PBA 선수 비교 — 독립 실행 Mac 앱
// 켜면 pba-collector/server.rb 를 뒤에서 실행하고, 자체 창(WKWebView)에 화면을 띄운다. 끄면 서버도 끈다.
import Cocoa
import WebKit

let projectDir = "/Users/당구/pba-collector"
let port = 4580
// 처음 여는 주소와 창 이름 (Info.plist). 캐스터 앱은 PBAPath = /?caster
let startPath = Bundle.main.object(forInfoDictionaryKey: "PBAPath") as? String ?? "/"
let appTitle = Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "PBA 선수 비교"

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, NSWindowDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView!
    var server: Process?
    var updating = false
    var sheetWindow: NSWindow?
    var bcWindow: NSWindow?
    var sheetOnTop = false

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMenu()
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()          // 접은/펼친 상태 등 화면 설정이 다음 실행에도 남는다
        cfg.userContentController.add(self, name: "pba")   // 기록지 버튼 → 창 배치
        web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        web.uiDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1500, height: 950),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = appTitle
        window.contentView = web
        window.setFrameAutosaveName("PBAMain" + startPath)      // 창 크기·위치 기억
        if !window.setFrameUsingName("PBAMain" + startPath) { window.center() }
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(web)       // 켜자마자 단축키(⌘C·⌘1 등)가 화면에 가게
        NSApp.activate(ignoringOtherApps: true)
        showMessage("서버를 켜는 중…")
        startServer()
        waitForServer(tries: 0)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ note: Notification) { server?.terminate() }

    // 이미 같은 포트에 서버가 떠 있으면 그대로 쓴다
    func serverAlive() -> Bool {
        guard let url = URL(string: "http://127.0.0.1:\(port)/api/meta") else { return false }
        var ok = false
        let sem = DispatchSemaphore(value: 0)
        var req = URLRequest(url: url); req.timeoutInterval = 1
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            ok = (resp as? HTTPURLResponse)?.statusCode == 200; sem.signal()
        }.resume()
        _ = sem.wait(timeout: .now() + 1.5)
        return ok
    }

    func startServer() {
        if serverAlive() { return }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/ruby")
        p.arguments = ["-Eutf-8", "server.rb"]
        p.currentDirectoryURL = URL(fileURLWithPath: projectDir)
        var env = ProcessInfo.processInfo.environment
        env["PORT"] = String(port); env["LANG"] = "ko_KR.UTF-8"; env["LC_ALL"] = "ko_KR.UTF-8"
        p.environment = env
        let log = FileHandle(forWritingAtPath: projectDir + "/data/app_server.log") ?? {
            FileManager.default.createFile(atPath: projectDir + "/data/app_server.log", contents: nil)
            return FileHandle(forWritingAtPath: projectDir + "/data/app_server.log")!
        }()
        log.seekToEndOfFile()
        p.standardOutput = log; p.standardError = log
        do { try p.run(); server = p } catch { showMessage("서버를 켜지 못했습니다: \(error.localizedDescription)") }
    }

    func waitForServer(tries: Int) {
        DispatchQueue.global().async {
            let ok = self.serverAlive()
            DispatchQueue.main.async {
                if ok {
                    // 예전에 받아 둔 화면 파일(캐시)을 지우고 늘 새로 받는다. 화면 설정(localStorage)은 그대로 둔다
                    let types: Set<String> = [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache]
                    WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: Date(timeIntervalSince1970: 0)) {
                        var req = URLRequest(url: URL(string: "http://127.0.0.1:\(port)\(startPath)")!)
                        req.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
                        self.web.load(req)
                    }
                }
                else if tries < 40 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.waitForServer(tries: tries + 1) } }
                else { self.showMessage("서버가 응답하지 않습니다. \(projectDir)/data/app_server.log 를 확인하세요.") }
            }
        }
    }

    func showMessage(_ text: String) {
        web.loadHTMLString("""
        <html><body style="font:15px -apple-system;display:flex;align-items:center;justify-content:center;height:90vh;color:#888;background:#0d1117">\(text)</body></html>
        """, baseURL: nil)
    }

    // ── 메뉴 ──
    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "PBA 선수 비교 정보", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "PBA 선수 비교 숨기기", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "PBA 선수 비교 종료", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem(); main.addItem(editItem)
        let edit = NSMenu(title: "편집")
        edit.addItem(withTitle: "실행 취소", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "잘라내기", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "복사", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "붙여넣기", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "전체 선택", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit

        let dataItem = NSMenuItem(); main.addItem(dataItem)
        let data = NSMenu(title: "데이터")
        data.addItem(withTitle: "새 경기 결과 받아오기", action: #selector(updateData), keyEquivalent: "u")
        data.addItem(withTitle: "새로고침", action: #selector(reload), keyEquivalent: "r")
        dataItem.submenu = data

        let viewItem = NSMenuItem(); main.addItem(viewItem)
        let view = NSMenu(title: "보기")
        view.addItem(withTitle: "크게", action: #selector(zoomIn), keyEquivalent: "+")
        view.addItem(withTitle: "작게", action: #selector(zoomOut), keyEquivalent: "-")
        view.addItem(withTitle: "원래 크기", action: #selector(zoomReset), keyEquivalent: "0")
        view.addItem(.separator())
        // ⌘F = 캡쳐 폴더 열기, 전체 화면은 ⌃⌘F 로 (프바 앱 · 캐스터 앱 모두)
        let fs = view.addItem(withTitle: "전체 화면", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fs.keyEquivalentModifierMask = [.command, .control]
        view.addItem(withTitle: "캡쳐 폴더 열기", action: #selector(openCaptures), keyEquivalent: "f")
        view.addItem(withTitle: "기록지 창 항상 위 켜기·끄기", action: #selector(toggleSheetTop), keyEquivalent: "")
        viewItem.submenu = view
        let winItem = NSMenuItem(); main.addItem(winItem)
        let win = NSMenu(title: "윈도우")
        win.addItem(withTitle: "앱과 기록지 나란히", action: #selector(tileBoth), keyEquivalent: "")
        win.addItem(withTitle: "최소화", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "확대/축소", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        winItem.submenu = win
        NSApp.windowsMenu = win      // macOS 기본 창 항목(화면 왼쪽/오른쪽 채우기 등)이 여기에 붙는다
        NSApp.mainMenu = main
    }

    @objc func reload() { web.reload() }
    @objc func openCaptures() {
        let dir = URL(fileURLWithPath: "/Users/당구/캡쳐")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        NSWorkspace.shared.open(dir)
    }
    @objc func zoomIn() { web.pageZoom = min(web.pageZoom + 0.1, 2.0) }
    @objc func zoomOut() { web.pageZoom = max(web.pageZoom - 0.1, 0.6) }
    @objc func zoomReset() { web.pageZoom = 1.0 }

    // update_app.sh 실행: 이번 시즌 새 경기 수집 → 선수정보 → DB 재생성. 끝나면 화면 새로고침
    @objc func updateData() {
        if updating { return }
        updating = true
        window.title = "PBA 선수 비교 — 새 경기 결과 받는 중…"
        DispatchQueue.global().async {
            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/bin/zsh")
            p.arguments = [self.projectDirPath("update_app.sh")]
            p.currentDirectoryURL = URL(fileURLWithPath: projectDir)
            try? p.run(); p.waitUntilExit()
            let ok = p.terminationStatus == 0
            DispatchQueue.main.async {
                self.updating = false
                self.window.title = "PBA 선수 비교"
                self.web.reload()
                let a = NSAlert()
                a.messageText = ok ? "업데이트 완료" : "업데이트 중 문제가 생겼습니다"
                a.informativeText = ok ? "새 경기 결과를 반영했습니다." : "\(projectDir)/data/collect_app.log 를 확인하세요."
                a.runModal()
            }
        }
    }
    func projectDirPath(_ f: String) -> String { projectDir + "/" + f }

    // 기록지 별도 창 (window.open): 다른 화면으로 옮길 수 있고 위치를 기억한다. 같은 설정을 써서 저장 공간(localStorage)을 함께 쓴다
    // 방송 요약도 같은 방식의 별도 창 (주소에 bcwin)
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let isBC = action.request.url?.query?.contains("bcwin") == true
        if let w = isBC ? bcWindow : sheetWindow { w.makeKeyAndOrderFront(nil); return nil }
        let v = WKWebView(frame: .zero, configuration: configuration)
        v.navigationDelegate = self
        v.uiDelegate = self
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: isBC ? 1280 : 1180, height: isBC ? 900 : 820),
                         styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        w.isReleasedWhenClosed = false
        w.title = isBC ? "방송 요약" : "경기 기록지"
        w.contentView = v
        w.level = !isBC && sheetOnTop ? .floating : .normal
        // 보통 창처럼 Mission Control 로 다른 데스크탑에 옮기고, 초록 단추로 전용 전체 화면도 쓸 수 있게
        w.collectionBehavior = [.managed, .participatesInCycle, .fullScreenPrimary]
        let name = isBC ? "PBABroadcast" : "PBASheet"
        w.setFrameAutosaveName(name)
        if !w.setFrameUsingName(name) { w.center() }
        w.delegate = self
        w.makeKeyAndOrderFront(nil)
        w.makeFirstResponder(v)
        if isBC { bcWindow = w } else { sheetWindow = w }
        return v
    }
    func webViewDidClose(_ webView: WKWebView) {
        if webView.window === sheetWindow { sheetWindow?.close() }
        if webView.window === bcWindow { bcWindow?.close() }
    }
    func windowWillClose(_ note: Notification) {
        guard let w = note.object as? NSWindow, w === sheetWindow || w === bcWindow else { return }
        (w.contentView as? WKWebView)?.loadHTMLString("", baseURL: nil)   // 페이지를 내려 '창 닫힘'이 기록되게
        if w === sheetWindow { sheetWindow = nil } else { bcWindow = nil }
    }
    // 창 배치: 기록지 버튼에서 온다
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        guard let cmd = m.body as? String else { return }
        // 방송 요약 PDF · 공유: 'pdf:이름' / 'share:이름' → 그 창의 페이지를 PDF로 (다운로드 폴더), 공유는 공유 메뉴
        if cmd.hasPrefix("sharetext:") {   // 방송 요약 글자로 공유 (공유 메뉴)
            let wv = m.webView ?? web!
            wv.evaluateJavaScript("window.pbaPdfAck && pbaPdfAck()")
            let picker = NSSharingServicePicker(items: [String(cmd.dropFirst("sharetext:".count))])
            picker.show(relativeTo: NSRect(x: wv.bounds.width - 220, y: 12, width: 1, height: 1), of: wv, preferredEdge: .minY)
            return
        }
        if cmd.hasPrefix("cap:") { capture(m.webView ?? web, String(cmd.dropFirst(4))); return }
        if cmd.hasPrefix("pdf:") || cmd.hasPrefix("share:") { exportPDF(m.webView ?? web, share: cmd.hasPrefix("share:"), name: String(cmd.split(separator: ":", maxSplits: 1).last ?? "방송요약")); return }
        switch cmd {
        case "tile": tileBoth()
        case "focus": sheetWindow?.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        case "bcfocus": bcWindow?.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        case "left": half(sheetWindow, left: true)
        case "right": half(sheetWindow, left: false)
        case "full": sheetWindow?.toggleFullScreen(nil)
        default: break
        }
    }
    // 영역 캡쳐 (캐스터 단축키 ⌘C·⌘1·⌘2·⌘A): 'x,y,w,h,화면폭|이름'(CSS px) → 그 부분을 그림으로 클립보드에 + /Users/당구/캡쳐 폴더에 PNG
    func capture(_ wv: WKWebView, _ arg: String) {
        let parts = arg.split(separator: "|", maxSplits: 1).map(String.init)
        let label = parts.count > 1 ? parts[1].replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-") : "캡쳐"
        let v = parts[0].split(separator: ",").compactMap { Double($0) }
        guard v.count == 5, v[4] > 0 else { wv.evaluateJavaScript("window.pbaCapDone && pbaCapDone(false)"); return }
        let k = Double(wv.bounds.width) / v[4]     // 확대·축소(⌘+/-) 중이면 CSS px ≠ 화면 점
        let cfg = WKSnapshotConfiguration()
        cfg.rect = NSRect(x: v[0] * k, y: v[1] * k, width: v[2] * k, height: v[3] * k)
        cfg.afterScreenUpdates = true
        wv.takeSnapshot(with: cfg) { img, _ in
            var ok = false
            if let img = img, let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) {
                let rep = NSBitmapImageRep(cgImage: cg)
                rep.size = img.size                     // 레티나 해상도 그대로, 붙여 넣으면 화면에서 본 크기로
                if let png = rep.representation(using: .png, properties: [:]) {
                    let pb = NSPasteboard.general
                    pb.clearContents()
                    pb.setData(png, forType: .png)
                    if let tiff = rep.tiffRepresentation { pb.setData(tiff, forType: .tiff) }
                    ok = true
                    let dir = URL(fileURLWithPath: "/Users/당구/캡쳐")
                    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                    let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd HH.mm.ss"
                    var url = dir.appendingPathComponent("\(df.string(from: Date())) \(label).png"), n = 2
                    while FileManager.default.fileExists(atPath: url.path) { url = dir.appendingPathComponent("\(df.string(from: Date())) \(label) \(n).png"); n += 1 }
                    if (try? png.write(to: url)) == nil { ok = false }
                }
            }
            wv.evaluateJavaScript("window.pbaCapDone && pbaCapDone(\(ok))")
        }
    }
    func exportPDF(_ wv: WKWebView, share: Bool, name: String) {
        wv.evaluateJavaScript("window.pbaPdfAck && pbaPdfAck()")
        // 페이지가 pdfmode 로 다시 그려질 시간을 조금 준다
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            wv.createPDF { result in
                guard case .success(let data) = result else { wv.evaluateJavaScript("window.pbaPdfDone && pbaPdfDone(null)"); return }
                let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
                let url = dir.appendingPathComponent(name + ".pdf")
                do { try data.write(to: url) } catch { wv.evaluateJavaScript("window.pbaPdfDone && pbaPdfDone(null)"); return }
                wv.evaluateJavaScript("window.pbaPdfDone && pbaPdfDone(true)")
                if share {
                    let picker = NSSharingServicePicker(items: [url])
                    picker.show(relativeTo: NSRect(x: wv.bounds.width - 160, y: 12, width: 1, height: 1), of: wv, preferredEdge: .minY)
                } else {
                    NSWorkspace.shared.activateFileViewerSelecting([url])
                }
            }
        }
    }
    func half(_ w: NSWindow?, left: Bool, on screen: NSScreen? = nil) {
        guard let w = w, let f = (screen ?? w.screen ?? NSScreen.main)?.visibleFrame else { return }
        if w.styleMask.contains(.fullScreen) { w.toggleFullScreen(nil); return }
        w.setFrame(NSRect(x: left ? f.minX : f.midX, y: f.minY, width: f.width / 2, height: f.height), display: true, animate: false)
    }
    // 같은 화면에 앱 왼쪽 절반 · 기록지 오른쪽 절반
    @objc func tileBoth() {
        guard let s = sheetWindow else { web.evaluateJavaScript("Sheet.tile && Sheet.tile()"); return }
        let screen = window.screen ?? NSScreen.main
        half(window, left: true, on: screen); half(s, left: false, on: screen)
        window.orderFront(nil); s.makeKeyAndOrderFront(nil)
    }
    @objc func toggleSheetTop() { sheetOnTop.toggle(); sheetWindow?.level = sheetOnTop ? .floating : .normal }

    // 사진 등 외부 링크는 기본 브라우저로
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let u = action.request.url, action.navigationType == .linkActivated, u.host != "127.0.0.1" {
            NSWorkspace.shared.open(u); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
