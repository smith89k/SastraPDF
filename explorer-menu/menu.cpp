// Sastra PDF — File Explorer right-click menu: "Sastra PDF ▸ Make PDF / Combine / Split / Images" for PDFs and pictures.
// An IExplorerCommand with sub-commands. Windows 11 loads it through the SastraPDF.ExplorerMenu package
// (first menu, in a dllhost); Windows 10 and the fallback through HKCU\Software\Classes (classic menu, in
// explorer.exe). A click writes the chosen files to a list file and starts Sastra PDF with
// --sastra-task / --sastra-list (main.js + explorer-menu.js read them).
#include <windows.h>
#include <appmodel.h>
#include <shobjidl_core.h>
#include <shlobj_core.h>
#include <shlguid.h>
#include <shldisp.h>
#include <exdisp.h>
#include <shlwapi.h>
#include <wrl/module.h>
#include <wrl/implements.h>
#include <wrl/client.h>
#include <string>
#include <vector>
#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "oleaut32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "uuid.lib")
#pragma comment(lib, "runtimeobject.lib")
using namespace Microsoft::WRL;

static HMODULE g_module = nullptr;
enum class Act { MakePdf, Combine, Sep1, SplitHere, SplitFolder, Sep2, ImagesHere, ImagesFolder };

static std::string Utf8(const std::wstring& s) {
  if (s.empty()) return {};
  int n = WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0, nullptr, nullptr);
  std::string out(n, '\0');
  WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), out.data(), n, nullptr, nullptr);
  return out;
}

// The PDFs and pictures in the selection (by extension, any case); anything else (folders, other files, virtual items)
// is ignored. Same types as EXTS in explorer-menu.js and the manifest (the build script checks).
static const wchar_t* const PICTURES[] = { L".jpg", L".jpeg", L".jfif", L".png", L".bmp", L".gif", L".webp" };
struct Selection { std::vector<std::wstring> all, pdfs; };   // all = PDFs + pictures, in selection order
static Selection Scan(IShellItemArray* items) {
  Selection s; DWORD n = 0;
  if (!items || FAILED(items->GetCount(&n))) return s;
  for (DWORD i = 0; i < n; i++) {
    ComPtr<IShellItem> it; if (FAILED(items->GetItemAt(i, &it))) continue;
    LPWSTR p = nullptr;
    if (SUCCEEDED(it->GetDisplayName(SIGDN_FILESYSPATH, &p)) && p) {
      const wchar_t* ext = PathFindExtensionW(p);
      bool pdf = lstrcmpiW(ext, L".pdf") == 0, picture = false;
      for (auto e : PICTURES) picture = picture || lstrcmpiW(ext, e) == 0;
      if (pdf || picture) s.all.emplace_back(p);
      if (pdf) s.pdfs.emplace_back(p);
      CoTaskMemFree(p);
    }
  }
  return s;
}

// "Report" from "C:\x\Report.pdf", cut to 32 characters + "…" for the menu.
static std::wstring ShortBase(const std::wstring& path) {
  size_t slash = path.find_last_of(L"\\/");
  std::wstring name = slash == std::wstring::npos ? path : path.substr(slash + 1);
  size_t dot = name.find_last_of(L'.');
  if (dot != std::wstring::npos) name.resize(dot);
  if (name.size() > 32) { name.resize(IS_HIGH_SURROGATE(name[31]) ? 31 : 32); name += L"\u2026"; }
  return name;
}

static std::wstring Title(Act a, const Selection& s) {
  const bool one = s.pdfs.size() == 1;
  switch (a) {
    case Act::MakePdf: return L"Make PDF";
    case Act::Combine: return L"Combine " + std::to_wstring(s.all.size()) + L" files";
    case Act::SplitHere: return L"Split here";
    case Act::SplitFolder: return one ? L"Split to \"" + ShortBase(s.pdfs[0]) + L"\\\"" : L"Split to folders";
    case Act::ImagesHere: return L"Images here (JPG)";
    case Act::ImagesFolder: return one ? L"Images to \"" + ShortBase(s.pdfs[0]) + L"\\\" (JPG)" : L"Images to folders (JPG)";
    default: return L"";
  }
}

// Make PDF: exactly one picture. Combine: 2+ files of any kind. Split / Images (and the lines around them): the PDFs only.
static bool Shown(Act a, const Selection& s) {
  switch (a) {
    case Act::MakePdf: return s.all.size() == 1 && s.pdfs.empty();
    case Act::Combine: return s.all.size() >= 2;
    case Act::Sep1: return s.all.size() >= 2 && !s.pdfs.empty();
    default: return !s.pdfs.empty();
  }
}

