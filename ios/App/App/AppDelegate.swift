import UIKit
import Capacitor
import PushKit
import CallKit
import AVFAudio

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, PKPushRegistryDelegate, CXProviderDelegate {
    var window: UIWindow?

    private let callProvider: CXProvider = {
        let configuration = CXProviderConfiguration(localizedName: "NightGram")
        configuration.supportsVideo = true
        configuration.maximumCallsPerCallGroup = 1
        configuration.maximumCallGroups = 1
        configuration.supportedHandleTypes = [.generic]
        configuration.includesCallsInRecents = true
        return CXProvider(configuration: configuration)
    }()
    private var voipRegistry: PKPushRegistry?
    private var callDetails: [UUID: [String: Any]] = [:]
    private let pendingActionKey = "nightgram_pending_call_action"
    private let voipTokenKey = "nightgram_voip_token"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        callProvider.setDelegate(self, queue: nil)
        let registry = PKPushRegistry(queue: DispatchQueue.main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        voipRegistry = registry
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        emitStoredNativeState()
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // Forward the regular APNs registration result to Capacitor Push Notifications.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // MARK: PushKit

    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(token, forKey: voipTokenKey)
        emitJavaScriptEvent(name: "nightgram:native-voip-token", detail: ["token": token])
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        guard type == .voIP else { return }
        UserDefaults.standard.removeObject(forKey: voipTokenKey)
    }

    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else { completion(); return }
        let data = payload.dictionaryPayload
        let callId = stringValue(data["callId"]) ?? UUID().uuidString
        let action = stringValue(data["action"]) ?? "incoming"
        let uuid = stableCallUUID(callId)

        if action == "end-call" || action == "cancel" || action == "ended" {
            callProvider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
            callDetails.removeValue(forKey: uuid)
            completion()
            return
        }

        let caller = stringValue(data["fromUsername"]) ?? stringValue(data["conversationTitle"]) ?? "NightGram"
        let isVideo = (stringValue(data["type"]) ?? "audio") == "video"
        var normalized = data
        normalized["callId"] = callId
        normalized["kind"] = "call"
        normalized["url"] = stringValue(data["url"]) ?? "/calls"
        callDetails[uuid] = normalized

        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: caller)
        update.localizedCallerName = caller.hasPrefix("@") ? caller : "@\(caller)"
        update.hasVideo = isVideo
        update.supportsDTMF = false
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false

        callProvider.reportNewIncomingCall(with: uuid, update: update) { error in
            if let error = error { print("[NightGram] CallKit incoming error: \(error.localizedDescription)") }
            completion()
        }
    }

    // MARK: CallKit

    func providerDidReset(_ provider: CXProvider) {
        callDetails.removeAll()
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        configureCallAudio()
        publishCallAction(uuid: action.callUUID, action: "accept-call")
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        publishCallAction(uuid: action.callUUID, action: "reject-call")
        callDetails.removeValue(forKey: action.callUUID)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        emitJavaScriptEvent(name: "nightgram:native-audio-session", detail: ["active": true])
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        emitJavaScriptEvent(name: "nightgram:native-audio-session", detail: ["active": false])
    }

    // MARK: Helpers

    private func configureCallAudio() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .videoChat, options: [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker])
        try? session.setActive(true)
    }

    private func publishCallAction(uuid: UUID, action: String) {
        var detail = callDetails[uuid] ?? ["callId": uuid.uuidString, "kind": "call", "url": "/calls"]
        detail["action"] = action
        if let data = try? JSONSerialization.data(withJSONObject: detail), let text = String(data: data, encoding: .utf8) {
            UserDefaults.standard.set(text, forKey: pendingActionKey)
        }
        emitJavaScriptEvent(name: "nightgram:native-call-action", detail: detail)
    }

    private func emitStoredNativeState() {
        if let token = UserDefaults.standard.string(forKey: voipTokenKey), !token.isEmpty {
            emitJavaScriptEvent(name: "nightgram:native-voip-token", detail: ["token": token])
        }
        if let text = UserDefaults.standard.string(forKey: pendingActionKey),
           let data = text.data(using: .utf8),
           let detail = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            UserDefaults.standard.removeObject(forKey: pendingActionKey)
            emitJavaScriptEvent(name: "nightgram:native-call-action", detail: detail)
        }
    }

    private func emitJavaScriptEvent(name: String, detail: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(detail),
              let nameData = try? JSONSerialization.data(withJSONObject: name),
              let detailData = try? JSONSerialization.data(withJSONObject: detail),
              let nameJSON = String(data: nameData, encoding: .utf8),
              let detailJSON = String(data: detailData, encoding: .utf8) else { return }
        let script = "window.dispatchEvent(new CustomEvent(\(nameJSON), { detail: \(detailJSON) }));"
        DispatchQueue.main.async { [weak self] in
            self?.findBridgeController(self?.window?.rootViewController)?.webView?.evaluateJavaScript(script)
        }
    }

    private func findBridgeController(_ controller: UIViewController?) -> CAPBridgeViewController? {
        if let bridge = controller as? CAPBridgeViewController { return bridge }
        if let navigation = controller as? UINavigationController { return findBridgeController(navigation.visibleViewController) }
        if let tabs = controller as? UITabBarController { return findBridgeController(tabs.selectedViewController) }
        for child in controller?.children ?? [] {
            if let bridge = findBridgeController(child) { return bridge }
        }
        return nil
    }

    private func stringValue(_ value: Any?) -> String? {
        if let string = value as? String, !string.isEmpty { return string }
        if let number = value as? NSNumber { return number.stringValue }
        return nil
    }

    private func stableCallUUID(_ callId: String) -> UUID {
        if let uuid = UUID(uuidString: callId) { return uuid }
        let digest = SHA256Digest.bytes(callId)
        var bytes = Array(digest.prefix(16))
        bytes[6] = (bytes[6] & 0x0F) | 0x40
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        let value: uuid_t = (
            bytes[0], bytes[1], bytes[2], bytes[3],
            bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11],
            bytes[12], bytes[13], bytes[14], bytes[15]
        )
        return UUID(uuid: value)
    }
}

private enum SHA256Digest {
    static func bytes(_ value: String) -> [UInt8] {
        // Stable, non-cryptographic 128-bit fallback is enough for CallKit UUID identity.
        var first: UInt64 = 0xcbf29ce484222325
        var second: UInt64 = 0x84222325cbf29ce4
        for byte in value.utf8 {
            first = (first ^ UInt64(byte)) &* 0x100000001b3
            second = (second ^ UInt64(byte &+ 31)) &* 0x100000001b3
        }
        return withUnsafeBytes(of: first.bigEndian, Array.init) + withUnsafeBytes(of: second.bigEndian, Array.init)
    }
}
