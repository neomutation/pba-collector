// PBA 선수 비교 — 독립 실행 Mac 앱
// 켜면 pba-collector/server.rb 를 뒤에서 실행하고, 자체 창(WKWebView)에 화면을 띄운다. 끄면 서버도 끈다.
import Cocoa
import WebKit

let projectDir = "/Users/당구/pba-collector"
let port = 4580
// 처음 여는 주소와 창 이름 (Info.plist). 캐스터 앱은 PBAPath = /?caster
let startPath = Bundle.main.object(forInfoDictionaryKey: "PBAPath") as? String ?? "/"
let appTitle = Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "PBA 선수 비교"

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var server: Process?
    var updating = false

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMenu()
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()          // 접은/펼친 상태 등 화면 설정이 다음 실행에도 남는다
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
        view.addItem(withTitle: "전체 화면", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        viewItem.submenu = view
        NSApp.mainMenu = main
    }

    @objc func reload() { web.reload() }
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
