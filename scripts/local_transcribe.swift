import Foundation
import Speech

guard CommandLine.arguments.count > 1 else {
    print("Usage: local_transcribe <audio-file-path>")
    exit(1)
}

let audioPath = CommandLine.arguments[1]
let audioUrl = URL(fileURLWithPath: audioPath)

guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")) else {
    print("Locale en-US not supported")
    exit(1)
}

let request = SFSpeechURLRecognitionRequest(url: audioUrl)
request.requiresOnDeviceRecognition = true
request.shouldReportPartialResults = false

let semaphore = DispatchSemaphore(value: 0)

recognizer.recognitionTask(with: request) { (result, error) in
    if let error = error {
        print("Error: \(error.localizedDescription)")
        semaphore.signal()
        return
    }
    if let result = result {
        if result.isFinal {
            print(result.bestTranscription.formattedString)
            semaphore.signal()
        }
    }
}

// Timeout after 30 seconds
if semaphore.wait(timeout: .now() + 30) == .timedOut {
    print("Transcription timed out")
}
