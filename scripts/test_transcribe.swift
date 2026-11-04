import Foundation
import Speech

guard CommandLine.arguments.count > 1 else { exit(1) }
let url = URL(fileURLWithPath: CommandLine.arguments[1])

guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")) else {
    print("Locale en-US not supported")
    exit(1)
}

let req = SFSpeechURLRecognitionRequest(url: url)
req.requiresOnDeviceRecognition = false

var done = false
var fullText = ""

let task = recognizer.recognitionTask(with: req) { result, error in
    if let error = error {
        print("ERROR:", error.localizedDescription)
        done = true
        return
    }
    if let result = result {
        fullText = result.bestTranscription.formattedString
        if result.isFinal {
            done = true
        }
    }
}

let deadline = Date().addingTimeInterval(20)
while !done && Date() < deadline {
    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1))
}

print("RESULT:", fullText)
