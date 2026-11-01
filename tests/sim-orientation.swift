import Foundation

let args = CommandLine.arguments
guard args.count == 3, let orientation = UInt32(args[2]) else {
  FileHandle.standardError.write("usage: sim-orientation <udid> <1|2|3|4>\n".data(using: .utf8)!)
  exit(2)
}
guard dlopen("/Library/Developer/PrivateFrameworks/CoreSimulator.framework/CoreSimulator", RTLD_NOW) != nil,
  let contextClass = NSClassFromString("SimServiceContext") as AnyObject?
else { fatalError("CoreSimulator is not available") }

let developerDir = ProcessInfo.processInfo.environment["DEVELOPER_DIR"] ?? "/Applications/Xcode.app/Contents/Developer"
let context = contextClass.perform(
  NSSelectorFromString("sharedServiceContextForDeveloperDir:error:"), with: developerDir, with: nil
)!.takeUnretainedValue()
let deviceSet = context.perform(NSSelectorFromString("defaultDeviceSetWithError:"), with: nil)!.takeUnretainedValue()
guard let device = (deviceSet.value(forKey: "devices") as! [AnyObject])
  .first(where: { ($0.value(forKey: "UDID") as! UUID).uuidString == args[1].uppercased() })
else { fatalError("no simulator \(args[1])") }

typealias Lookup = @convention(c) (AnyObject, Selector, NSString, UnsafeMutableRawPointer?) -> mach_port_t
let lookup = NSSelectorFromString("lookup:error:")
let port = unsafeBitCast(class_getMethodImplementation(object_getClass(device), lookup)!, to: Lookup.self)(
  device, lookup, "PurpleWorkspacePort", nil)
guard port != 0 else { fatalError("the simulator has no PurpleWorkspacePort; is it booted?") }

let size = 80
let message = UnsafeMutableRawPointer.allocate(byteCount: size, alignment: 8)
memset(message, 0, size)
message.storeBytes(of: UInt32(MACH_MSG_TYPE_COPY_SEND), toByteOffset: 0, as: UInt32.self)
message.storeBytes(of: UInt32(size), toByteOffset: 4, as: UInt32.self)
message.storeBytes(of: port, toByteOffset: 8, as: UInt32.self)
message.storeBytes(of: Int32(123), toByteOffset: 20, as: Int32.self)
message.storeBytes(of: UInt32(50 | 0x20000), toByteOffset: 24, as: UInt32.self)
message.storeBytes(of: UInt32(4), toByteOffset: 72, as: UInt32.self)
message.storeBytes(of: orientation, toByteOffset: 76, as: UInt32.self)
let result = mach_msg(
  message.assumingMemoryBound(to: mach_msg_header_t.self), MACH_SEND_MSG, mach_msg_size_t(size), 0, 0, 0, 0)
guard result == KERN_SUCCESS else { fatalError("mach_msg failed: \(result)") }
