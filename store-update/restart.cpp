// SastraRestart.node — asks Windows to open the app again after a package update closes it. RegisterApplicationRestart
// works only on the process that calls it, so this has to run inside Sastra PDF.exe: main.js loads it with process.dlopen
// right before an install, and loading it is the whole job. No Node.js headers needed: it takes and returns only the
// module's exports, and Node.js finds it by this one exported name.
#include <windows.h>

// Only an update reopens it: not a crash, not a hang, not a Windows restart.
extern "C" __declspec(dllexport) void *napi_register_module_v1(void *, void *exports) {
  RegisterApplicationRestart(nullptr, RESTART_NO_CRASH | RESTART_NO_HANG | RESTART_NO_REBOOT);
  return exports;
}