static const wchar_t* TaskName(Act a) {
  switch (a) {
    case Act::MakePdf:
    case Act::Combine: return L"combine";
    case Act::SplitHere: return L"split-here";
    case Act::SplitFolder: return L"split-folder";
    case Act::ImagesHere: return L"images-here";
    case Act::ImagesFolder: return L"images-folder";
    default: return L"";
  }
}

static std::wstring EnvVar(const wchar_t* name) {
  std::wstring v(32768, L'\0'); DWORD n = GetEnvironmentVariableW(name, v.data(), (DWORD)v.size());
  if (!n || n >= v.size()) return L"";
  v.resize(n); return v;
}

static std::wstring ModuleDir() {
  std::wstring p(32768, L'\0'); DWORD n = GetModuleFileNameW(g_module, p.data(), (DWORD)p.size());
  if (!n || n >= p.size()) return L"";
  p.resize(n); size_t slash = p.find_last_of(L'\\');
  return slash == std::wstring::npos ? L"" : p.substr(0, slash);
}

// <install>\resources\explorer-menu\SastraMenu.dll → <install>\Sastra PDF.exe.
// SASTRA_MENU_EXE replaces it in the test harness only (Explorer never has it set).
static std::wstring ExePath() {
  std::wstring test = EnvVar(L"SASTRA_MENU_EXE"); if (!test.empty()) return test;
  std::wstring dir = ModuleDir(); if (dir.empty()) return L"";
  std::wstring rel = dir + L"\\..\\..\\Sastra PDF.exe", full(32768, L'\0');
  DWORD n = GetFullPathNameW(rel.c_str(), (DWORD)full.size(), full.data(), nullptr);
  if (!n || n >= full.size()) return L"";
  full.resize(n); return full;
}

