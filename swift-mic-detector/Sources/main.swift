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

/// Query CoreAudio to determine whether `deviceID` is currently running
/// (i.e. some process is actively using the microphone).
func isDeviceRunning(_ deviceID: AudioObjectID) -> Bool {
    guard deviceID != kAudioObjectUnknown else { return false }
    var isRunning = UInt32(0)
    var dataSize = UInt32(MemoryLayout<UInt32>.size)
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    let status = AudioObjectGetPropertyData(
        deviceID,
        &address,
        0, nil,
        &dataSize, &isRunning
    )
    return status == noErr && isRunning != 0
}

// MARK: - Listener management

/// Holds the currently registered device listener so it can be removed when
/// the default input device changes.
var currentDeviceID = AudioObjectID(kAudioObjectUnknown)
var deviceAddress = AudioObjectPropertyAddress(
    mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
    mScope: kAudioObjectPropertyScopeGlobal,
    mElement: kAudioObjectPropertyElementMain
)

/// Remove the existing device listener (if any) and register a new one on
/// `newDeviceID`. Also emits the device's current state immediately.
func registerDeviceListener(on newDeviceID: AudioObjectID) {
    // Tear down the previous listener.
    if currentDeviceID != kAudioObjectUnknown {
        AudioObjectRemovePropertyListenerBlock(
            currentDeviceID,
            &deviceAddress,
            DispatchQueue.main,
            deviceListenerBlock
        )
    }

    currentDeviceID = newDeviceID

    guard newDeviceID != kAudioObjectUnknown else {
        emitState(false)
        return
    }

    // Emit the device's current state before the listener fires for the first
    // time so the parent process always has an up-to-date baseline.
    emitState(isDeviceRunning(newDeviceID))

    let status = AudioObjectAddPropertyListenerBlock(
        newDeviceID,
        &deviceAddress,
        DispatchQueue.main,
        deviceListenerBlock
    )
    if status != noErr {
        emitState(false)
        exit(1)
    }
}

/// CoreAudio listener block invoked whenever `kAudioDevicePropertyDeviceIsRunningSomewhere`
/// changes on the current default input device.
let deviceListenerBlock: AudioObjectPropertyListenerBlock = { _, _ in
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
