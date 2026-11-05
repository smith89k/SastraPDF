// SastraStoreUpdate.exe — talks to the Microsoft Store for the Store copy of the app (Electron can't reach
// Windows.Services.Store). Started by main.js (store-update.js) from inside the package, so it has the package's identity.
// Nothing app-specific here, so another Store app can use it as it is.
//   SastraStoreUpdate.exe check                  → {"event":"check","count":1,"version":"1.4.0.0","silent":true}
//   SastraStoreUpdate.exe download [--hwnd=N]    → {"event":"progress","done":1,"total":9,"fraction":0.1} … {"event":"done","state":"completed"}
//   SastraStoreUpdate.exe install  [--hwnd=N]    → {"event":"done","state":"completed"} (Windows closes the app on the way)
// Every run starts with {"event":"start","package":"Name_hash"} ("" = not running inside a package). One JSON line per event; any failure → {"event":"error","code":"0x80070005"} and exit code 1. With no permission for a
// quiet download or install (the Store's "Update apps automatically" is off, or a metered network) Windows asks in its own
// box, over the window --hwnd names.
#include <windows.h>
#include <shobjidl_core.h>
#include <winrt/base.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.ApplicationModel.h>
#include <winrt/Windows.Services.Store.h>
#include <cstdio>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>

using namespace winrt;
using namespace Windows::Foundation;
using namespace Windows::Foundation::Collections;
using namespace Windows::Services::Store;

static void line(const std::string &s) { fputs(s.c_str(), stdout); fputc('\n', stdout); fflush(stdout); }

static const char *stateName(StorePackageUpdateState s) {
  switch (s) {
    case StorePackageUpdateState::Completed: return "completed";
    case StorePackageUpdateState::Canceled: return "cancelled";
    case StorePackageUpdateState::ErrorLowBattery: return "low-battery";
    case StorePackageUpdateState::ErrorWiFiRecommended:
    case StorePackageUpdateState::ErrorWiFiRequired: return "wifi";
    default: return "failed";
  }
}

// Windows' own boxes need a window to stand on: a desktop app has to say which.
static void attach(const StoreContext &ctx, uint64_t hwnd) {
  if (hwnd) check_hresult(ctx.as<IInitializeWithWindow>()->Initialize(reinterpret_cast<HWND>(static_cast<uintptr_t>(hwnd))));
}

static int finish(IAsyncOperationWithProgress<StorePackageUpdateResult, StorePackageUpdateStatus> op) {
  op.Progress([](auto const &, StorePackageUpdateStatus const &p) {
    char b[160];
    snprintf(b, sizeof b, "{\"event\":\"progress\",\"done\":%llu,\"total\":%llu,\"fraction\":%.4f}",
      static_cast<unsigned long long>(p.PackageBytesDownloaded), static_cast<unsigned long long>(p.PackageDownloadSizeInBytes), p.PackageDownloadProgress);
    line(b);
  });
  const auto result = op.get();
  line(std::string("{\"event\":\"done\",\"state\":\"") + stateName(result.OverallState()) + "\"}");
  return 0;
}

int main(int argc, char **argv) {
  const std::string cmd = argc > 1 ? argv[1] : "";
  uint64_t hwnd = 0;
  for (int i = 2; i < argc; i++) if (!strncmp(argv[i], "--hwnd=", 7)) hwnd = _strtoui64(argv[i] + 7, nullptr, 10);
  try {
    init_apartment();
    std::string package;
    try { package = to_string(Windows::ApplicationModel::Package::Current().Id().FamilyName()); } catch (...) {}
    line("{\"event\":\"start\",\"package\":\"" + package + "\"}");
    const StoreContext ctx = StoreContext::GetDefault();
    attach(ctx, hwnd);
    const auto updates = ctx.GetAppAndOptionalStorePackageUpdatesAsync().get();
    const bool silent = ctx.CanSilentlyDownloadStorePackageUpdates();
    if (cmd == "check") {
      std::string version;
      if (updates.Size() > 0) {
        const auto v = updates.GetAt(0).Package().Id().Version();
        version = std::to_string(v.Major) + "." + std::to_string(v.Minor) + "." + std::to_string(v.Build) + "." + std::to_string(v.Revision);
      }
      line("{\"event\":\"check\",\"count\":" + std::to_string(updates.Size()) + ",\"version\":\"" + version + "\",\"silent\":" + (silent ? "true" : "false") + "}");
      return 0;
    }
    if (updates.Size() == 0) { line("{\"event\":\"done\",\"state\":\"nothing\"}"); return 0; }
    if (cmd == "download") return finish(silent ? ctx.TrySilentDownloadStorePackageUpdatesAsync(updates) : ctx.RequestDownloadStorePackageUpdatesAsync(updates));
    if (cmd == "install") return finish(silent ? ctx.TrySilentDownloadAndInstallStorePackageUpdatesAsync(updates) : ctx.RequestDownloadAndInstallStorePackageUpdatesAsync(updates));
    line("{\"event\":\"error\",\"code\":\"usage\"}");
    return 2;
  } catch (hresult_error const &e) {
    char b[80]; snprintf(b, sizeof b, "{\"event\":\"error\",\"code\":\"0x%08X\"}", static_cast<unsigned>(e.code().value));
    line(b);
    return 1;
  } catch (...) {
    line("{\"event\":\"error\",\"code\":\"unknown\"}");
    return 1;
  }
}