// %TEMP%\Sastra PDF\menu-<pid>-<tick>-<k>.txt, UTF-8, one path per line. A list file because one command
// line holds only 32 767 characters. main.js reads it and deletes it.
static std::wstring WriteList(const std::vector<std::wstring>& paths) {
  std::wstring tmp(MAX_PATH + 1, L'\0'); DWORD n = GetTempPathW((DWORD)tmp.size(), tmp.data());
  if (!n || n > MAX_PATH) return L"";
  tmp.resize(n);   // ends with a backslash
  std::wstring dir = tmp + L"Sastra PDF"; CreateDirectoryW(dir.c_str(), nullptr);
  std::string body; for (auto& p : paths) { body += Utf8(p); body += '\n'; }
  for (int k = 0; k < 20; k++) {
    std::wstring file = dir + L"\\menu-" + std::to_wstring(GetCurrentProcessId()) + L"-" + std::to_wstring(GetTickCount64()) + L"-" + std::to_wstring(k) + L".txt";
    HANDLE f = CreateFileW(file.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (f == INVALID_HANDLE_VALUE) { if (GetLastError() == ERROR_FILE_EXISTS) continue; return L""; }
    DWORD w = 0; BOOL ok = WriteFile(f, body.data(), (DWORD)body.size(), &w, nullptr) && w == body.size();
    CloseHandle(f);
    if (ok) return file;
    DeleteFileW(file.c_str()); return L"";
  }
  return L"";
}

// Ask Explorer (the desktop) to start the app, so it runs as a normal app and not inside this add-on's
// package identity. Raymond Chen's "launch from the shell" route.
static HRESULT ShellLaunch(const std::wstring& exe, const std::wstring& args, const std::wstring& dir) {
  ComPtr<IShellWindows> windows;
  HRESULT hr = CoCreateInstance(CLSID_ShellWindows, nullptr, CLSCTX_LOCAL_SERVER, IID_PPV_ARGS(&windows));
  if (FAILED(hr)) return hr;
  VARIANT loc; VariantInit(&loc); loc.vt = VT_I4; loc.lVal = CSIDL_DESKTOP;
  VARIANT empty; VariantInit(&empty);
  long hwnd = 0; ComPtr<IDispatch> disp;
  hr = windows->FindWindowSW(&loc, &empty, SWC_DESKTOP, &hwnd, SWFO_NEEDDISPATCH, &disp);
  if (hr != S_OK || !disp) return FAILED(hr) ? hr : E_FAIL;
  ComPtr<IServiceProvider> sp; hr = disp.As(&sp); if (FAILED(hr)) return hr;
  ComPtr<IShellBrowser> browser; hr = sp->QueryService(SID_STopLevelBrowser, IID_PPV_ARGS(&browser)); if (FAILED(hr)) return hr;
  ComPtr<IShellView> view; hr = browser->QueryActiveShellView(&view); if (FAILED(hr)) return hr;
  ComPtr<IDispatch> viewDisp; hr = view->GetItemObject(SVGIO_BACKGROUND, IID_PPV_ARGS(&viewDisp)); if (FAILED(hr)) return hr;
  ComPtr<IShellFolderViewDual> folderView; hr = viewDisp.As(&folderView); if (FAILED(hr)) return hr;
  ComPtr<IDispatch> appDisp; hr = folderView->get_Application(&appDisp); if (FAILED(hr)) return hr;
  ComPtr<IShellDispatch2> shell; hr = appDisp.As(&shell); if (FAILED(hr)) return hr;
  BSTR file = SysAllocString(exe.c_str());
  VARIANT vArgs, vDir, vOp, vShow;
  VariantInit(&vArgs); vArgs.vt = VT_BSTR; vArgs.bstrVal = SysAllocString(args.c_str());
  VariantInit(&vDir); vDir.vt = VT_BSTR; vDir.bstrVal = SysAllocString(dir.c_str());
  VariantInit(&vOp); vOp.vt = VT_BSTR; vOp.bstrVal = SysAllocString(L"open");
  VariantInit(&vShow); vShow.vt = VT_I4; vShow.lVal = SW_SHOWNORMAL;
  hr = shell->ShellExecute(file, vArgs, vDir, vOp, vShow);
  SysFreeString(file); VariantClear(&vArgs); VariantClear(&vDir); VariantClear(&vOp);
  return hr;
}

static HRESULT DirectLaunch(const std::wstring& exe, const std::wstring& args, const std::wstring& dir) {
  std::wstring cmd = L"\"" + exe + L"\" " + args;
  STARTUPINFOW si{ sizeof(si) }; PROCESS_INFORMATION pi{};
  if (!CreateProcessW(exe.c_str(), cmd.data(), nullptr, nullptr, FALSE, 0, nullptr, dir.c_str(), &si, &pi))
    return HRESULT_FROM_WIN32(GetLastError());
  CloseHandle(pi.hThread); CloseHandle(pi.hProcess); return S_OK;
}

static void Oops() {
  MessageBoxW(nullptr, L"Sastra PDF is missing or damaged. Please reinstall it.", L"Sastra PDF", MB_OK | MB_ICONERROR | MB_SETFOREGROUND);
}

// Inside the Microsoft Store package (any package but the installer's sparse SastraPDF.ExplorerMenu) this DLL runs in a
// helper process with that package's identity. The app must run inside the package too (its own temp and settings
// folders), and a packaged process's children do: start it directly. No package (classic menu) or the sparse one:
// through Explorer, so the app never runs inside the add-on's identity.
static bool InStorePackage() {
  UINT32 len = 0;
  if (GetCurrentPackageFamilyName(&len, nullptr) != ERROR_INSUFFICIENT_BUFFER) return false;   // no package
  std::wstring family(len, L'\0');
  if (GetCurrentPackageFamilyName(&len, family.data()) != ERROR_SUCCESS) return false;
  return family.rfind(L"SastraPDF.ExplorerMenu_", 0) != 0;
}

static HRESULT Launch(Act a, const std::vector<std::wstring>& paths) {
  if (paths.empty()) return S_OK;
  const bool test = !EnvVar(L"SASTRA_MENU_EXE").empty();
  std::wstring exe = ExePath();
  if (exe.empty() || GetFileAttributesW(exe.c_str()) == INVALID_FILE_ATTRIBUTES) { Oops(); return HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND); }
  std::wstring list = WriteList(paths);
  if (list.empty()) { Oops(); return E_FAIL; }
  std::wstring args = std::wstring(L"--sastra-task=") + TaskName(a) + L" \"--sastra-list=" + list + L"\"";
  std::wstring dir = exe.substr(0, exe.find_last_of(L'\\'));
  HRESULT hr = test || InStorePackage() ? E_FAIL : ShellLaunch(exe, args, dir);
  if (FAILED(hr)) hr = DirectLaunch(exe, args, dir);
  if (FAILED(hr)) { DeleteFileW(list.c_str()); Oops(); }
  return hr;
}

