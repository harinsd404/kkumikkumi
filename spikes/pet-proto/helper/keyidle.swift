// 키보드 유휴 시간 헬퍼(스파이크). 마지막 keyDown 이후 경과 초만 stdout에 한 줄씩 쓴다.
// 키 내용/키 코드는 읽지도 저장하지도 않는다. 이벤트 탭(전역 훅)은 쓰지 않는다.
//   keyidle --preflight     입력 모니터링 권한이 이미 있는지(프롬프트 없음): granted/denied
//   keyidle --once          한 번 출력하고 종료
//   keyidle [interval_ms]   interval마다 출력(기본 1000). 부모가 사라지면 종료.
import CoreGraphics
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
let args = CommandLine.arguments

func secondsSinceKey() -> Double {
  // kCGEventSourceStateHIDSystemState(1), kCGEventKeyDown(10): SDK 헤더로 확인
  CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: .keyDown)
}

if args.contains("--preflight") {
  print(CGPreflightListenEventAccess() ? "granted" : "denied")
  exit(0)
}
if args.contains("--once") {
  print(String(format: "%.3f", secondsSinceKey()))
  exit(0)
}

let intervalMs = args.count > 1 ? max(100, Int(args[1]) ?? 1000) : 1000
let parent = getppid()
while true {
  if getppid() != parent { exit(0) } // 부모(Electron)가 죽으면 고아로 남지 않는다
  print(String(format: "%.3f", secondsSinceKey()))
  usleep(useconds_t(intervalMs * 1000))
}
