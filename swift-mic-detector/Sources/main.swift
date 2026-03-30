import CoreAudio
import Foundation

// Ensure stdout is line-buffered so each JSON line reaches the parent process
// immediately, even when writing to a pipe rather than a terminal.
setlinebuf(stdout)

// MARK: - Helpers

/// Emit a single NDJSON line for the current mic state.
func emitState(_ active: Bool) {
    print(active ? #"{"micActive": true}"# : #"{"micActive": false}"#)
}

/// Query CoreAudio for the default input device ID.
/// Returns `kAudioObjectUnknown` (0) if none exists.
func defaultInputDevice() -> AudioObjectID {
    var deviceID = AudioObjectID(kAudioObjectUnknown)
    var dataSize = UInt32(MemoryLayout<AudioObjectID>.size)
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultInputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    let status = AudioObjectGetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &address,
        0, nil,
        &dataSize, &deviceID
    )
    guard status == noErr else { return AudioObjectID(kAudioObjectUnknown) }
    return deviceID
}

/// Query CoreAudio to determine whether `deviceID` has an active input stream
/// (i.e. some process is actively recording from the microphone).
/// Uses input scope to avoid false positives from audio output on
/// bidirectional devices (e.g. headsets playing music).
func isDeviceRunning(_ deviceID: AudioObjectID) -> Bool {
    guard deviceID != kAudioObjectUnknown else { return false }

    // Check if any input streams on the device are running.
    var streamSize = UInt32(0)
    var streamAddress = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyStreams,
        mScope: kAudioObjectPropertyScopeInput,
        mElement: kAudioObjectPropertyElementMain
    )
    var status = AudioObjectGetPropertyDataSize(
        deviceID, &streamAddress, 0, nil, &streamSize
    )
    guard status == noErr, streamSize > 0 else { return false }

    let streamCount = Int(streamSize) / MemoryLayout<AudioStreamID>.size
    var streams = [AudioStreamID](repeating: 0, count: streamCount)
    status = AudioObjectGetPropertyData(
        deviceID, &streamAddress, 0, nil, &streamSize, &streams
    )
    guard status == noErr else { return false }

    // A stream with isRunning == 1 means active audio capture.
    for stream in streams {
        var isRunning = UInt32(0)
        var runSize = UInt32(MemoryLayout<UInt32>.size)
        var runAddress = AudioObjectPropertyAddress(
            mSelector: kAudioStreamPropertyIsActive,
            mScope: kAudioObjectPropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain
        )
        let runStatus = AudioObjectGetPropertyData(
            stream, &runAddress, 0, nil, &runSize, &isRunning
        )
        if runStatus == noErr && isRunning != 0 {
            return true
        }
    }
    return false
}

// MARK: - Listener management

/// Holds the currently registered device listener so it can be removed when
/// the default input device changes.
var currentDeviceID = AudioObjectID(kAudioObjectUnknown)
var registeredStreamIDs = [AudioStreamID]()

var deviceIsRunningAddress = AudioObjectPropertyAddress(
    mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
    mScope: kAudioObjectPropertyScopeInput,
    mElement: kAudioObjectPropertyElementMain
)

/// Remove stream listeners from previously tracked streams.
func removeStreamListeners() {
    var streamActiveAddress = AudioObjectPropertyAddress(
        mSelector: kAudioStreamPropertyIsActive,
        mScope: kAudioObjectPropertyScopeInput,
        mElement: kAudioObjectPropertyElementMain
    )
    for stream in registeredStreamIDs {
        AudioObjectRemovePropertyListenerBlock(
            stream, &streamActiveAddress, DispatchQueue.main, streamListenerBlock
        )
    }
    registeredStreamIDs.removeAll()
}

/// Register listeners on all input streams of `newDeviceID`, plus a
/// device-level fallback. Emits the device's current state immediately.
func registerDeviceListener(on newDeviceID: AudioObjectID) {
    // Tear down previous listeners.
    removeStreamListeners()
    if currentDeviceID != kAudioObjectUnknown {
        AudioObjectRemovePropertyListenerBlock(
            currentDeviceID, &deviceIsRunningAddress,
            DispatchQueue.main, deviceListenerBlock
        )
    }

    currentDeviceID = newDeviceID

    guard newDeviceID != kAudioObjectUnknown else {
        emitState(false)
        return
    }

    // Emit baseline state.
    emitState(isDeviceRunning(newDeviceID))

    // Listen on the device level (fallback).
    AudioObjectAddPropertyListenerBlock(
        newDeviceID, &deviceIsRunningAddress,
        DispatchQueue.main, deviceListenerBlock
    )

    // Also listen on each input stream for activation changes.
    var streamSize = UInt32(0)
    var streamAddress = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyStreams,
        mScope: kAudioObjectPropertyScopeInput,
        mElement: kAudioObjectPropertyElementMain
    )
    var status = AudioObjectGetPropertyDataSize(
        newDeviceID, &streamAddress, 0, nil, &streamSize
    )
    guard status == noErr, streamSize > 0 else { return }

    let count = Int(streamSize) / MemoryLayout<AudioStreamID>.size
    var streams = [AudioStreamID](repeating: 0, count: count)
    status = AudioObjectGetPropertyData(
        newDeviceID, &streamAddress, 0, nil, &streamSize, &streams
    )
    guard status == noErr else { return }

    var streamActiveAddress = AudioObjectPropertyAddress(
        mSelector: kAudioStreamPropertyIsActive,
        mScope: kAudioObjectPropertyScopeInput,
        mElement: kAudioObjectPropertyElementMain
    )
    for stream in streams {
        let addStatus = AudioObjectAddPropertyListenerBlock(
            stream, &streamActiveAddress, DispatchQueue.main, streamListenerBlock
        )
        if addStatus == noErr {
            registeredStreamIDs.append(stream)
        }
    }
}

/// Listener block for device-level changes (fallback).
let deviceListenerBlock: AudioObjectPropertyListenerBlock = { _, _ in
    emitState(isDeviceRunning(currentDeviceID))
}

/// Listener block for per-stream activation changes.
let streamListenerBlock: AudioObjectPropertyListenerBlock = { _, _ in
    emitState(isDeviceRunning(currentDeviceID))
}

// MARK: - Default-device change listener

var defaultDeviceAddress = AudioObjectPropertyAddress(
    mSelector: kAudioHardwarePropertyDefaultInputDevice,
    mScope: kAudioObjectPropertyScopeGlobal,
    mElement: kAudioObjectPropertyElementMain
)

/// CoreAudio listener block invoked whenever the system's default input device
/// changes (e.g. a USB headset is plugged in or removed).
let defaultDeviceListenerBlock: AudioObjectPropertyListenerBlock = { _, _ in
    let newDeviceID = defaultInputDevice()
    if newDeviceID != currentDeviceID {
        registerDeviceListener(on: newDeviceID)
    }
}

// MARK: - Entry point

// Obtain the initial default input device.
let initialDeviceID = defaultInputDevice()
if initialDeviceID == kAudioObjectUnknown {
    emitState(false)
    exit(1)
}

// Register the device-level listener and emit the initial state.
registerDeviceListener(on: initialDeviceID)

// Watch for default input device changes at the system level.
let systemStatus = AudioObjectAddPropertyListenerBlock(
    AudioObjectID(kAudioObjectSystemObject),
    &defaultDeviceAddress,
    DispatchQueue.main,
    defaultDeviceListenerBlock
)
if systemStatus != noErr {
    emitState(false)
    exit(1)
}

// Run the main dispatch loop indefinitely.
dispatchMain()