class Item : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IExplorerCommand> {
  Act act_;
  bool Separator() const { return act_ == Act::Sep1 || act_ == Act::Sep2; }
public:
  explicit Item(Act a) : act_(a) {}
  IFACEMETHODIMP GetTitle(IShellItemArray* items, LPWSTR* name) override {
    *name = nullptr; return SHStrDupW(Separator() ? L"" : Title(act_, Scan(items)).c_str(), name);
  }
  IFACEMETHODIMP GetIcon(IShellItemArray*, LPWSTR* icon) override { *icon = nullptr; return E_NOTIMPL; }
  IFACEMETHODIMP GetToolTip(IShellItemArray*, LPWSTR* tip) override { *tip = nullptr; return E_NOTIMPL; }
  IFACEMETHODIMP GetCanonicalName(GUID* g) override { *g = GUID_NULL; return S_OK; }
  IFACEMETHODIMP GetState(IShellItemArray* items, BOOL, EXPCMDSTATE* state) override {
    *state = Shown(act_, Scan(items)) ? ECS_ENABLED : ECS_HIDDEN; return S_OK;
  }
  IFACEMETHODIMP Invoke(IShellItemArray* items, IBindCtx*) override {
    if (Separator()) return S_OK;
    Selection s = Scan(items);
    return Launch(act_, act_ == Act::MakePdf || act_ == Act::Combine ? s.all : s.pdfs);   // Split / Images: the PDFs only
  }
  IFACEMETHODIMP GetFlags(EXPCMDFLAGS* flags) override { *flags = Separator() ? ECF_ISSEPARATOR : ECF_DEFAULT; return S_OK; }
  IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand** e) override { *e = nullptr; return E_NOTIMPL; }
};

class Enum : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IEnumExplorerCommand> {
  std::vector<ComPtr<IExplorerCommand>> cmds_; ULONG pos_ = 0;
public:
  Enum() {
    for (Act a : { Act::MakePdf, Act::Combine, Act::Sep1, Act::SplitHere, Act::SplitFolder, Act::Sep2, Act::ImagesHere, Act::ImagesFolder })
      cmds_.push_back(Make<Item>(a));
  }
  IFACEMETHODIMP Next(ULONG celt, IExplorerCommand** out, ULONG* fetched) override {
    ULONG k = 0;
    while (k < celt && pos_ < cmds_.size()) { cmds_[pos_].CopyTo(&out[k]); k++; pos_++; }
    if (fetched) *fetched = k;
    return k == celt ? S_OK : S_FALSE;
  }
  IFACEMETHODIMP Skip(ULONG n) override { pos_ += n; return pos_ <= cmds_.size() ? S_OK : S_FALSE; }
  IFACEMETHODIMP Reset() override { pos_ = 0; return S_OK; }
  IFACEMETHODIMP Clone(IEnumExplorerCommand** e) override { *e = nullptr; return E_NOTIMPL; }
};

class __declspec(uuid("47a2af3d-bd25-4ebd-949f-d0e6b6bd5004")) Root
  : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IExplorerCommand> {
public:
  IFACEMETHODIMP GetTitle(IShellItemArray*, LPWSTR* name) override { return SHStrDupW(L"Sastra PDF", name); }
  IFACEMETHODIMP GetIcon(IShellItemArray*, LPWSTR* icon) override {
    *icon = nullptr; std::wstring exe = ExePath(); return exe.empty() ? E_FAIL : SHStrDupW((exe + L",0").c_str(), icon);
  }
  IFACEMETHODIMP GetToolTip(IShellItemArray*, LPWSTR* tip) override { *tip = nullptr; return E_NOTIMPL; }
  IFACEMETHODIMP GetCanonicalName(GUID* g) override { *g = __uuidof(Root); return S_OK; }
  IFACEMETHODIMP GetState(IShellItemArray* items, BOOL, EXPCMDSTATE* state) override {
    *state = Scan(items).all.empty() ? ECS_HIDDEN : ECS_ENABLED; return S_OK;
  }
  IFACEMETHODIMP Invoke(IShellItemArray*, IBindCtx*) override { return E_NOTIMPL; }
  IFACEMETHODIMP GetFlags(EXPCMDFLAGS* flags) override { *flags = ECF_HASSUBCOMMANDS; return S_OK; }
  IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand** e) override { return Make<Enum>().CopyTo(e); }
};
CoCreatableClass(Root);

STDAPI DllCanUnloadNow() { return Module<InProc>::GetModule().GetObjectCount() == 0 ? S_OK : S_FALSE; }
STDAPI DllGetClassObject(REFCLSID rclsid, REFIID riid, LPVOID* ppv) { return Module<InProc>::GetModule().GetClassObject(rclsid, riid, ppv); }
BOOL APIENTRY DllMain(HMODULE h, DWORD reason, LPVOID) {
  if (reason == DLL_PROCESS_ATTACH) { g_module = h; DisableThreadLibraryCalls(h); }
  return TRUE;
}
