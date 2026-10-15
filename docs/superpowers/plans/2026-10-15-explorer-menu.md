# Explorer Right-Click Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-click PDFs in File Explorer → **Sastra PDF ▸** Combine N files / Split here / Split to "name\" /
Images here (JPG) / Images to "name\" (JPG), in the first Windows 11 menu (classic menu on Windows 10 and as fallback).

**Architecture:** A small C++ `IExplorerCommand` DLL (`explorer-menu/`) builds the menu and, on a click, writes the
chosen PDFs to a list file and starts `Sastra PDF.exe --sastra-task=<task> --sastra-list=<file>`. On Windows 11 it is
loaded through an unsigned sparse package (needs one UAC "Yes" at install); otherwise through HKCU registry keys.
`explorer-menu.js` (Electron-free) registers/unregisters it (called by the NSIS installer through
`Sastra PDF.exe --explorer-menu=…`) and parses task arguments. main.js sends Combine to the main window and
Split/Images to a new small task window (`app/task.html` + `app/task.js`); shared naming/rendering moves to
`app/pdfops.js`. Spec: `docs/superpowers/specs/2026-10-15-explorer-menu-design.md`.

**Tech Stack:** C++17 + WRL (Windows SDK), MSVC Build Tools 2026 (v145), makeappx; Electron 44.7.2, pdf.js 6.4.299,
pdf-lib 1.17.1; electron-builder 26.15.3 NSIS; tests: a C++ harness, plain Node, Playwright (`playwright-core`) — all
outside the project.

## Global Constraints
- CLSID `{47a2af3d-bd25-4ebd-949f-d0e6b6bd5004}`; package `SastraPDF.ExplorerMenu`, Version `1.0.0.0`, Publisher
  `CN=Sastra PDF, OID.2.25.311729368913984317654407730594956997722=1`. The build script fails if menu.cpp,
  AppxManifest.xml and explorer-menu.js disagree.
- Task names: `combine`, `split-here`, `split-folder`, `images-here`, `images-folder`. List files live only in
  `%TEMP%\Sastra PDF\` and are named `menu-*.txt` (UTF-8, one path per line); anything else is ignored and never deleted.
- Names: split `<base>-<n>.pdf` (n = 1…, unpadded); images `<base>_page-<nn>.jpg` (padded to the page count's digits);
  folder = `<pdf folder>\<base without trailing dots/spaces>\`. JPG: 300 dpi, quality 0.92, white background; a page is
  drawn smaller when it would pass 16 384 px on a side or 64 megapixels (the window says so).
- Never overwrite silently: ONE Replace / Keep both (default) / Cancel question per menu click.
- No network, no new libraries in the app. Khmer must work everywhere (file names, titles, list files).
- Security: contextIsolation, sandbox, CSP as in `app/index.html` for every new page; `make-dir` makes only
  `<existing folder>\<one name>`.
- Tests never touch the user's real menu except Task 6 (with the user, who clicks UAC and right-clicks). Before Task 6
  the user must close their own Sastra PDF (the single-instance lock would hand test runs to it).
- Electron launches: `unset ELECTRON_RUN_AS_NODE` (bash) / `Remove-Item Env:ELECTRON_RUN_AS_NODE` (PowerShell);
  Playwright launches use `--user-data-dir=<scratch>`; poll with `page.evaluate` (CSP blocks `waitForFunction`).
- `<scratch>` = `C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\77cc72c7-39f4-41f5-bdf5-3b1c2d3b3c66\scratchpad`;
  tests in `<scratch>\t\`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch: `feat/explorer-menu`.

## File Structure
| File | Status | Responsibility |
|---|---|---|
| `explorer-menu/menu.cpp`, `menu.def` | new | The menu DLL (titles, visibility, list file, launching the app) |
| `explorer-menu/AppxManifest.xml`, `explorer-menu/Assets/*.png` | new | The sparse package that puts the DLL in the Windows 11 menu |
| `scripts/build-explorer-menu.js` | new | Builds `explorer-menu/out/SastraMenu.dll` + `SastraPDF.ExplorerMenu.msix` |
| `explorer-menu.js` | new | Registration (package / classic / state / release) + task-argument parsing; no Electron |
| `build/installer.nsh` | new | NSIS hooks calling `--explorer-menu=install / uninstall / release` |
| `app/pdfops.js` | new | Shared: pdf.js loading, `baseName`, `rangeLabel`, `imageName`, `renderPage` |
| `app/task.html`, `app/task.js` | new | The small task window that runs Split/Images jobs |
| `main.js` | modify | `--explorer-menu` dispatch, task routing, task window, `make-dir`, `resolve-names`, save start folder |
| `preload.js` | modify | `makeDir`, `resolveNames`, `taskReady`, `onTaskBatch`, `onCombinePaths`, `saveDialog(…, dir)` |
| `app/index.html` | modify | Uses pdfops.js; `combinePaths`; `d.saveDir` for Save As |
| `package.json`, `.gitignore`, `.github/workflows/release.yml` | modify | Build + package the menu |
| `CLAUDE.md`, `README.md`, `docs/HISTORY.md` | modify | Document it |

---

### Task 1: The menu DLL, its package and the build script

**Files:**
- Create: `explorer-menu/menu.cpp`, `explorer-menu/menu.def`, `explorer-menu/AppxManifest.xml`,
  `explorer-menu/Assets/Square150x150Logo.png`, `Square44x44Logo.png`, `StoreLogo.png`, `scripts/build-explorer-menu.js`
- Modify: `.gitignore` (add `explorer-menu/out/`), `package.json` (script `build:menu`)
- Test: `<scratch>\t\harness\menu-harness.cpp`, `stub.cpp`, `build.bat`, `make-files.js`

**Interfaces:**
- Produces: `explorer-menu/out/SastraMenu.dll` (exports `DllGetClassObject`, `DllCanUnloadNow`; class = CLSID above,
  `IExplorerCommand` root "Sastra PDF" with 7 sub-commands in this order: Combine, separator, Split here, Split to…,
  separator, Images here, Images to…); `explorer-menu/out/SastraPDF.ExplorerMenu.msix`.
- A click runs: `"<install>\Sastra PDF.exe" --sastra-task=<task> "--sastra-list=%TEMP%\Sastra PDF\menu-<pid>-<tick>-<k>.txt"`
  (exe = DLL folder `\..\..\Sastra PDF.exe`; env `SASTRA_MENU_EXE` overrides it and forces a direct CreateProcess —
  harness only).

- [ ] **Step 1: Write the harness, the stub and the test files**

`<scratch>\t\harness\stub.cpp` — records how it was started:
```cpp
// Test stub: writes its own command line (UTF-8) to the file named by SASTRA_STUB_OUT.
#include <windows.h>
int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
  wchar_t out[32768]; if (!GetEnvironmentVariableW(L"SASTRA_STUB_OUT", out, 32768)) return 1;
  const wchar_t* cl = GetCommandLineW();
  int n = WideCharToMultiByte(CP_UTF8, 0, cl, -1, nullptr, 0, nullptr, nullptr);
  char* buf = (char*)HeapAlloc(GetProcessHeap(), 0, n);
  WideCharToMultiByte(CP_UTF8, 0, cl, -1, buf, n, nullptr, nullptr);
  HANDLE f = CreateFileW(out, GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, 0, nullptr);
  DWORD w; WriteFile(f, buf, n - 1, &w, nullptr); CloseHandle(f); return 0;
}
```

`<scratch>\t\harness\menu-harness.cpp`:
```cpp
// Test harness for SastraMenu.dll (not shipped): loads it in-process like Explorer and checks the menu.
// Usage: menu-harness.exe <SastraMenu.dll> <folder with test files> <stub.exe>
#include <windows.h>
#include <shobjidl_core.h>
#include <shlobj_core.h>
#include <wrl/client.h>
#include <io.h>
#include <fcntl.h>
#include <cstdio>
#include <string>
#include <vector>
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "shell32.lib")
using Microsoft::WRL::ComPtr;

static int fails = 0;
static void check(const std::wstring& name, bool ok, const std::wstring& info = L"") {
  wprintf(L"%s  %s%s%s\n", ok ? L"PASS" : L"FAIL", name.c_str(), info.empty() ? L"" : L"  -- ", info.c_str()); if (!ok) fails++;
}
static std::wstring FromUtf8(const std::string& s) {
  int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0); std::wstring w(n, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), w.data(), n); return w;
}
static std::string ReadAll(const std::wstring& file) {
  HANDLE f = CreateFileW(file.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING, 0, nullptr);
  if (f == INVALID_HANDLE_VALUE) return {};
  std::string s(GetFileSize(f, nullptr), '\0'); DWORD r = 0; ReadFile(f, s.data(), (DWORD)s.size(), &r, nullptr); CloseHandle(f); s.resize(r); return s;
}
static ComPtr<IShellItemArray> Sel(const std::wstring& dir, const std::vector<std::wstring>& names) {
  std::vector<PIDLIST_ABSOLUTE> ids;
  for (auto& n : names) { PIDLIST_ABSOLUTE id = nullptr; if (SUCCEEDED(SHParseDisplayName((dir + L"\\" + n).c_str(), nullptr, &id, 0, nullptr))) ids.push_back(id); }
  ComPtr<IShellItemArray> arr; SHCreateShellItemArrayFromIDLists((UINT)ids.size(), (PCIDLIST_ABSOLUTE_ARRAY)ids.data(), &arr);
  for (auto id : ids) CoTaskMemFree(id);
  return arr;
}
struct Row { std::wstring title; EXPCMDSTATE state = ECS_ENABLED; EXPCMDFLAGS flags = ECF_DEFAULT; ComPtr<IExplorerCommand> cmd; };
static std::vector<Row> Rows(IExplorerCommand* root, IShellItemArray* sel) {
  std::vector<Row> rows; ComPtr<IEnumExplorerCommand> e; if (FAILED(root->EnumSubCommands(&e))) return rows;
  IExplorerCommand* c = nullptr; ULONG got = 0;
  while (e->Next(1, &c, &got) == S_OK && got == 1) {
    Row r; r.cmd.Attach(c); LPWSTR t = nullptr;
    if (SUCCEEDED(c->GetTitle(sel, &t)) && t) { r.title = t; CoTaskMemFree(t); }
    c->GetState(sel, TRUE, &r.state); c->GetFlags(&r.flags); rows.push_back(r);
  }
  return rows;
}
// visible rows as "A|—|B" (— = separator)
static std::wstring Visible(const std::vector<Row>& rows) {
  std::wstring s;
  for (auto& r : rows) { if (r.state & ECS_HIDDEN) continue; if (!s.empty()) s += L"|"; s += (r.flags & ECF_ISSEPARATOR) ? L"—" : r.title; }
  return s;
}
static std::wstring InvokeAndRead(IExplorerCommand* cmd, IShellItemArray* sel, const std::wstring& out) {
  DeleteFileW(out.c_str()); cmd->Invoke(sel, nullptr);
  for (int i = 0; i < 100; i++) { Sleep(50); std::string s = ReadAll(out); if (!s.empty()) { Sleep(100); return FromUtf8(ReadAll(out)); } }
  return L"";
}
static std::wstring ListOf(const std::wstring& cmdline) {   // the list file named in --sastra-list="…"
  size_t a = cmdline.find(L"--sastra-list="); if (a == std::wstring::npos) return L"";
  a += 14; size_t b = cmdline.find(L'"', a); return cmdline.substr(a, b == std::wstring::npos ? std::wstring::npos : b - a);
}

int wmain(int argc, wchar_t** argv) {
  _setmode(_fileno(stdout), _O_U8TEXT);
  if (argc < 4) { wprintf(L"usage: menu-harness <dll> <dir> <stub.exe>\n"); return 2; }
  std::wstring dll = argv[1], dir = argv[2], stub = argv[3];
  CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  HMODULE h = LoadLibraryW(dll.c_str()); check(L"DLL loads", h != nullptr); if (!h) return 1;
  auto get = (HRESULT(STDAPICALLTYPE*)(REFCLSID, REFIID, void**))GetProcAddress(h, "DllGetClassObject");
  check(L"DllGetClassObject exported", get != nullptr && GetProcAddress(h, "DllCanUnloadNow") != nullptr); if (!get) return 1;
  CLSID clsid; CLSIDFromString(L"{47a2af3d-bd25-4ebd-949f-d0e6b6bd5004}", &clsid);
  ComPtr<IClassFactory> cf; check(L"class factory for the CLSID", SUCCEEDED(get(clsid, IID_PPV_ARGS(&cf))));
  ComPtr<IExplorerCommand> root; if (cf) cf->CreateInstance(nullptr, IID_PPV_ARGS(&root));
  check(L"root is an IExplorerCommand", root != nullptr); if (!root) return 1;

  auto one = Sel(dir, { L"Report.pdf" });
  LPWSTR t = nullptr; root->GetTitle(one.Get(), &t); std::wstring title = t ? t : L""; CoTaskMemFree(t);
  check(L"root title", title == L"Sastra PDF", title);
  LPWSTR ic = nullptr; root->GetIcon(one.Get(), &ic); std::wstring icon = ic ? ic : L""; CoTaskMemFree(ic);
  check(L"root icon = <install>\\Sastra PDF.exe,0", icon.size() > 17 && icon.compare(icon.size() - 17, 17, L"\\Sastra PDF.exe,0") == 0, icon);
  EXPCMDFLAGS rf = 0; root->GetFlags(&rf); check(L"root has sub-commands", rf == ECF_HASSUBCOMMANDS);
  EXPCMDSTATE rs = ECS_HIDDEN; root->GetState(one.Get(), TRUE, &rs); check(L"root shown for a PDF", rs == ECS_ENABLED);

  auto rows1 = Rows(root.Get(), one.Get());
  check(L"7 sub-commands", rows1.size() == 7, std::to_wstring(rows1.size()));
  check(L"one PDF: no Combine", Visible(rows1) == L"Split here|Split to \"Report\\\"|—|Images here (JPG)|Images to \"Report\\\" (JPG)", Visible(rows1));

  auto three = Sel(dir, { L"Test 02.pdf", L"Test 10.pdf", L"Test 01.pdf" });
  auto rows3 = Rows(root.Get(), three.Get());
  check(L"three PDFs", Visible(rows3) == L"Combine 3 files|—|Split here|Split to folders|—|Images here (JPG)|Images to folders (JPG)", Visible(rows3));

  auto mixed = Sel(dir, { L"Report.pdf", L"notes.txt" });
  check(L"PDF + text file: counts only the PDF", Visible(Rows(root.Get(), mixed.Get())) == Visible(rows1));
  auto none = Sel(dir, { L"notes.txt" });
  rs = ECS_ENABLED; root->GetState(none.Get(), TRUE, &rs); check(L"no PDF: root hidden", rs == ECS_HIDDEN);

  const std::wstring kname = L"ឯកសាររបាយការណ៍ប្រចាំឆ្នាំ២០២៦ផ្នែកហិរញ្ញវត្ថុនិងរដ្ឋបាល";
  auto km = Sel(dir, { kname + L".pdf" });
  auto rowsK = Rows(root.Get(), km.Get());
  check(L"long Khmer name cut to 32 + …", rowsK.size() == 7 && rowsK[3].title == L"Split to \"" + kname.substr(0, 32) + L"…\\\"", rowsK.size() == 7 ? rowsK[3].title : L"");

  // clicks: SASTRA_MENU_EXE = the stub, which writes its command line to SASTRA_STUB_OUT
  std::wstring out = dir + L"\\stub-out.txt";
  SetEnvironmentVariableW(L"SASTRA_MENU_EXE", stub.c_str()); SetEnvironmentVariableW(L"SASTRA_STUB_OUT", out.c_str());
  std::wstring cl = InvokeAndRead(rows3[0].cmd.Get(), three.Get(), out);
  check(L"Combine starts the app with --sastra-task=combine", cl.find(L"--sastra-task=combine") != std::wstring::npos, cl);
  std::wstring list = ListOf(cl);
  wchar_t tmp[MAX_PATH + 1]; GetTempPathW(MAX_PATH + 1, tmp);
  check(L"list file in %TEMP%\\Sastra PDF\\menu-*.txt", list.rfind(std::wstring(tmp) + L"Sastra PDF\\menu-", 0) == 0 && list.size() > 4 && list.substr(list.size() - 4) == L".txt", list);
  check(L"list = the 3 paths, UTF-8, one per line", FromUtf8(ReadAll(list)) == dir + L"\\Test 02.pdf\n" + dir + L"\\Test 10.pdf\n" + dir + L"\\Test 01.pdf\n");
  DeleteFileW(list.c_str());
  cl = InvokeAndRead(rowsK[6].cmd.Get(), km.Get(), out);
  check(L"Images to folder → --sastra-task=images-folder", cl.find(L"--sastra-task=images-folder") != std::wstring::npos, cl);
  list = ListOf(cl);
  check(L"Khmer path survives the list file", FromUtf8(ReadAll(list)) == dir + L"\\" + kname + L".pdf\n");
  DeleteFileW(list.c_str());
  cl = InvokeAndRead(rows1[2].cmd.Get(), one.Get(), out);
  check(L"Split here → --sastra-task=split-here", cl.find(L"--sastra-task=split-here") != std::wstring::npos, cl);
  DeleteFileW(ListOf(cl).c_str());

  wprintf(fails ? L"\n%d FAILED\n" : L"\nALL PASS\n", fails);
  return fails ? 1 : 0;
}
```

`<scratch>\t\harness\build.bat`:
```bat
@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
cd /d "%~dp0"
cl /nologo /std:c++17 /EHsc /utf-8 /MT menu-harness.cpp /Fe:menu-harness.exe >nul || exit /b 1
cl /nologo /utf-8 /MT stub.cpp /Fe:stub.exe /link /SUBSYSTEM:WINDOWS user32.lib >nul || exit /b 1
echo HARNESS-BUILT
```

`<scratch>\t\harness\make-files.js` (the harness only needs the files to exist):
```js
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'files'); fs.mkdirSync(dir, { recursive: true });
for (const n of ['Report.pdf', 'Test 01.pdf', 'Test 02.pdf', 'Test 10.pdf', 'notes.txt',
  'ឯកសាររបាយការណ៍ប្រចាំឆ្នាំ២០២៦ផ្នែកហិរញ្ញវត្ថុនិងរដ្ឋបាល.pdf']) fs.writeFileSync(path.join(dir, n), '%PDF-1.4\n');
console.log('files ready');
```

- [ ] **Step 2: Run the harness — it must fail (no DLL yet)**

Run (bash):
```bash
H='C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\77cc72c7-39f4-41f5-bdf5-3b1c2d3b3c66\scratchpad\t\harness'
node "$H\\make-files.js" && cmd //c "$H\\build.bat" && "$H\\menu-harness.exe" 'E:\_httdocs\SastraPDF\explorer-menu\out\SastraMenu.dll' "$H\\files" "$H\\stub.exe"
```
Expected: `files ready`, `HARNESS-BUILT`, then `FAIL  DLL loads` and exit code 1.

- [ ] **Step 3: Write `explorer-menu/menu.def`**
```
LIBRARY SastraMenu
EXPORTS
  DllGetClassObject PRIVATE
  DllCanUnloadNow PRIVATE
```

- [ ] **Step 4: Write `explorer-menu/menu.cpp`**
```cpp
// Sastra PDF — File Explorer right-click menu: "Sastra PDF ▸ Combine / Split / Images".
// An IExplorerCommand with sub-commands. Windows 11 loads it through the SastraPDF.ExplorerMenu package
// (first menu, in a dllhost); Windows 10 and the fallback through HKCU\Software\Classes (classic menu, in
// explorer.exe). A click writes the chosen PDFs to a list file and starts Sastra PDF with
// --sastra-task / --sastra-list (main.js + explorer-menu.js read them).
#include <windows.h>
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
enum class Act { Combine, Sep1, SplitHere, SplitFolder, Sep2, ImagesHere, ImagesFolder };

static std::string Utf8(const std::wstring& s) {
  if (s.empty()) return {};
  int n = WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0, nullptr, nullptr);
  std::string out(n, '\0');
  WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), out.data(), n, nullptr, nullptr);
  return out;
}

// The .pdf files in the selection; anything else (folders, other files, virtual items) is ignored.
static std::vector<std::wstring> PdfPaths(IShellItemArray* items) {
  std::vector<std::wstring> out; DWORD n = 0;
  if (!items || FAILED(items->GetCount(&n))) return out;
  for (DWORD i = 0; i < n; i++) {
    ComPtr<IShellItem> it; if (FAILED(items->GetItemAt(i, &it))) continue;
    LPWSTR p = nullptr;
    if (SUCCEEDED(it->GetDisplayName(SIGDN_FILESYSPATH, &p)) && p) {
      if (lstrcmpiW(PathFindExtensionW(p), L".pdf") == 0) out.emplace_back(p);
      CoTaskMemFree(p);
    }
  }
  return out;
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

static std::wstring Title(Act a, const std::vector<std::wstring>& pdfs) {
  const bool one = pdfs.size() == 1;
  switch (a) {
    case Act::Combine: return L"Combine " + std::to_wstring(pdfs.size()) + L" files";
    case Act::SplitHere: return L"Split here";
    case Act::SplitFolder: return one ? L"Split to \"" + ShortBase(pdfs[0]) + L"\\\"" : L"Split to folders";
    case Act::ImagesHere: return L"Images here (JPG)";
    case Act::ImagesFolder: return one ? L"Images to \"" + ShortBase(pdfs[0]) + L"\\\" (JPG)" : L"Images to folders (JPG)";
    default: return L"";
  }
}

static const wchar_t* TaskName(Act a) {
  switch (a) {
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

static HRESULT Launch(Act a, const std::vector<std::wstring>& pdfs) {
  if (pdfs.empty()) return S_OK;
  const bool test = !EnvVar(L"SASTRA_MENU_EXE").empty();
  std::wstring exe = ExePath();
  if (exe.empty() || GetFileAttributesW(exe.c_str()) == INVALID_FILE_ATTRIBUTES) { Oops(); return HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND); }
  std::wstring list = WriteList(pdfs);
  if (list.empty()) { Oops(); return E_FAIL; }
  std::wstring args = std::wstring(L"--sastra-task=") + TaskName(a) + L" \"--sastra-list=" + list + L"\"";
  std::wstring dir = exe.substr(0, exe.find_last_of(L'\\'));
  HRESULT hr = test ? E_FAIL : ShellLaunch(exe, args, dir);
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
    *name = nullptr; return SHStrDupW(Separator() ? L"" : Title(act_, PdfPaths(items)).c_str(), name);
  }
  IFACEMETHODIMP GetIcon(IShellItemArray*, LPWSTR* icon) override { *icon = nullptr; return E_NOTIMPL; }
  IFACEMETHODIMP GetToolTip(IShellItemArray*, LPWSTR* tip) override { *tip = nullptr; return E_NOTIMPL; }
  IFACEMETHODIMP GetCanonicalName(GUID* g) override { *g = GUID_NULL; return S_OK; }
  IFACEMETHODIMP GetState(IShellItemArray* items, BOOL, EXPCMDSTATE* state) override {
    // Combine (and the line under it) only for 2+ PDFs
    *state = (act_ == Act::Combine || act_ == Act::Sep1) && PdfPaths(items).size() < 2 ? ECS_HIDDEN : ECS_ENABLED;
    return S_OK;
  }
  IFACEMETHODIMP Invoke(IShellItemArray* items, IBindCtx*) override { return Separator() ? S_OK : Launch(act_, PdfPaths(items)); }
  IFACEMETHODIMP GetFlags(EXPCMDFLAGS* flags) override { *flags = Separator() ? ECF_ISSEPARATOR : ECF_DEFAULT; return S_OK; }
  IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand** e) override { *e = nullptr; return E_NOTIMPL; }
};

class Enum : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IEnumExplorerCommand> {
  std::vector<ComPtr<IExplorerCommand>> cmds_; ULONG pos_ = 0;
public:
  Enum() {
    for (Act a : { Act::Combine, Act::Sep1, Act::SplitHere, Act::SplitFolder, Act::Sep2, Act::ImagesHere, Act::ImagesFolder })
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
    *state = PdfPaths(items).empty() ? ECS_HIDDEN : ECS_ENABLED; return S_OK;
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
```

- [ ] **Step 5: Write `explorer-menu/AppxManifest.xml`**
```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- Sastra PDF — sparse package that puts SastraMenu.dll in the first Windows 11 right-click menu.
     Unsigned: the OID in Publisher is what Windows requires for that (added from an elevated session).
     Keep Version and the CLSID in step with explorer-menu.js and menu.cpp (scripts/build-explorer-menu.js checks). -->
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
  xmlns:desktop4="http://schemas.microsoft.com/appx/manifest/desktop/windows10/4"
  xmlns:desktop5="http://schemas.microsoft.com/appx/manifest/desktop/windows10/5"
  xmlns:com="http://schemas.microsoft.com/appx/manifest/com/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap uap10 desktop4 desktop5 com rescap">
  <Identity Name="SastraPDF.ExplorerMenu" Publisher="CN=Sastra PDF, OID.2.25.311729368913984317654407730594956997722=1"
    Version="1.0.0.0" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>Sastra PDF Explorer menu</DisplayName>
    <PublisherDisplayName>Sunnguon Taing</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
    <uap10:AllowExternalContent>true</uap10:AllowExternalContent>
  </Properties>
  <Resources><Resource Language="en-us" /></Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
    <rescap:Capability Name="unvirtualizedResources" />
  </Capabilities>
  <Applications>
    <Application Id="SastraPDF" Executable="Sastra PDF.exe" uap10:TrustLevel="mediumIL" uap10:RuntimeBehavior="win32App">
      <uap:VisualElements AppListEntry="none" DisplayName="Sastra PDF Explorer menu" Description="Sastra PDF right-click menu for PDF files"
        BackgroundColor="transparent" Square150x150Logo="Assets\Square150x150Logo.png" Square44x44Logo="Assets\Square44x44Logo.png" />
      <Extensions>
        <desktop4:Extension Category="windows.fileExplorerContextMenus">
          <desktop4:FileExplorerContextMenus>
            <desktop5:ItemType Type=".pdf">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
          </desktop4:FileExplorerContextMenus>
        </desktop4:Extension>
        <com:Extension Category="windows.comServer">
          <com:ComServer>
            <com:SurrogateServer DisplayName="Sastra PDF Explorer menu">
              <com:Class Id="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" Path="resources\explorer-menu\SastraMenu.dll" ThreadingModel="STA" />
            </com:SurrogateServer>
          </com:ComServer>
        </com:Extension>
      </Extensions>
    </Application>
  </Applications>
</Package>
```

- [ ] **Step 6: Make the three logos once** (committed; from the logo master)
```bash
python - <<'EOF'
from PIL import Image
im = Image.open(r"E:\_httdocs\SastraPDF\build\logo.png").convert("RGBA")
import os; d = r"E:\_httdocs\SastraPDF\explorer-menu\Assets"; os.makedirs(d, exist_ok=True)
for n, s in [("Square150x150Logo", 150), ("Square44x44Logo", 44), ("StoreLogo", 50)]:
    im.resize((s, s), Image.LANCZOS).save(os.path.join(d, n + ".png"), optimize=True)
print("logos ok")
EOF
```
Expected: `logos ok`.

- [ ] **Step 7: Write `scripts/build-explorer-menu.js`**
```js
// Builds the File Explorer right-click menu: SastraMenu.dll (C++, MSVC) and the unsigned sparse package
// SastraPDF.ExplorerMenu.msix, into explorer-menu/out/ (gitignored; electron-builder copies them to
// resources/explorer-menu). Needs Visual Studio Build Tools ("Desktop development with C++", x64) and the
// Windows 10/11 SDK. Run by `npm run dist`; alone: `npm run build:menu`.
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'explorer-menu'), OUT = path.join(SRC, 'out'), OBJ = path.join(OUT, 'obj');
const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
const fail = msg => { console.error('build-explorer-menu: ' + msg); process.exit(1); };

// CLSID and package version must be the same in the DLL, the manifest and explorer-menu.js
const { CLSID, PKG, PKG_VERSION } = require('../explorer-menu.js');
const cpp = fs.readFileSync(path.join(SRC, 'menu.cpp'), 'utf8'), xml = fs.readFileSync(path.join(SRC, 'AppxManifest.xml'), 'utf8');
const id = CLSID.slice(1, -1).toLowerCase();
if (!cpp.toLowerCase().includes(`uuid("${id}")`)) fail(`menu.cpp does not use ${CLSID}`);
if ((xml.toLowerCase().match(new RegExp(id, 'g')) || []).length !== 2) fail(`AppxManifest.xml must name ${CLSID} twice`);
if (!xml.includes(`Name="${PKG}"`) || !xml.includes(`Version="${PKG_VERSION}"`)) fail(`AppxManifest.xml must be ${PKG} ${PKG_VERSION}`);

function vcvars() {
  const vswhere = path.join(PF86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  if (!fs.existsSync(vswhere)) fail('Visual Studio Build Tools not found. Install "Desktop development with C++".');
  const r = spawnSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8' });
  const dir = (r.stdout || '').trim().split(/\r?\n/)[0];
  const bat = dir && path.join(dir, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
  if (!bat || !fs.existsSync(bat)) fail('the C++ x64 build tools are not installed (Visual Studio Installer → Desktop development with C++).');
  return bat;
}
function makeappx() {
  const bin = path.join(PF86, 'Windows Kits', '10', 'bin');
  const num = v => v.split('.').map(Number);
  const vers = (fs.existsSync(bin) ? fs.readdirSync(bin) : [])
    .filter(v => /^10\.\d+\.\d+\.\d+$/.test(v) && fs.existsSync(path.join(bin, v, 'x64', 'makeappx.exe')))
    .sort((a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
  if (!vers.length) fail('makeappx.exe not found. Install the Windows 10/11 SDK.');
  return path.join(bin, vers.at(-1), 'x64', 'makeappx.exe');
}
const run = (exe, args, opts = {}) => { const r = spawnSync(exe, args, { stdio: 'inherit', ...opts }); if (r.status !== 0) fail(`${path.basename(exe)} failed (${r.status ?? r.error})`); };

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OBJ, { recursive: true });

// 1) the DLL. /MT: no Visual C++ runtime needed on the user's PC. A .bat because vcvars sets the environment.
const bat = path.join(OBJ, 'build.bat');
fs.writeFileSync(bat, [
  '@echo off',
  `call "${vcvars()}" >nul 2>&1 || exit /b 1`,
  `cd /d "${OBJ}"`,
  `cl /nologo /std:c++17 /EHsc /O2 /MT /LD /W3 /utf-8 /DUNICODE /D_UNICODE "${path.join(SRC, 'menu.cpp')}" /Fe"${path.join(OUT, 'SastraMenu.dll')}" /link /DEF:"${path.join(SRC, 'menu.def')}" /IMPLIB:SastraMenu.lib || exit /b 1`
].join('\r\n'));
run('cmd.exe', ['/d', '/s', '/c', `""${bat}""`], { windowsVerbatimArguments: true });

// 2) the package: manifest + logos only (the DLL stays in the install folder = ExternalLocation)
const stage = path.join(OBJ, 'package');
fs.mkdirSync(path.join(stage, 'Assets'), { recursive: true });
fs.copyFileSync(path.join(SRC, 'AppxManifest.xml'), path.join(stage, 'AppxManifest.xml'));
for (const f of fs.readdirSync(path.join(SRC, 'Assets'))) fs.copyFileSync(path.join(SRC, 'Assets', f), path.join(stage, 'Assets', f));
run(makeappx(), ['pack', '/o', '/nv', '/d', stage, '/p', path.join(OUT, `${PKG}.msix`)], { stdio: ['ignore', 'ignore', 'inherit'] });

fs.rmSync(OBJ, { recursive: true, force: true });
console.log(`build-explorer-menu: ${path.relative(ROOT, OUT)}\\SastraMenu.dll and ${PKG}.msix ready`);
```
Note: this needs `explorer-menu.js` (Task 2) for `CLSID`, `PKG`, `PKG_VERSION`. Write the minimal module now —
Task 2 replaces it with the full one (keep these three exports):
```js
// Sastra PDF — File Explorer right-click menu (registration added in Task 2).
module.exports = { CLSID: '{47a2af3d-bd25-4ebd-949f-d0e6b6bd5004}', PKG: 'SastraPDF.ExplorerMenu', PKG_VERSION: '1.0.0.0' };
```

- [ ] **Step 8: Wire the script and ignore the output**

`package.json` → `"scripts"`: add `"build:menu": "node scripts/build-explorer-menu.js",` (dist changes come in Task 6).
`.gitignore`: add a line `explorer-menu/out/`.

- [ ] **Step 9: Build, then run the harness — it must pass**
```bash
cd /e/_httdocs/SastraPDF && npm run build:menu
H='C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\77cc72c7-39f4-41f5-bdf5-3b1c2d3b3c66\scratchpad\t\harness'
"$H\\menu-harness.exe" 'E:\_httdocs\SastraPDF\explorer-menu\out\SastraMenu.dll' "$H\\files" "$H\\stub.exe"
```
Expected: `build-explorer-menu: explorer-menu\out\SastraMenu.dll and SastraPDF.ExplorerMenu.msix ready`; harness prints only
PASS lines and `ALL PASS` (20 checks). If a title check fails, fix `Title()`/`ShortBase()`; don't change the harness.

- [ ] **Step 10: Commit**
```bash
git add explorer-menu/menu.cpp explorer-menu/menu.def explorer-menu/AppxManifest.xml explorer-menu/Assets scripts/build-explorer-menu.js explorer-menu.js package.json .gitignore
git commit -m "feat(menu): Explorer menu DLL, its sparse package and the build script" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `explorer-menu.js` — registration and task arguments; `--explorer-menu` in main.js

**Files:**
- Modify (replace): `explorer-menu.js`
- Modify: `main.js` (top: require + `--explorer-menu` dispatch)
- Test: `<scratch>\t\unit-test.js`

**Interfaces:**
- Consumes: CLSID / package names from Task 1.
- Produces (all exported from `explorer-menu.js`):
  - `CLSID`, `PKG`, `PKG_VERSION`, `TASKS` (array of the 5 task names)
  - `parseTaskArgs(argv: string[]) → { task, list } | null`
  - `readTaskList(file: string, tempDir?: string) → string[]` (existing .pdf paths, natural name order; deletes the file)
  - `registerClassic(dll, classes?) → boolean`, `unregisterClassic(classes?)`, `classicRegistered(classes?) → boolean`
  - `readState(key?) → { mode?, location?, version?, declined? }`, `writeState(obj, key?)`, `clearState(key?)`
  - `windowsBuild() → number`, `oldDir(installDir) → string`, `cleanOld(installDir)`, `release({ installDir, dll })`
  - `runCommand(cmd: 'install'|'uninstall'|'release'|'add-package', o: { installDir, exe, dll, msix, silent }) → exit code`
    (0 ok; 1 failed; 3 menu files missing; 64 unknown command)
- main.js: `Sastra PDF.exe --explorer-menu=<cmd> [--silent]` → `process.exit(runCommand(…))` when packaged, `2` from source.

- [ ] **Step 1: Write the failing unit test** `<scratch>\t\unit-test.js`
```js
// Unit checks for explorer-menu.js (plain Node). Registry checks use HKCU\Software\SastraPDF-Test, not the real menu.
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const m = require('E:/_httdocs/SastraPDF/explorer-menu.js');
let fails = 0;
const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  — ' + info : ''}`); if (!ok) fails++; };
const LISTS = path.join(os.tmpdir(), 'Sastra PDF'); fs.mkdirSync(LISTS, { recursive: true });
const SRC = path.join(__dirname, 'out-unit'); fs.rmSync(SRC, { recursive: true, force: true }); fs.mkdirSync(SRC, { recursive: true });
for (const n of ['Test 10.pdf', 'Test 01.pdf', 'Test 02.pdf', 'notes.txt', 'ឯកសារ.pdf']) fs.writeFileSync(path.join(SRC, n), 'x');
const P = n => path.join(SRC, n);

// task arguments
check('parse: split-here + list', JSON.stringify(m.parseTaskArgs(['exe', '--sastra-task=split-here', '--sastra-list=C:\\t\\menu-1.txt'])) === '{"task":"split-here","list":"C:\\\\t\\\\menu-1.txt"}');
check('parse: unknown task → null', m.parseTaskArgs(['exe', '--sastra-task=format-c', '--sastra-list=x']) === null);
check('parse: no list → null', m.parseTaskArgs(['exe', '--sastra-task=combine']) === null);
check('parse: plain "Open with" → null', m.parseTaskArgs(['exe', 'C:\\a.pdf']) === null);
check('5 task names', m.TASKS.join() === 'combine,split-here,split-folder,images-here,images-folder');

// list files
const lf = path.join(LISTS, 'menu-unit-1.txt');
fs.writeFileSync(lf, '\uFEFF' + [P('Test 10.pdf'), P('Test 01.pdf'), P('notes.txt'), P('missing.pdf'), P('Test 02.pdf'), P('TEST 01.pdf'), 'relative.pdf', P('ឯកសារ.pdf'), ''].join('\r\n'));
const got = m.readTaskList(lf).map(p => path.basename(p));
check('list: existing PDFs only, name order 01 02 10, no duplicates', got.join('|') === 'Test 01.pdf|Test 02.pdf|Test 10.pdf|ឯកសារ.pdf', got.join('|'));
check('list file deleted after reading', !fs.existsSync(lf));
const outside = path.join(SRC, 'menu-evil.txt'); fs.writeFileSync(outside, P('Test 01.pdf'));
check('list outside %TEMP%\\Sastra PDF: ignored and kept', m.readTaskList(outside).length === 0 && fs.existsSync(outside));
const other = path.join(LISTS, 'other.txt'); fs.writeFileSync(other, P('Test 01.pdf'));
check('list not named menu-*.txt: ignored and kept', m.readTaskList(other).length === 0 && fs.existsSync(other)); fs.unlinkSync(other);

// classic registration (test key)
const ROOT = 'HKCU\\Software\\SastraPDF-Test\\Classes';
const q = (k, v) => spawnSync('reg.exe', ['query', k, ...(v ? ['/v', v] : ['/ve'])], { encoding: 'utf8' }).stdout || '';
check('registerClassic', m.registerClassic('C:\\x y\\SastraMenu.dll', ROOT));
check('InprocServer32 = the DLL', q(`${ROOT}\\CLSID\\${m.CLSID}\\InprocServer32`).includes('C:\\x y\\SastraMenu.dll'));
check('ThreadingModel Apartment', q(`${ROOT}\\CLSID\\${m.CLSID}\\InprocServer32`, 'ThreadingModel').includes('Apartment'));
check('verb → CLSID', q(`${ROOT}\\SystemFileAssociations\\.pdf\\shell\\SastraPDF`, 'ExplorerCommandHandler').includes(m.CLSID));
check('MultiSelectModel Player', q(`${ROOT}\\SystemFileAssociations\\.pdf\\shell\\SastraPDF`, 'MultiSelectModel').includes('Player'));
check('classicRegistered', m.classicRegistered(ROOT));
m.unregisterClassic(ROOT);
check('unregisterClassic removes both keys', !m.classicRegistered(ROOT) && !q(`${ROOT}\\CLSID\\${m.CLSID}\\InprocServer32`).includes('SastraMenu'));

// state
const SK = 'HKCU\\Software\\SastraPDF-Test\\State';
m.writeState({ mode: 'package', location: 'C:\\a b', version: '1.0.0.0' }, SK);
const st = m.readState(SK);
check('state round trip', st.mode === 'package' && st.location === 'C:\\a b' && st.version === '1.0.0.0' && !st.declined, JSON.stringify(st));
m.writeState({ declined: '1' }, SK); check('state merge', m.readState(SK).declined === '1' && m.readState(SK).mode === 'package');
m.clearState(SK); check('clearState', JSON.stringify(m.readState(SK)) === '{}');
spawnSync('reg.exe', ['delete', 'HKCU\\Software\\SastraPDF-Test', '/f']);

// misc
check('windowsBuild on this PC ≥ 22000', m.windowsBuild() >= 22000, m.windowsBuild());
check('oldDir stays on the install drive', path.parse(m.oldDir('D:\\Apps\\Sastra PDF')).root.toLowerCase() === 'd:\\' && path.parse(m.oldDir('C:\\Users\\x\\AppData\\Local\\Programs\\sastra-pdf')).root.toLowerCase() === 'c:\\');
const inst = path.join(SRC, 'inst'), dll = path.join(inst, 'resources', 'explorer-menu', 'SastraMenu.dll');
fs.mkdirSync(path.dirname(dll), { recursive: true }); fs.writeFileSync(dll, 'x');
m.release({ installDir: inst, dll });
check('release deletes a DLL nobody holds', !fs.existsSync(dll));
check('runCommand: unknown command → 64', m.runCommand('nope', { installDir: inst, exe: '', dll, msix: '' }) === 64);
check('runCommand install: menu files missing → 3', m.runCommand('install', { installDir: inst, exe: '', dll, msix: path.join(inst, 'x.msix'), silent: true }) === 3);

// main.js: from source the command refuses (exit 2) and opens no window
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const t0 = Date.now();
const r = spawnSync('E:/_httdocs/SastraPDF/node_modules/electron/dist/electron.exe', ['E:/_httdocs/SastraPDF', '--explorer-menu=install'], { env, timeout: 20000 });
check('electron . --explorer-menu=install → exit 2, quickly', r.status === 2 && Date.now() - t0 < 15000, `status ${r.status}, ${Date.now() - t0} ms`);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run it — must fail**

Run: `node "C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\77cc72c7-39f4-41f5-bdf5-3b1c2d3b3c66\scratchpad\t\unit-test.js"`
Expected: `TypeError: m.parseTaskArgs is not a function`.

- [ ] **Step 3: Write the full `explorer-menu.js`**
```js
// Sastra PDF — File Explorer right-click menu: registering it (installer hooks, see build/installer.nsh) and
// reading what a menu click asked for (--sastra-task / --sastra-list). No Electron here: plain-Node testable.
// Windows 11: the unsigned sparse package SastraPDF.ExplorerMenu (first menu; adding it needs admin once).
// Windows 10, silent installs and any failure: classic HKCU keys (Windows 11: under "Show more options").
const { spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const PKG = 'SastraPDF.ExplorerMenu';
const PKG_VERSION = '1.0.0.0';        // = explorer-menu/AppxManifest.xml (the build script checks)
const CLSID = '{47a2af3d-bd25-4ebd-949f-d0e6b6bd5004}';
const CLASSES = 'HKCU\\Software\\Classes';
const STATE_KEY = 'HKCU\\Software\\Sastra PDF\\ExplorerMenu';
const TASKS = ['combine', 'split-here', 'split-folder', 'images-here', 'images-folder'];
const LIST_DIR = () => path.join(os.tmpdir(), 'Sastra PDF');

/* ---------- what a menu click asked for ---------- */
function parseTaskArgs(argv) {
  const get = k => { const a = argv.find(x => typeof x === 'string' && x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : null; };
  const task = get('--sastra-task'), list = get('--sastra-list');
  return TASKS.includes(task) && list ? { task, list } : null;
}

const real = p => { try { return fs.realpathSync.native(p).toLowerCase(); } catch { return null; } };
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
// The list file written by SastraMenu.dll: UTF-8, one path per line. Only %TEMP%\Sastra PDF\menu-*.txt is read
// (and then deleted), so the switch can't be used to delete other files. Returns existing .pdf files in name
// order — 01, 02, 10, like Explorer (the menu hands them over in its own order).
function readTaskList(file, tempDir = LIST_DIR()) {
  const f = path.resolve(String(file));
  if (!/^menu-[\w-]+\.txt$/i.test(path.basename(f))) return [];
  const dir = real(path.dirname(f));
  if (!dir || dir !== real(tempDir)) return [];
  let text; try { text = fs.readFileSync(f, 'utf8'); } catch { return []; }
  try { fs.unlinkSync(f); } catch {}
  const seen = new Set();
  return text.replace(/^\uFEFF/, '').split(/\r?\n/).map(s => s.trim()).filter(p => {
    if (!p || !/\.pdf$/i.test(p) || !path.isAbsolute(p)) return false;
    const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k);
    try { return fs.statSync(p).isFile(); } catch { return false; }
  }).sort((a, b) => collator.compare(path.basename(a), path.basename(b)) || collator.compare(a, b));
}

/* ---------- helpers ---------- */
const run = (exe, args) => spawnSync(exe, args, { encoding: 'utf8', windowsHide: true });
const reg = (...args) => run('reg.exe', args);
const ps = script => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
const psq = s => "'" + String(s).replace(/'/g, "''") + "'";   // PowerShell single-quoted string
function log(msg) {
  try { fs.mkdirSync(LIST_DIR(), { recursive: true }); fs.appendFileSync(path.join(LIST_DIR(), 'explorer-menu.log'), `${new Date().toISOString()} ${msg}\r\n`); } catch {}
}
function windowsBuild() { const m = /^10\.0\.(\d+)/.exec(os.release()); return m ? +m[1] : 0; }

/* ---------- classic menu (HKCU) ---------- */
const verbKey = classes => `${classes}\\SystemFileAssociations\\.pdf\\shell\\SastraPDF`;
const clsidKey = classes => `${classes}\\CLSID\\${CLSID}`;
function registerClassic(dll, classes = CLASSES) {
  const steps = [
    [clsidKey(classes), '/ve', '/d', 'Sastra PDF Explorer menu'],
    [clsidKey(classes) + '\\InprocServer32', '/ve', '/d', dll],
    [clsidKey(classes) + '\\InprocServer32', '/v', 'ThreadingModel', '/d', 'Apartment'],
    [verbKey(classes), '/v', 'ExplorerCommandHandler', '/d', CLSID],
    [verbKey(classes), '/v', 'MultiSelectModel', '/d', 'Player']   // shown for more than 15 files too
  ];
  for (const [key, ...rest] of steps) if (reg('add', key, ...rest, '/f').status !== 0) return false;
  return true;
}
function unregisterClassic(classes = CLASSES) { reg('delete', verbKey(classes), '/f'); reg('delete', clsidKey(classes), '/f'); }
function classicRegistered(classes = CLASSES) { return reg('query', verbKey(classes), '/v', 'ExplorerCommandHandler').status === 0; }

/* ---------- what was set up last time (so updates don't ask for admin again) ---------- */
const FIELDS = { Mode: 'mode', Location: 'location', Version: 'version', Declined: 'declined' };
function readState(key = STATE_KEY) {
  const out = {}, r = reg('query', key);
  if (r.status !== 0) return out;
  for (const line of r.stdout.split(/\r?\n/)) { const m = /^\s+(\w+)\s+REG_SZ\s*(.*)$/.exec(line); if (m && FIELDS[m[1]]) out[FIELDS[m[1]]] = m[2].trim(); }
  return out;
}
function writeState(o, key = STATE_KEY) {
  for (const [name, field] of Object.entries(FIELDS)) if (o[field] !== undefined) reg('add', key, '/v', name, '/d', String(o[field]), '/f');
}
function clearState(key = STATE_KEY) { reg('delete', key, '/f'); }

/* ---------- Windows 11 package ---------- */
function packageVersion() {
  const r = ps(`$p = Get-AppxPackage -Name ${psq(PKG)}; if ($p) { $p.Version.ToString() }`);
  return r.status === 0 ? (r.stdout || '').trim().split(/\r?\n/)[0] : '';
}
function removePackage() { ps(`Get-AppxPackage -Name ${psq(PKG)} | Remove-AppxPackage`); }   // no admin needed
// Start this exe again as admin (UAC names Sastra PDF) to add the package. 1223 = the user said No / no admin.
function elevate(exe) {
  const r = ps(`try { $p = Start-Process -FilePath ${psq(exe)} -ArgumentList '--explorer-menu=add-package' -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode } catch { exit 1223 }`);
  return r.status;
}
function addPackage({ installDir, msix }) {   // runs elevated
  const r = ps(`$ErrorActionPreference = 'Stop'; Get-AppxPackage -Name ${psq(PKG)} | Remove-AppxPackage; Add-AppxPackage -Path ${psq(msix)} -ExternalLocation ${psq(installDir)} -AllowUnsigned`);
  log(`add-package ${r.status === 0 ? 'ok' : 'failed'} ${(r.stderr || '').trim()}`);
  return r.status === 0 ? 0 : 1;
}

/* ---------- freeing the DLL so the installer can replace or remove it ---------- */
// A loaded DLL can't be deleted, but it can be moved on the same drive.
function oldDir(installDir) {
  const tmp = path.join(LIST_DIR(), 'old');
  return path.parse(tmp).root.toLowerCase() === path.parse(installDir).root.toLowerCase() ? tmp : path.join(path.dirname(installDir), 'sastra-pdf-old');
}
function cleanOld(installDir) {
  for (const d of new Set([path.join(LIST_DIR(), 'old'), path.join(path.dirname(installDir), 'sastra-pdf-old')])) {
    let files; try { files = fs.readdirSync(d); } catch { continue; }
    for (const f of files) try { fs.unlinkSync(path.join(d, f)); } catch {}
    try { fs.rmdirSync(d); } catch {}
  }
}
function release({ installDir, dll }) {
  // Windows 11: the package's dllhost holds it — stop it (it starts again on the next right-click)
  ps(`Get-Process dllhost -ErrorAction SilentlyContinue | Where-Object { try { $_.Modules | Where-Object { $_.FileName -eq ${psq(dll)} } } catch { $null } } | Stop-Process -Force -ErrorAction SilentlyContinue`);
  if (!fs.existsSync(dll)) return;
  try { fs.unlinkSync(dll); return; } catch {}
  // classic menu: explorer.exe holds it — move it out of the install folder
  try { const d = oldDir(installDir); fs.mkdirSync(d, { recursive: true }); fs.renameSync(dll, path.join(d, `SastraMenu-${Date.now()}.dll`)); }
  catch (e) { log('release: could not move the DLL: ' + e.message); }
}

/* ---------- installer commands ---------- */
function install(o) {
  if (!fs.existsSync(o.dll)) { log('install: menu files missing'); return 3; }
  cleanOld(o.installDir);
  const st = readState();
  if (windowsBuild() >= 22000 && fs.existsSync(o.msix)) {
    if (st.mode === 'package' && st.location === o.installDir && st.version === PKG_VERSION && packageVersion() === PKG_VERSION) {
      unregisterClassic(); log('install: package already set up'); return 0;
    }
    if (!o.silent && st.declined !== '1') {
      const code = elevate(o.exe);
      if (packageVersion() === PKG_VERSION) {   // checked as the user: an admin's password may have added it to the admin's account
        unregisterClassic(); writeState({ mode: 'package', location: o.installDir, version: PKG_VERSION, declined: '' });
        log('install: package added'); return 0;
      }
      log(`install: package not added (elevate exit ${code}); using the classic menu`);
      st.declined = '1';
    }
  }
  removePackage();   // never both (a stale package + the classic keys would show the menu twice)
  if (!registerClassic(o.dll)) { log('install: classic registration failed'); return 1; }
  writeState({ mode: 'classic', location: o.installDir, version: PKG_VERSION, declined: st.declined || '' });
  log('install: classic menu'); return 0;
}
function uninstall(o) { removePackage(); unregisterClassic(); clearState(); release(o); log('uninstall: done'); return 0; }

function runCommand(cmd, o) {
  switch (cmd) {
    case 'install': return install(o);
    case 'uninstall': return uninstall(o);
    case 'release': release(o); return 0;
    case 'add-package': return addPackage(o);
    default: return 64;
  }
}

module.exports = {
  CLSID, PKG, PKG_VERSION, TASKS, parseTaskArgs, readTaskList, registerClassic, unregisterClassic, classicRegistered,
  readState, writeState, clearState, windowsBuild, oldDir, cleanOld, release, runCommand
};
```

- [ ] **Step 4: Hook it into main.js** (right after `let allowClose = false;`, before the single-instance lock)

Add `const menu = require('./explorer-menu');` below `const { execFile } = require('child_process');`, then:
```js
// Installer hooks (build/installer.nsh): "Sastra PDF.exe --explorer-menu=install|uninstall|release|add-package"
// sets up the File Explorer right-click menu and exits — before the single-instance lock, with no window.
const menuCmd = (process.argv.find(a => a.startsWith('--explorer-menu=')) || '').slice('--explorer-menu='.length);
if (menuCmd) {
  const res = path.join(process.resourcesPath, 'explorer-menu');
  process.exit(app.isPackaged ? menu.runCommand(menuCmd, {
    installDir: path.dirname(process.execPath), exe: process.execPath,
    dll: path.join(res, 'SastraMenu.dll'), msix: path.join(res, menu.PKG + '.msix'),
    silent: process.argv.includes('--silent')
  }) : 2);   // 2: only the installed app can register the menu
}
```

- [ ] **Step 5: Run the unit test — must pass**

Run: `node "<scratch>\t\unit-test.js"` (full path as in Step 2). Expected: all PASS, `ALL PASS`.
If the last check fails because a window opened, `process.exit` did not stop main.js: wrap the rest of main.js's
startup (`requestSingleInstanceLock` block and `app.whenReady`) in `if (!menuCmd) { … }` and re-run.

- [ ] **Step 6: Commit**
```bash
git add explorer-menu.js main.js
git commit -m "feat(menu): registration (package / classic) and task arguments; --explorer-menu installer hook" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Shared PDF helpers (`app/pdfops.js`) used by the main window

**Files:**
- Create: `app/pdfops.js`
- Modify: `app/index.html` (load it; replace local pdf.js loading, `baseName`, `rangeLabel`, export rendering)
- Test: copy the earlier test kit into `<scratch>\t\` and run `nozip-test.js` + new `ops-test.js`

**Interfaces:**
- Produces `window.SastraOps`:
  - `PDFJS_OPTS` (absolute `cMapUrl`, `standardFontDataUrl`, `wasmUrl`), `pdfjs() → Promise<pdfjsLib>` (loads once, sets the worker)
  - `baseName(name) → string` (drops `.pdf`), `rangeLabel(idx: number[]) → string` (`[0,1,2,4] → "1-3_5"`)
  - `imageName(base, i, n, ext) → "<base>_page-<i+1 padded to n's digits>.<ext>"`
  - `renderPage(pdf, i, dpi, mime, quality = 0.92) → Promise<{ blob, dpi }>` (dpi actually used; capped at 16 384 px
    a side and 64 000 000 pixels)

- [ ] **Step 1: Bring the test kit over**
```bash
OLD=/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/9527cf03-c89b-4d3b-8cc1-d6c6751f4a78/scratchpad/t
T=/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/77cc72c7-39f4-41f5-bdf5-3b1c2d3b3c66/scratchpad/t
mkdir -p $T && cp -r $OLD/node_modules $OLD/package.json $OLD/print-test.js $OLD/nozip-test.js $OLD/pdfs $T/ && ls $T
```
Expected: `harness node_modules nozip-test.js package.json pdfs print-test.js unit-test.js …`.

- [ ] **Step 2: Write the failing test** `<scratch>\t\ops-test.js`
```js
// SastraOps (app/pdfops.js) in the main window: names, rendering, the size cap.
const { _electron } = require('playwright-core');
const path = require('path');
const APP = 'E:/_httdocs/SastraPDF', T = __dirname;
const EXE = process.env.PACKED === '1' ? path.join(APP, 'dist/win-unpacked/Sastra PDF.exe') : path.join(APP, 'node_modules/electron/dist/electron.exe');
const PRE = process.env.PACKED === '1' ? [] : [APP];
let fails = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  — ' + info : ''}`); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: EXE, args: [...PRE, '--user-data-dir=' + path.join(T, 'ud-ops'), path.join(T, 'pdfs', 'ten.pdf')], env });
  const page = await app.firstWindow(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  for (let k = 0; k < 150 && !(await page.evaluate(() => document.querySelectorAll('#pages .page canvas').length > 0)); k++) await sleep(100);
  const r = await page.evaluate(async () => {
    const O = window.SastraOps; if (!O) return null;
    const lib = await O.pdfjs();
    const d = await PDFLib.PDFDocument.create(); d.addPage([595, 842]); d.addPage([14400, 14400]);   // A4 + the largest PDF page
    const doc = await lib.getDocument({ data: await d.save(), ...O.PDFJS_OPTS }).promise;
    const a = await O.renderPage(doc, 0, 300, 'image/jpeg'), b = await O.renderPage(doc, 1, 300, 'image/jpeg');
    const size = async blob => { const im = await createImageBitmap(blob); return [im.width, im.height]; };
    return { base: O.baseName('Report.PDF'), range: O.rangeLabel([0, 1, 2, 4]), img: O.imageName('Report', 3, 120, 'jpg'), img1: O.imageName('R', 0, 9, 'png'),
      a: [a.dpi, ...(await size(a.blob)), a.blob.type], b: [b.dpi, ...(await size(b.blob))], sameLib: lib === await O.pdfjs() };
  });
  check('SastraOps loaded', r !== null);
  if (r) {
    check('baseName', r.base === 'Report', r.base);
    check('rangeLabel', r.range === '1-3_5', r.range);
    check('imageName padded to the page count', r.img === 'Report_page-004.jpg' && r.img1 === 'R_page-1.png', r.img + ' ' + r.img1);
    check('A4 at 300 dpi → 2479 × 3508 JPEG', r.a.join() === '300,2479,3508,image/jpeg', r.a.join());
    check('huge page drawn smaller (≤ 64 MP, ≤ 16 384 px)', r.b[0] < 300 && r.b[1] * r.b[2] <= 64e6 && r.b[1] <= 16384, r.b.join());
    check('pdf.js loaded once', r.sameLib);
  }
  check('no console errors', errors.length === 0, errors.join(' | '));
  await app.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
```

- [ ] **Step 3: Run it — must fail**

Run (bash): `cd "$T" && unset ELECTRON_RUN_AS_NODE && node ops-test.js` → `FAIL  SastraOps loaded`.

- [ ] **Step 4: Write `app/pdfops.js`**
```js
// Sastra PDF — PDF helpers shared by the main window (index.html) and the Explorer-menu task window
// (task.html), so both make the same files with the same names. Classic script: window.SastraOps.
(() => {
  const vendorUrl = p => new URL('vendor/' + p, location.href).href;
  // absolute URLs: the pdf.js worker would resolve relative ones against its own folder
  const PDFJS_OPTS = { cMapUrl: vendorUrl('pdfjs/cmaps/'), standardFontDataUrl: vendorUrl('pdfjs/standard_fonts/'), wasmUrl: vendorUrl('pdfjs/wasm/') };
  let libP = null;
  const pdfjs = () => libP ??= import('./vendor/pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = vendorUrl('pdf.worker.min.mjs'); return m; });

  const baseName = n => n.replace(/\.pdf$/i, '');
  function rangeLabel(idx) {   // [0,1,2,4] → "1-3_5"
    const out = []; let s = idx[0], p = idx[0];
    for (let k = 1; k <= idx.length; k++) { const v = idx[k]; if (v === p + 1) { p = v; continue; } out.push(s === p ? `${s + 1}` : `${s + 1}-${p + 1}`); s = p = v; }
    return out.join('_');
  }
  const imageName = (base, i, n, ext) => `${base}_page-${String(i + 1).padStart(String(n).length, '0')}.${ext}`;

  const MAX_SIDE = 16384, MAX_PIXELS = 64e6;   // beyond this a canvas fails or eats gigabytes
  // Page i (0-based) on white at `dpi`, lowered when the picture would be too big. → { blob, dpi used }
  async function renderPage(pdf, i, dpi, mime, quality = 0.92) {
    const page = await pdf.getPage(i + 1);
    const one = page.getViewport({ scale: 1 });
    const use = Math.max(1, Math.min(dpi, Math.floor(72 * MAX_SIDE / Math.max(one.width, one.height)), Math.floor(72 * Math.sqrt(MAX_PIXELS / (one.width * one.height)))));
    const vp = page.getViewport({ scale: use / 72 });
    const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise(r => c.toBlob(r, mime, quality));
    c.width = c.height = 0; page.cleanup();
    if (!blob) throw new Error(`page ${i + 1} is too large to draw`);
    return { blob, dpi: use };
  }

  window.SastraOps = { PDFJS_OPTS, pdfjs, baseName, rangeLabel, imageName, renderPage };
})();
```

- [ ] **Step 5: Use it in `app/index.html`**
- After `<script src="print.js"></script>` add `<script src="pdfops.js"></script>`.
- Replace lines 482–485 (`vendorUrl`, `pdfjsLib`, `pdfReady`, `PDFJS_OPTS`) with:
```js
let pdfjsLib = null;
const pdfReady = SastraOps.pdfjs().then(m => { pdfjsLib = m; });
const PDFJS_OPTS = SastraOps.PDFJS_OPTS;
```
- Replace `const baseName = n => n.replace(/\.pdf$/i,'');` with `const baseName = SastraOps.baseName;`
- Replace the whole `function rangeLabel(idx){ … }` (3 lines) with `const rangeLabel = SastraOps.rangeLabel;`
- In `exportImages`, replace the `names` line and the body of `render` with:
```js
  const names = pages.map(i => SastraOps.imageName(baseName(d.name), i, d.n, fmt));
  const render = async k => {
    const i = pages[k];
    $('#stBusy').innerHTML = `<span class="busy"><span class="spin"></span>Rendering page ${i+1} (${k+1} of ${pages.length})…</span>`;
    return (await SastraOps.renderPage(d.pdf, i, dpi, mime)).blob;
  };
```
  and delete the now-unused `const pad = String(d.n).length;`.
- `grep -n "vendorUrl\|const pad" app/index.html` → no matches.

- [ ] **Step 6: Run the tests — must pass**
```bash
cd "$T" && unset ELECTRON_RUN_AS_NODE && node ops-test.js && node nozip-test.js && node print-test.js
```
Expected: `ALL PASS` from ops-test; nozip-test and print-test report no FAIL lines (22 and 71 checks).

- [ ] **Step 7: Commit**
```bash
git add app/pdfops.js app/index.html
git commit -m "refactor: shared PDF helpers (pdfops.js) with a size cap for page images" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The task window (Split / Images from the menu)

**Files:**
- Create: `app/task.html`, `app/task.js`
- Modify: `main.js` (task routing, task window, `make-dir`, `resolve-names`, `resolveNames`, `second-instance`,
  `whenReady`, `createWindow` resets `allowClose`), `preload.js`
- Test: `<scratch>\t\menu-test.js` (sections 1–10), `<scratch>\t\make-locked.py`

**Interfaces:**
- Consumes: `menu.parseTaskArgs`, `menu.readTaskList` (Task 2); `SastraOps` (Task 3).
- Produces:
  - IPC main→task `task-batch` `{ task, paths }`; task→main `task-ready` (send).
  - IPC `make-dir` (invoke) `dir → { dir } | { error }`; `resolve-names` (invoke) `[{ dir, names }] → string[][] | null`.
  - preload: `makeDir(dir)`, `resolveNames(groups)`, `taskReady()`, `onTaskBatch(fn)`.
  - main.js: `handleTask(argv) → boolean` (true when argv was a menu task, even an empty one);
    `resolveNames(groups, parent) → Promise<string[][] | null>` (also used by `pick-folder`).

- [ ] **Step 1: Make a password-protected test PDF** — `<scratch>\t\make-locked.py`
```python
# Makes pdfs/locked.pdf (user password "secret") from pdfs/ten.pdf. Needs: pip install --target py pypdf
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'py'))
from pypdf import PdfReader, PdfWriter
d = os.path.join(os.path.dirname(__file__), 'pdfs')
w = PdfWriter(clone_from=PdfReader(os.path.join(d, 'ten.pdf'))); w.encrypt('secret', algorithm='AES-128')
with open(os.path.join(d, 'locked.pdf'), 'wb') as f: w.write(f)
print('locked.pdf ready')
```
Run: `cd "$T" && python -m pip install --quiet --target py pypdf && python make-locked.py` → `locked.pdf ready`.

- [ ] **Step 2: Write the failing test** `<scratch>\t\menu-test.js`
```js
// Explorer-menu jobs through the app, started like the menu does: a list file in %TEMP%\Sastra PDF plus
// --sastra-task / --sastra-list, sent to the running app by a second process. Main's dialogs are stubbed.
// Sections: node menu-test.js [all|tasks|combine]. PACKED=1 tests dist\win-unpacked.
const { _electron } = require('playwright-core');
const { PDFDocument, StandardFonts } = require('E:/_httdocs/SastraPDF/node_modules/pdf-lib');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const APP = 'E:/_httdocs/SastraPDF', PACKED = process.env.PACKED === '1';
const EXE = PACKED ? path.join(APP, 'dist/win-unpacked/Sastra PDF.exe') : path.join(APP, 'node_modules/electron/dist/electron.exe');
const PRE = PACKED ? [] : [APP];
const T = __dirname, OUT = path.join(T, 'out-menu'), UD = path.join(T, 'ud-menu'), LISTS = path.join(os.tmpdir(), 'Sastra PDF');
const SECTION = process.argv[2] || 'all';
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;

let fails = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  — ' + info : ''}`); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ls = d => fs.existsSync(d) ? fs.readdirSync(d).sort() : [];
const pagesOf = async f => (await PDFDocument.load(fs.readFileSync(f))).getPageCount();
const until = async (fn, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; };
function jpegSize(file) {   // width/height from the JPEG's SOF marker
  const b = fs.readFileSync(file); let i = 2;
  while (i < b.length) { const m = b[i + 1], len = b.readUInt16BE(i + 2); if (m >= 0xC0 && m <= 0xC3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + len; }
  return null;
}
let listN = 0;
function listFile(paths) { fs.mkdirSync(LISTS, { recursive: true }); const f = path.join(LISTS, `menu-test-${process.pid}-${++listN}.txt`); fs.writeFileSync(f, paths.join('\n') + '\n'); return f; }
// a menu click: a second Sastra process hands the job to the running app and quits
const second = (args) => new Promise(res => { const p = spawn(EXE, [...PRE, '--user-data-dir=' + UD, ...args], { env, stdio: 'ignore' }); p.on('exit', res); });
const click = (task, paths) => second(['--sastra-task=' + task, '--sastra-list=' + listFile(paths)]);
async function makePdf(file, n, w = 595, h = 842) {
  const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) d.addPage([w, h]).drawText(`${path.basename(file)} page ${i}`, { x: 40, y: h - 60, size: 20, font: f });
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, await d.save());
}
const copy = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); return dst; };

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  const TEN = path.join(OUT, 'src', 'ten.pdf'); await makePdf(TEN, 10);
  const KM = path.join(OUT, 'km', 'ឯកសារ ខ្មែរ.pdf'); await makePdf(KM, 3);
  const BIG = path.join(OUT, 'big', 'big.pdf'); await makePdf(BIG, 40);
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(`${p.url().split('/').pop()}: ${e.message}`)); p.on('console', m => { if (m.type() === 'error') errors.push(`${p.url().split('/').pop()}: ${m.text()}`); }); };

  if (SECTION === 'all' || SECTION === 'tasks') {
    // 1) app not running: the task window does the job, no main window, then the app quits
    const H = copy(TEN, path.join(OUT, 'here', 'ten.pdf'));
    const app1 = await _electron.launch({ executablePath: EXE, args: [...PRE, '--user-data-dir=' + UD, '--sastra-task=split-here', '--sastra-list=' + listFile([H])], env });
    const w1 = await app1.firstWindow(); watch(w1);
    check('fresh start: the window is the task window', w1.url().endsWith('/task.html'), w1.url());
    let exited = false; app1.process().on('exit', () => { exited = true; });
    await until(() => exited, 30000);
    const f1 = ls(path.join(OUT, 'here')).filter(f => f !== 'ten.pdf');
    check('split here: 10 one-page PDFs named ten-1 … ten-10', f1.length === 10 && f1.includes('ten-1.pdf') && f1.includes('ten-10.pdf'), f1.join(','));
    if (f1.length) check('each part has one page', (await Promise.all(f1.map(f => pagesOf(path.join(OUT, 'here', f))))).every(n => n === 1));
    check('the app quit after the task window closed', exited);
    check('list file deleted', !ls(LISTS).some(f => f.startsWith('menu-test-')));

    // 1b) only the task window open + a plain "Open with" → the main window opens for that file
    const B2 = copy(BIG, path.join(OUT, 'big2', 'big.pdf'));
    const app1b = await _electron.launch({ executablePath: EXE, args: [...PRE, '--user-data-dir=' + UD, '--sastra-task=images-here', '--sastra-list=' + listFile([B2])], env });
    watch(await app1b.firstWindow());
    let exited1b = false; app1b.process().on('exit', () => { exited1b = true; });
    await second([TEN]);
    let m1b = null; await until(() => (m1b = app1b.windows().find(w => w.url().endsWith('/index.html'))), 20000);
    if (m1b) { watch(m1b); await until(() => m1b.evaluate(() => /ten\.pdf/.test(document.querySelector('#tabs').textContent))); }
    check('task window only + "Open with" → the main window opens with that file', !!m1b && await m1b.evaluate(() => /ten\.pdf/.test(document.querySelector('#tabs').textContent)));
    await app1b.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html'))?.close());
    await until(() => exited1b, 120000);
    check('app quits once both windows are closed; all 40 images made', exited1b && ls(path.join(OUT, 'big2')).filter(f => f.endsWith('.jpg')).length === 40);

    // the app running with an unsaved tab; dialogs stubbed
    const app = await _electron.launch({ executablePath: EXE, args: [...PRE, '--user-data-dir=' + UD, TEN], env });
    const main = await app.firstWindow(); watch(main);
    await until(() => main.evaluate(() => document.querySelectorAll('#pages .page canvas').length > 0));
    await main.keyboard.press('Control+Shift+R');   // rotate → unsaved
    await until(() => main.evaluate(() => document.title.startsWith('•')));
    await app.evaluate(({ dialog }) => {
      globalThis.__dlg = { box: 1, boxes: [], saves: [], saveTo: null };
      dialog.showMessageBox = async (_w, o) => { globalThis.__dlg.boxes.push(o.message + ' | ' + o.buttons.join('/')); return { response: globalThis.__dlg.box }; };
      dialog.showSaveDialog = async (_w, o) => { globalThis.__dlg.saves.push(o.defaultPath); return globalThis.__dlg.saveTo ? { canceled: false, filePath: globalThis.__dlg.saveTo } : { canceled: true }; };
    });
    const boxes = () => app.evaluate(() => globalThis.__dlg.boxes.slice());
    const dlg = o => app.evaluate((_e, o) => Object.assign(globalThis.__dlg, o), o);
    const taskWins = () => app.windows().filter(w => w.url().endsWith('/task.html'));
    const taskPage = async () => { let p = null; await until(() => (p = taskWins()[0])); return p; };
    const taskText = async () => { const p = taskWins()[0]; return p ? p.evaluate(() => document.querySelector('.task').innerText) : ''; };
    // task.js counts finished runs in body[data-done]; -1 = no task window
    const doneCount = async () => { const p = taskWins()[0]; return p ? +(await p.evaluate(() => document.body.dataset.done || 0)) : -1; };
    async function run(task, paths) {   // a menu click, then wait until that run has finished
      const before = await doneCount(), target = before < 0 ? 1 : before + 1;
      await click(task, paths);
      return until(async () => (await doneCount()) >= target, 90000);
    }
    const closeTask = async () => { const p = taskWins()[0]; if (p) await p.evaluate(() => document.querySelector('#bClose').click()); await until(() => !taskWins().length, 5000); };
    app.on('window', watch);

    // 2) split to folder
    const F = copy(TEN, path.join(OUT, 'f', 'ten.pdf'));
    await run('split-folder', [F]);
    let f2 = ls(path.join(OUT, 'f', 'ten'));
    check('split to "ten\\": 10 PDFs in the new folder', f2.length === 10 && f2.includes('ten-10.pdf'), f2.join(','));
    // 3) names already there: Keep both / Cancel / Replace
    await until(() => !taskWins().length, 5000);
    await dlg({ box: 1 }); await run('split-folder', [F]);
    const b3 = await boxes();
    check('one question for the click: Replace / Keep both / Cancel', b3.length === 1 && /10 of these files are already in this folder/.test(b3[0]) && /Replace\/Keep both\/Cancel/.test(b3[0]), b3[0]);
    f2 = ls(path.join(OUT, 'f', 'ten'));
    check('Keep both → numbered copies', f2.length === 20 && f2.includes('ten-1 (2).pdf'), f2.length);
    await until(() => !taskWins().length, 5000);
    await dlg({ box: 2 }); await run('split-folder', [F]);
    check('Cancel → nothing written, the window says so', ls(path.join(OUT, 'f', 'ten')).length === 20 && /Cancelled: nothing saved/.test(await taskText()));
    const before = fs.statSync(path.join(OUT, 'f', 'ten', 'ten-1.pdf')).mtimeMs; await sleep(50);
    await dlg({ box: 0 }); await run('split-folder', [F]);   // same window (it stayed open with the Cancel line)
    check('Replace → same files, rewritten', ls(path.join(OUT, 'f', 'ten')).length === 20 && fs.statSync(path.join(OUT, 'f', 'ten', 'ten-1.pdf')).mtimeMs > before);
    await closeTask();

    // 4) images here (300 dpi JPG) and 5) images to a Khmer-named folder
    const I = copy(TEN, path.join(OUT, 'img', 'ten.pdf'));
    await run('images-here', [I]);
    const f4 = ls(path.join(OUT, 'img')).filter(f => f.endsWith('.jpg'));
    check('images here: ten_page-01 … ten_page-10.jpg', f4.length === 10 && f4[0] === 'ten_page-01.jpg' && f4[9] === 'ten_page-10.jpg', f4.join(','));
    if (f4.length) check('300 dpi: 2479 × 3508 px', (jpegSize(path.join(OUT, 'img', f4[0])) || []).join() === '2479,3508', String(jpegSize(path.join(OUT, 'img', f4[0]))));
    await until(() => !taskWins().length, 5000);
    await run('images-folder', [KM]);
    const f5 = ls(path.join(OUT, 'km', 'ឯកសារ ខ្មែរ'));
    check('Khmer: images in "ឯកសារ ខ្មែរ\\"', f5.join('|') === 'ឯកសារ ខ្មែរ_page-1.jpg|ឯកសារ ខ្មែរ_page-2.jpg|ឯកសារ ខ្មែរ_page-3.jpg', f5.join('|'));
    await until(() => !taskWins().length, 5000);

    // 6) problems: damaged, password, one page; the good file still done; window stays open
    const PD = path.join(OUT, 'p'); fs.mkdirSync(PD, { recursive: true });
    fs.writeFileSync(path.join(PD, 'bad.pdf'), 'not a pdf');
    copy(path.join(T, 'pdfs', 'locked.pdf'), path.join(PD, 'locked.pdf'));
    await makePdf(path.join(PD, 'one.pdf'), 1);
    copy(TEN, path.join(PD, 'ten.pdf'));
    await run('split-here', ['bad.pdf', 'locked.pdf', 'one.pdf', 'ten.pdf'].map(n => path.join(PD, n)));
    const t6 = await taskText();
    check('damaged PDF reported', /bad\.pdf: it may be damaged or not a PDF/.test(t6));
    check('password PDF reported', /locked\.pdf: it's password-protected/.test(t6));
    check('1-page PDF reported', /one\.pdf: only one page — nothing to split/.test(t6));
    check('the good PDF still split', ls(PD).filter(f => /^ten-\d+\.pdf$/.test(f)).length === 10);
    check('window stays open with Close', /Done, with problems/.test(t6) && await (await taskPage()).evaluate(() => !document.querySelector('#bClose').hidden));
    await closeTask();

    // 7) a FILE where the folder should go
    const Q = copy(TEN, path.join(OUT, 'q', 'ten.pdf')); fs.writeFileSync(path.join(OUT, 'q', 'ten'), 'a file');
    await run('images-folder', [Q]);
    check('folder name taken by a file → reported', /couldn't make the folder "ten"/.test(await taskText()), await taskText());
    await closeTask();

    // 8) two clicks in a row → one window, both done
    const QA = copy(TEN, path.join(OUT, 'qa', 'ten.pdf')), QB = copy(TEN, path.join(OUT, 'qb', 'ten.pdf'));
    let most = 0; const counter = setInterval(() => { most = Math.max(most, taskWins().length); }, 50);
    await Promise.all([click('images-here', [QA]), click('split-here', [QB])]);
    await taskPage(); await until(async () => ls(path.join(OUT, 'qa')).length === 11 && ls(path.join(OUT, 'qb')).length === 11, 60000);
    clearInterval(counter);
    check('two clicks → both done in ONE task window', most === 1 && ls(path.join(OUT, 'qa')).length === 11 && ls(path.join(OUT, 'qb')).length === 11, `windows ${most}`);
    await until(() => !taskWins().length, 8000);

    // 9) Cancel part-way
    await click('images-here', [BIG]); const tp = await taskPage();
    await until(() => ls(path.join(OUT, 'big')).some(f => f.endsWith('.jpg')), 30000);
    await tp.evaluate(() => document.querySelector('#bCancel').click());
    await until(async () => (await doneCount()) >= 1, 30000);
    const n9 = ls(path.join(OUT, 'big')).filter(f => f.endsWith('.jpg')).length;
    check('Cancel stops part-way, files so far kept', /Cancelled/.test(await taskText()) && n9 > 0 && n9 < 40, n9);
    await closeTask();

    // 10) guards; the main window untouched
    const keep = path.join(OUT, 'menu-keep.txt'); fs.writeFileSync(keep, TEN + '\n');
    await second(['--sastra-task=split-here', '--sastra-list=' + keep]); await sleep(1500);
    check('list file outside %TEMP%\\Sastra PDF: ignored, not deleted', fs.existsSync(keep) && !taskWins().length);
    check('main window untouched: 1 tab, still unsaved', await main.evaluate(() => document.querySelectorAll('#tabs .tab').length === 1 && document.title.startsWith('•')));
    check('no list files left', !ls(LISTS).some(f => f.startsWith('menu-test-')));
    globalThis.__app = app; globalThis.__main = main; globalThis.__dlg = dlg;
  }

  if (SECTION === 'all' || SECTION === 'combine') await require('./menu-test-combine.js')({ check, until, sleep, click, makePdf, EXE, PRE, UD, OUT, env, watch, _electron });

  if (globalThis.__app) { await globalThis.__app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.destroy())); await globalThis.__app.close().catch(() => {}); }
  check('no console errors in any window', errors.length === 0, errors.join(' | '));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
```
and a placeholder module (filled in Task 5) `<scratch>\t\menu-test-combine.js`: `module.exports = async () => {};`

- [ ] **Step 3: Run it — must fail**

Run: `cd "$T" && unset ELECTRON_RUN_AS_NODE && node menu-test.js tasks` → `FAIL  fresh start: the window is the task window`
(the app opens its main window and ignores the task).

- [ ] **Step 4: preload.js** — add inside the exposed object (after `pickFolder`):
```js
  makeDir: dir => ipcRenderer.invoke('make-dir', dir),
  resolveNames: groups => ipcRenderer.invoke('resolve-names', groups),
  taskReady: () => ipcRenderer.send('task-ready'),
  onTaskBatch: fn => ipcRenderer.on('task-batch', (_e, b) => fn(b)),
```

- [ ] **Step 5: main.js — shared name question.** Replace the body of `ipcMain.handle('pick-folder', …)` after
`const dir = r.filePaths[0]; lastDir = dir;` and add `resolveNames` above it:
```js
// Names already in the folder(s): ONE question for the whole batch. groups = [{ dir, names }] → final names per
// group (same order), or null when cancelled. The same name twice in one group gets " (2)", like Explorer.
async function resolveNames(groups, parent) {
  const gs = (Array.isArray(groups) ? groups : []).map(g => {
    const seen = new Set(), names = (Array.isArray(g.names) ? g.names : []).map(n => {
      const base = path.basename(String(n)); let name = base, k = 1;
      while (seen.has(name.toLowerCase())) name = numbered(base, ++k);
      seen.add(name.toLowerCase()); return name;
    });
    return { dir: String(g.dir), names, seen };
  });
  const clash = [];
  for (const g of gs) for (const n of g.names) if (await exists(path.join(g.dir, n))) clash.push({ g, n });
  if (!clash.length) return gs.map(g => g.names);
  const where = gs.length > 1 ? 'their folders' : 'this folder';
  const q = await dialog.showMessageBox(parent, {
    type: 'question', buttons: ['Replace', 'Keep both', 'Cancel'], defaultId: 1, cancelId: 2, noLink: true, title: APP_NAME,
    message: clash.length === 1 ? `"${clash[0].n}" is already in ${gs.length > 1 ? 'its folder' : 'this folder'}.` : `${clash.length} of these files are already in ${where}.`,
    detail: 'Replace them, or keep both? With Keep both the new files get a number added to their name.'
  });
  if (q.response === 2) return null;
  if (q.response === 0) return gs.map(g => g.names);
  const out = [];   // Keep both: a clashing name gets the first free number
  for (const g of gs) {
    const list = [];
    for (const n of g.names) {
      let name = n;
      if (clash.some(c => c.g === g && c.n === n)) {
        let k = 1;
        do name = numbered(n, ++k); while (g.seen.has(name.toLowerCase()) || await exists(path.join(g.dir, name)));
        g.seen.add(name.toLowerCase());
      }
      list.push(name);
    }
    out.push(list);
  }
  return out;
}
ipcMain.handle('pick-folder', async (_e, { title, names } = {}) => {
  const r = await dialog.showOpenDialog(win, {
    title: String(title || 'Choose a folder'), buttonLabel: 'Save here',
    defaultPath: lastDir || app.getPath('documents'), properties: ['openDirectory', 'createDirectory']
  });
  if (r.canceled || !r.filePaths.length) return null;
  const dir = r.filePaths[0]; lastDir = dir;
  const final = await resolveNames([{ dir, names }], win);
  return final ? { dir, names: final[0] } : null;
});
ipcMain.handle('resolve-names', (e, groups) => resolveNames(groups, BrowserWindow.fromWebContents(e.sender)));
const isDir = p => fs.stat(p).then(s => s.isDirectory(), () => false);
// Explorer-menu "… to folder": only "<existing folder>\<one name>" is ever made.
ipcMain.handle('make-dir', async (_e, dir) => {
  const d = path.resolve(String(dir));
  if (!(await isDir(path.dirname(d)))) return { error: 'its folder is gone' };
  try { await fs.mkdir(d); } catch (e) { if (e.code !== 'EEXIST') return { error: e.code === 'EPERM' || e.code === 'EACCES' ? 'no permission' : e.message }; }
  return (await isDir(d)) ? { dir: d } : { error: 'a file already has that name' };
});
```

- [ ] **Step 6: main.js — task routing and the task window.** Add after `function send(cmd) { … }`:
```js
/* ---------- File Explorer menu jobs (SastraMenu.dll → --sastra-task / --sastra-list) ---------- */
let taskWin = null, taskReady = false, taskQueue = [];
// true when argv is a menu job (handled, or empty because its files are gone)
function handleTask(argv) {
  const t = menu.parseTaskArgs(argv); if (!t) return false;
  const paths = menu.readTaskList(t.list);
  if (!paths.length) return true;
  if (t.task === 'combine') { if (!win) createWindow(); sendToMain('combine-paths', paths); }
  else { taskQueue.push({ task: t.task, paths }); openTaskWindow(); flushTasks(); }
  return true;
}
function sendToMain(channel, data) {
  const wc = win.webContents;
  if (wc.isLoading()) wc.once('did-finish-load', () => wc.send(channel, data)); else wc.send(channel, data);
  if (win.isVisible()) { if (win.isMinimized()) win.restore(); win.focus(); }
}
function openTaskWindow() {
  if (taskWin) { if (taskWin.isMinimized()) taskWin.restore(); taskWin.focus(); return; }
  taskReady = false;
  taskWin = new BrowserWindow({
    width: 480, height: 280, useContentSize: true, resizable: false, maximizable: false, fullscreenable: false,
    title: APP_NAME, icon: path.join(__dirname, 'build', 'icon.png'), backgroundColor: '#efece8', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false,
      additionalArguments: ['--sastra-title=' + APP_TITLE] }
  });
  taskWin.setMenu(null);
  taskWin.once('ready-to-show', () => taskWin.show());
  taskWin.loadFile(path.join(__dirname, 'app', 'task.html'));
  taskWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  taskWin.webContents.on('will-navigate', e => e.preventDefault());
  taskWin.on('closed', () => { taskWin = null; taskReady = false; taskQueue = []; });
}
function flushTasks() { if (taskWin && taskReady) for (const b of taskQueue.splice(0)) taskWin.webContents.send('task-batch', b); }
ipcMain.on('task-ready', e => { if (taskWin && e.sender === taskWin.webContents) { taskReady = true; flushTasks(); } });
```

- [ ] **Step 7: main.js — startup and second instance.**
- In `createWindow()`, first line: `allowClose = false;   // a window opened again later must ask again`
- Replace the `second-instance` handler body with:
```js
  app.on('second-instance', (_e, argv) => {
    if (handleTask(argv)) return;
    const files = pdfArgs(argv);
    if (!win) { pendingPaths = files; createWindow(); return; }   // only the task window was open
    if (win.isMinimized()) win.restore();
    win.focus();
    if (files.length) win.webContents.send('open-paths', files);
  });
```
- Replace the `app.whenReady()` body with:
```js
app.whenReady().then(() => {
  app.setAppUserModelId('kh.sastra.pdf');
  if (app.isPackaged) menu.cleanOld(path.dirname(process.execPath));
  if (handleTask(process.argv)) { if (!win && !taskWin) app.quit(); return; }
  pendingPaths = pdfArgs(process.argv);
  createWindow();
});
```

- [ ] **Step 8: Write `app/task.html`**
```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:">
<script>/* saved theme before first paint */try{const t=localStorage.getItem('sastra-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}</script>
<title>Sastra PDF</title>
<link rel="stylesheet" href="vendor/fonts/fonts.css">
<style>
/* The small window for File Explorer menu jobs: what it's doing, a progress bar, problems, Cancel/Close. */
:root{
  --chrome:#efece8; --panel:#f8f6f3; --line:#dcd7d0; --fg:#23201c; --muted:#6c665e; --accent:#b8432a; --accent-fg:#ffffff;
  --hover:rgba(35,32,28,.07); --err:#b3261e;
  --ui:"IBM Plex Sans","Noto Sans Khmer","Khmer UI",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --chrome:#1f1d1b; --panel:#272523; --line:#34312e; --fg:#ece8e2; --muted:#a29b91; --accent:#e46a4f; --accent-fg:#1a0d09;
  --hover:rgba(255,255,255,.07); --err:#ff8a80; color-scheme:dark}}
:root[data-theme="dark"]{
  --chrome:#1f1d1b; --panel:#272523; --line:#34312e; --fg:#ece8e2; --muted:#a29b91; --accent:#e46a4f; --accent-fg:#1a0d09;
  --hover:rgba(255,255,255,.07); --err:#ff8a80; color-scheme:dark}
[hidden]{display:none!important}
html,body{height:100%}
body{margin:0;background:var(--chrome);color:var(--fg);font:14px/1.45 var(--ui);user-select:none;cursor:default;overflow:hidden}
.task{box-sizing:border-box;height:100%;display:flex;flex-direction:column;gap:10px;padding:18px 20px 16px}
.head{display:flex;gap:12px;align-items:center}
.head img{flex:none}
.head>div{min-width:0}
#what{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.muted{color:var(--muted);font-size:13px}
.bar{height:6px;border-radius:3px;background:var(--line);overflow:hidden;flex:none}
#fill{height:100%;width:0;background:var(--accent);transition:width .15s}
#problems{flex:1;min-height:0;overflow:auto;margin:0;padding:8px 10px 8px 26px;background:var(--panel);border:1px solid var(--line);border-radius:6px;color:var(--err);font-size:13px;user-select:text}
.foot{margin-top:auto;display:flex;justify-content:flex-end;gap:8px}
.btn{font:inherit;font-size:13px;height:30px;padding:0 16px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--fg);cursor:pointer}
.btn:hover:not(:disabled){background:var(--hover)}
.btn:disabled{opacity:.5;cursor:default}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-fg);font-weight:500}
</style>
</head>
<body>
<main class="task">
  <div class="head"><img src="logo.png" alt="" width="28" height="28" draggable="false"><div><div id="what">Getting ready…</div><div id="step" class="muted"></div></div></div>
  <div class="bar"><div id="fill"></div></div>
  <div id="waiting" class="muted" hidden></div>
  <ul id="problems" hidden></ul>
  <div class="foot"><button class="btn" id="bCancel">Cancel</button><button class="btn primary" id="bClose" hidden>Close</button></div>
</main>
<script src="vendor/pdf-lib.min.js"></script>
<script src="pdfops.js"></script>
<script src="task.js"></script>
</body>
</html>
```

- [ ] **Step 9: Write `app/task.js`**
```js
// Sastra PDF — the small window for File Explorer menu jobs (Split / Images). main.js sends one batch per menu
// click ({ task, paths }); batches run one after another. Per click: open the PDFs (page counts decide the names),
// ask ONE Replace / Keep both / Cancel question, then write each file as soon as it is made.
(() => {
  const desk = window.sastra, Ops = window.SastraOps, { PDFDocument } = window.PDFLib;
  const $ = s => document.querySelector(s);
  const DPI = 300, JPG_QUALITY = 0.92;
  const queue = [];
  let running = false, cancelled = false, saved = 0, problemCount = 0, closeTimer = null;

  const dirOf = p => p.replace(/[\\/][^\\/]*$/, '');
  const fileOf = p => p.split(/[\\/]/).pop();
  const join = (d, n) => d.replace(/[\\/]+$/, '') + '\\' + n;
  const folderName = name => Ops.baseName(name).replace(/[ .]+$/, '') || 'PDF';   // Windows drops trailing dots/spaces
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const why = e => {
    const m = String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    return /EACCES|EPERM/.test(m) ? 'no permission to save there' : /ENOSPC/.test(m) ? 'the disk is full'
      : /EBUSY/.test(m) ? 'a file with that name is open in another program' : m;
  };
  function show(what, step, frac) { $('#what').textContent = what; $('#step').textContent = step || ''; $('#fill').style.width = Math.round((frac || 0) * 100) + '%'; }
  function showWaiting() { const n = queue.length; $('#waiting').hidden = !n; $('#waiting').textContent = n ? `${n} more waiting` : ''; }
  function problem(text) { problemCount++; const li = document.createElement('li'); li.textContent = text; $('#problems').appendChild(li); $('#problems').hidden = false; }

  desk.onTaskBatch(b => { clearTimeout(closeTimer); queue.push(b); showWaiting(); if (!running) run(); });
  $('#bCancel').onclick = () => { cancelled = true; queue.length = 0; showWaiting(); $('#bCancel').disabled = true; $('#step').textContent = 'Stopping…'; };
  $('#bClose').onclick = () => window.close();
  desk.taskReady();

  async function run() {
    running = true; cancelled = false;
    $('#bCancel').hidden = false; $('#bCancel').disabled = false; $('#bClose').hidden = true;
    while (queue.length && !cancelled) { const b = queue.shift(); showWaiting(); await batch(b); }
    running = false; finish();
  }
  function finish() {
    document.body.dataset.done = String(+(document.body.dataset.done || 0) + 1);   // finished runs (tests read it)
    $('#bCancel').hidden = true; $('#bClose').hidden = false;
    const files = plural(saved, 'file');
    if (cancelled) show('Cancelled', `${files} saved`, 1);
    else if (problemCount) show('Done, with problems', `${files} saved · ${plural(problemCount, 'problem')} below`, 1);
    else { show('Done', `${files} saved`, 1); closeTimer = setTimeout(() => window.close(), 2000); }
    $('#bClose').focus();
  }

  async function readBytes(p, name) {
    const f = await desk.readFile(p);
    if (f.error) { problem(`${name}: couldn't read it (${f.error})`); return null; }
    return new Uint8Array(f.data);
  }
  async function countPages(p, name) {
    const bytes = await readBytes(p, name); if (!bytes) return 0;
    try { const doc = await (await Ops.pdfjs()).getDocument({ data: bytes, ...Ops.PDFJS_OPTS }).promise; const n = doc.numPages; await doc.destroy(); return n; }
    catch (e) { problem(e?.name === 'PasswordException' ? `${name}: it's password-protected` : `${name}: it may be damaged or not a PDF`); return 0; }
  }

  async function batch({ task, paths }) {
    const split = task.startsWith('split'), inFolder = task.endsWith('-folder');
    const verb = split ? 'Splitting' : 'Making images of';
    const jobs = [];
    for (const [k, p] of paths.entries()) {
      if (cancelled) return;
      const name = fileOf(p);
      show(`Opening ${name}`, paths.length > 1 ? `File ${k + 1} of ${paths.length}` : '', 0);
      const n = await countPages(p, name); if (!n) continue;
      if (split && n < 2) { problem(`${name}: only one page — nothing to split`); continue; }
      const base = Ops.baseName(name), dir = inFolder ? join(dirOf(p), folderName(name)) : dirOf(p);
      const names = Array.from({ length: n }, (_, i) => split ? `${base}-${i + 1}.pdf` : Ops.imageName(base, i, n, 'jpg'));
      jobs.push({ path: p, name, n, dir, names });
    }
    if (!jobs.length || cancelled) return;
    const final = await desk.resolveNames(jobs.map(j => ({ dir: j.dir, names: j.names })));
    if (!final) { problem(`Cancelled: nothing saved for ${jobs.length === 1 ? jobs[0].name : plural(jobs.length, 'PDF')}`); return; }
    for (const [k, j] of jobs.entries()) {
      if (cancelled) return;
      j.names = final[k];
      if (inFolder) { const r = await desk.makeDir(j.dir); if (r.error) { problem(`${j.name}: couldn't make the folder "${fileOf(j.dir)}" (${r.error})`); continue; } }
      try { await (split ? splitOne(j, verb) : imagesOne(j, verb)); }
      catch (e) { problem(`${j.name}: ${why(e)}`); }
    }
  }

  async function splitOne(j, verb) {
    const bytes = await readBytes(j.path, j.name); if (!bytes) return;
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    if (src.isEncrypted) { problem(`${j.name}: it's protected, so it can't be split`); return; }
    for (let i = 0; i < j.n; i++) {
      if (cancelled) return;
      show(`${verb} ${j.name}`, `Page ${i + 1} of ${j.n}`, i / j.n);
      const out = await PDFDocument.create(); const [pg] = await out.copyPages(src, [i]); out.addPage(pg);
      await desk.writeFile(join(j.dir, j.names[i]), await out.save());
      saved++;
    }
  }

  async function imagesOne(j, verb) {
    const bytes = await readBytes(j.path, j.name); if (!bytes) return;
    const doc = await (await Ops.pdfjs()).getDocument({ data: bytes, ...Ops.PDFJS_OPTS }).promise;
    try {
      for (let i = 0; i < j.n; i++) {
        if (cancelled) return;
        show(`${verb} ${j.name}`, `Page ${i + 1} of ${j.n}`, i / j.n);
        const { blob, dpi } = await Ops.renderPage(doc, i, DPI, 'image/jpeg', JPG_QUALITY);
        if (dpi < DPI) problem(`${j.name}: page ${i + 1} is very large, so it was made at ${dpi} dpi`);
        await desk.writeFile(join(j.dir, j.names[i]), await blob.arrayBuffer());
        saved++;
      }
    } finally { await doc.destroy(); }
  }
})();
```

- [ ] **Step 10: Run the tests — must pass**
```bash
cd "$T" && unset ELECTRON_RUN_AS_NODE && node menu-test.js tasks && node nozip-test.js
```
Expected: menu-test `ALL PASS` (≈30 checks); nozip-test no FAIL (the `pick-folder` refactor keeps its wording:
"4 of these files are already in this folder.").

- [ ] **Step 11: Commit**
```bash
git add main.js preload.js app/task.html app/task.js
git commit -m "feat(menu): task window for Split and Images from the Explorer menu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Combine from the menu

**Files:**
- Modify: `app/index.html` (`combinePaths`, `d.saveDir`, `saveAsActive`, `desk.onCombinePaths`), `preload.js`, `main.js` (`save-dialog`)
- Test: `<scratch>\t\menu-test-combine.js`

**Interfaces:**
- Consumes: main sends `combine-paths` (string[], name-sorted) — Task 4's `handleTask`/`sendToMain`.
- Produces: preload `onCombinePaths(fn)`, `saveDialog(defaultName, data, kind, dir?)`; main `save-dialog` accepts `dir`.

- [ ] **Step 1: Write the failing test** `<scratch>\t\menu-test-combine.js`
```js
// Combine from the Explorer menu: one new tab "Combined.pdf", name order, Save As starts in the files' folder.
const { PDFDocument } = require('E:/_httdocs/SastraPDF/node_modules/pdf-lib');
const fs = require('fs'), path = require('path');
module.exports = async ({ check, until, sleep, click, makePdf, EXE, PRE, UD, OUT, env, watch, _electron }) => {
  const C = path.join(OUT, 'c');
  await makePdf(path.join(C, 'Test 01.pdf'), 3, 500, 700);
  await makePdf(path.join(C, 'Test 02.pdf'), 2, 520, 700);
  await makePdf(path.join(C, 'Test 10.pdf'), 4, 540, 700);
  fs.writeFileSync(path.join(C, 'bad.pdf'), 'not a pdf');
  let app = globalThis.__app, main = globalThis.__main;
  if (!app) {   // section run alone
    app = await _electron.launch({ executablePath: EXE, args: [...PRE, '--user-data-dir=' + UD], env });
    main = await app.firstWindow(); watch(main); globalThis.__app = app; globalThis.__main = main;
    await app.evaluate(({ dialog }) => {
      globalThis.__dlg = { box: 1, boxes: [], saves: [], saveTo: null };
      dialog.showSaveDialog = async (_w, o) => { globalThis.__dlg.saves.push(o.defaultPath); return globalThis.__dlg.saveTo ? { canceled: false, filePath: globalThis.__dlg.saveTo } : { canceled: true }; };
    });
  }
  const tabs = () => main.evaluate(() => [...document.querySelectorAll('#tabs .tab')].map(t => t.textContent.trim()));
  const n0 = (await tabs()).length;
  await click('combine', ['Test 10.pdf', 'Test 01.pdf', 'Test 02.pdf'].map(n => path.join(C, n)));   // menu order ≠ name order
  await until(async () => (await tabs()).length === n0 + 1);
  const t = await tabs();
  check('combine: one new tab "Combined.pdf"', t.length === n0 + 1 && /Combined\.pdf/.test(t.at(-1)), t.join(' / '));
  check('combine: 9 pages', await main.evaluate(() => document.querySelector('#pageOf').textContent.trim() === '/ 9'));
  check('combined tab is unsaved', await main.evaluate(() => document.title.startsWith('•')));
  const to = path.join(C, 'saved.pdf');
  await app.evaluate((_e, to) => { globalThis.__dlg.saveTo = to; globalThis.__dlg.saves = []; }, to);
  await main.keyboard.press('Control+Shift+S');
  await until(() => fs.existsSync(to));
  const saves = await app.evaluate(() => globalThis.__dlg.saves.slice());
  check('Save As starts in the files\' folder', saves.length === 1 && path.dirname(saves[0]).toLowerCase() === C.toLowerCase(), saves[0]);
  if (fs.existsSync(to)) {
    const doc = await PDFDocument.load(fs.readFileSync(to));
    const w = doc.getPages().map(p => Math.round(p.getWidth())).join();
    check('pages in name order: 01, 02, 10', w === '500,500,500,520,520,540,540,540,540', w);
  }
  await click('combine', [path.join(C, 'Test 01.pdf'), path.join(C, 'bad.pdf')]);
  await until(() => main.evaluate(() => /needs at least two readable PDFs/.test(document.querySelector('.toast')?.textContent || '')), 10000);
  check('one good + one damaged → error toast naming it, no new tab', (await tabs()).length === n0 + 1 && await main.evaluate(() => /bad\.pdf/.test(document.querySelector('.toast')?.textContent || '')));
};
```

- [ ] **Step 2: Run it — must fail**

Run: `cd "$T" && unset ELECTRON_RUN_AS_NODE && node menu-test.js combine` → `FAIL  combine: one new tab "Combined.pdf"`.

- [ ] **Step 3: preload.js** — change `saveDialog` and add `onCombinePaths`:
```js
  saveDialog: (defaultName, data, kind, dir) => ipcRenderer.invoke('save-dialog', { defaultName, data, kind, dir }),
  onCombinePaths: fn => ipcRenderer.on('combine-paths', (_e, paths) => fn(paths)),
```

- [ ] **Step 4: main.js `save-dialog`** — accept a start folder:
```js
ipcMain.handle('save-dialog', async (_e, { defaultName, data, kind, dir }) => {
  const ext = (path.extname(defaultName).slice(1) || 'pdf').toLowerCase();
  const names = { pdf: 'PDF document', png: 'PNG image', jpg: 'JPEG image' };
  const start = typeof dir === 'string' && path.isAbsolute(dir) && await isDir(dir) ? dir : (lastDir || app.getPath('documents'));
  const r = await dialog.showSaveDialog(win, {
    title: kind === 'export' ? 'Export' : 'Save As',
    defaultPath: path.join(start, defaultName),
    filters: [{ name: names[ext] || ext.toUpperCase(), extensions: [ext] }]
  });
  if (r.canceled || !r.filePath) return null;
  lastDir = path.dirname(r.filePath);
  await fs.writeFile(r.filePath, Buffer.from(data));
  return r.filePath;
});
```
(`isDir` comes from Task 4 Step 5; it is a module-level `const`, so it exists by the time any IPC handler runs.)

- [ ] **Step 5: index.html** — after `async function combine(){ … }` add:
```js
// Combine from the File Explorer menu (main.js sends the paths in name order): one new unsaved tab.
async function combinePaths(paths){
  while (state.busy) await new Promise(r => setTimeout(r, 200));
  await busy(`Combining ${paths.length} files…`, async () => {
    const out = await PDFDocument.create(), bad = []; let used = 0;
    for (const p of paths) {
      const f = await desk.readFile(p);
      if (f.error) { bad.push(f.name); continue; }
      try {
        const src = await PDFDocument.load(new Uint8Array(f.data), { ignoreEncryption:true });
        if (src.isEncrypted) { bad.push(f.name); continue; }
        (await out.copyPages(src, src.getPageIndices())).forEach(pg => out.addPage(pg)); used++;
      } catch { bad.push(f.name); }
    }
    const skipped = bad.length ? ` Couldn't read: ${bad.join(', ')}` : '';
    if (used < 2) { toast(`Combine needs at least two readable PDFs.${skipped}`, true); return; }
    const d = await openBytes(await out.save(), 'Combined.pdf', { dirty:true });
    if (d) { d.saveDir = paths[0].replace(/[\\/][^\\/]*$/, ''); toast(`Combined ${used} files · ${d.n} pages.${skipped}`, !!bad.length); }
  });
}
```
- In `saveAsActive`, change the `desk.saveDialog(…)` call to pass the folder:
  `desk.saveDialog(/\.pdf$/i.test(d.name) ? d.name : d.name + '.pdf', d.bytes.slice().buffer, 'save', d.saveDir || null)`
- In the `if (desk) { … }` block, after `desk.onOpenPaths(openPaths);` add `desk.onCombinePaths(combinePaths);`

- [ ] **Step 6: Run everything — must pass**
```bash
cd "$T" && unset ELECTRON_RUN_AS_NODE && node menu-test.js && node nozip-test.js && node print-test.js
```
Expected: menu-test `ALL PASS` (tasks + combine); no FAIL in the others.

- [ ] **Step 7: Commit**
```bash
git add app/index.html preload.js main.js
git commit -m "feat(menu): Combine from the Explorer menu opens one new tab; Save As starts in the files' folder" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Installer and the real menu (with the user)

**Files:**
- Create: `build/installer.nsh`
- Modify: `package.json` (`dist`, `dist:portable`, `files`, `extraResources`, `nsis.include`), `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `explorer-menu/out/*` (Task 1), `--explorer-menu=…` (Task 2), the task window and combine (Tasks 4–5).

- [ ] **Step 1: Write `build/installer.nsh`**
```nsis
; Sastra PDF — extra installer steps (electron-builder nsis.include): the File Explorer right-click menu.
; The app does the work (explorer-menu.js). Windows 11 shows one UAC prompt to add the menu package;
; No / no admin / silent install → classic menu. Updates keep the menu (only the DLL is freed).
!macro customInstall
  DetailPrint "Adding Sastra PDF to the File Explorer right-click menu..."
  ${if} ${Silent}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --explorer-menu=install --silent'
  ${else}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --explorer-menu=install'
  ${endif}
!macroend

!macro customUnInstall
  ${if} ${isUpdated}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --explorer-menu=release'
  ${else}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --explorer-menu=uninstall'
  ${endif}
!macroend
```

- [ ] **Step 2: package.json**
- `"scripts"`: `"dist": "node scripts/build-explorer-menu.js && electron-builder --win nsis"`,
  `"dist:portable": "node scripts/build-explorer-menu.js && electron-builder --win portable"`.
- `"build"."files"`: add `"explorer-menu.js"` after `"preload.js"`.
- `"build"`: add
  `"extraResources": [{ "from": "explorer-menu/out", "to": "explorer-menu", "filter": ["SastraMenu.dll", "SastraPDF.ExplorerMenu.msix"] }],`
- `"build"."nsis"`: add `"include": "build/installer.nsh"`.

- [ ] **Step 3: `.github/workflows/release.yml`** — before "Build the installer" add:
```yaml
      - name: Build the File Explorer menu (C++ DLL + package; needs the runner's Visual Studio + Windows SDK)
        run: node scripts/build-explorer-menu.js
```

- [ ] **Step 4: Build and check the files**
```bash
cd /e/_httdocs/SastraPDF && unset ELECTRON_RUN_AS_NODE && npm run dist
ls "dist/win-unpacked/resources/explorer-menu" && ls dist/*.exe
```
Expected: `SastraMenu.dll  SastraPDF.ExplorerMenu.msix` and `dist/Sastra PDF Setup 1.0.2.exe`. (EPERM on
`win-unpacked.tmp` → delete it and run again; see CLAUDE.md gotchas.)

- [ ] **Step 5: Packaged app tests**
```bash
cd "$T" && unset ELECTRON_RUN_AS_NODE && PACKED=1 node menu-test.js && PACKED=1 node nozip-test.js && PACKED=1 node print-test.js && PACKED=1 node ops-test.js
```
Expected: no FAIL lines.

- [ ] **Step 6: Real menu, Windows 11 path (ask the user first)**

Ask the user to close their own Sastra PDF, then run (PowerShell) and tell them to click **Yes** on the prompt:
```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$exe = 'E:\_httdocs\SastraPDF\dist\win-unpacked\Sastra PDF.exe'
$p = Start-Process $exe '--explorer-menu=install' -Wait -PassThru; "exit $($p.ExitCode)"
Get-AppxPackage SastraPDF.ExplorerMenu | Format-List Name, Version
reg query "HKCU\Software\Sastra PDF\ExplorerMenu"
reg query "HKCU\Software\Classes\SystemFileAssociations\.pdf\shell\SastraPDF" 2>&1 | Select-Object -First 1
```
Expected: `exit 0`; package version `1.0.0.0`; state `Mode package`, `Location …\dist\win-unpacked`; the classic key
query says it can't find the key. Then make a test folder (copies of `ten.pdf`, `Test 01/02/10.pdf`, a Khmer-named
PDF), open it with `explorer.exe <folder>` and ask the user to: select one PDF → right-click → first menu shows
**Sastra PDF ▸** with 4 items (no Combine); select 3 → **Combine 3 files** appears; click each item once. Verify the
files appeared (names/counts as in menu-test) and the combined tab opened with pages in name order.

- [ ] **Step 7: Free the DLL while it is loaded, then uninstall**
```powershell
$dll = 'E:\_httdocs\SastraPDF\dist\win-unpacked\resources\explorer-menu\SastraMenu.dll'
Start-Process $exe '--explorer-menu=release' -Wait
"dll still there: $(Test-Path $dll)"
Copy-Item 'E:\_httdocs\SastraPDF\explorer-menu\out\SastraMenu.dll' $dll   # put it back for the next steps
Start-Process $exe '--explorer-menu=uninstall' -Wait
"package: $((Get-AppxPackage SastraPDF.ExplorerMenu | Measure-Object).Count)"; reg query "HKCU\Software\Sastra PDF\ExplorerMenu" 2>&1 | Select-Object -First 1
```
Expected: `dll still there: False` (right after the user right-clicked, so the dllhost had it), `package: 0`, state key
gone. Ask the user to confirm the menu is gone.

- [ ] **Step 8: Fallback path (same code as Windows 10): user clicks No**
```powershell
$p = Start-Process $exe '--explorer-menu=install' -Wait -PassThru; "exit $($p.ExitCode)"   # user clicks No
reg query "HKCU\Software\Sastra PDF\ExplorerMenu"
reg query "HKCU\Software\Classes\SystemFileAssociations\.pdf\shell\SastraPDF"
```
Expected: `exit 0`; `Mode classic`, `Declined 1`; the verb key with `ExplorerCommandHandler`. User: right-click →
**Show more options** → **Sastra PDF ▸** → Split here and Combine work. Then, with the DLL now held by Explorer:
```powershell
Start-Process $exe '--explorer-menu=release' -Wait; "dll in place: $(Test-Path $dll)"
Get-ChildItem "$env:TEMP\Sastra PDF\old" | Select-Object Name
Copy-Item 'E:\_httdocs\SastraPDF\explorer-menu\out\SastraMenu.dll' $dll
$p = Start-Process $exe '--explorer-menu=install' -Wait -PassThru; "again: exit $($p.ExitCode), no prompt expected (Declined)"
Start-Process $exe '--explorer-menu=install --silent' -Wait
Start-Process $exe '--explorer-menu=uninstall' -Wait
reg query "HKCU\Software\Classes\SystemFileAssociations\.pdf\shell\SastraPDF" 2>&1 | Select-Object -First 1
```
Expected: `dll in place: False`, one `SastraMenu-<time>.dll` in the old folder, no UAC prompt on the second install, the
verb key gone after uninstall. Read `%TEMP%\Sastra PDF\explorer-menu.log` — one line per step, no unexpected failures.

- [ ] **Step 9: Commit**
```bash
git add build/installer.nsh package.json .github/workflows/release.yml
git commit -m "feat(menu): installer adds and removes the Explorer menu; build it in dist and CI" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Docs and final regression

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/HISTORY.md`, `docs/superpowers/specs/2026-10-15-explorer-menu-design.md` (size cap wording)

- [ ] **Step 1: CLAUDE.md**
- Project layout: add `explorer-menu/` (menu.cpp/.def, AppxManifest.xml, Assets; `out/` gitignored),
  `explorer-menu.js`, `scripts/build-explorer-menu.js`, `build/installer.nsh`, `app/task.html` + `app/task.js`,
  `app/pdfops.js` — one line each, matching the File Structure table above.
- "How app/index.html works": a bullet **Explorer menu** — DLL → list file → `--sastra-task/--sastra-list` →
  `handleTask` (combine → main window `combine-paths` → `combinePaths`, `d.saveDir`; split/images → task window,
  `task-batch`, one `resolve-names` question per click, `make-dir`); registration modes (package / classic, state in
  `HKCU\Software\Sastra PDF\ExplorerMenu`, `Declined` stops repeat prompts until a full uninstall); `release` on update.
- Known build gotchas: building needs VS Build Tools (C++ x64) + Windows SDK (`npm run dist` runs
  `build-explorer-menu.js`); per-user `Add-AppxPackage -AllowUnsigned` fails with 0x80073D2B (needs admin); testing
  the real menu needs the user's own Sastra PDF closed; bump `PKG_VERSION` + manifest Version together only when the
  manifest changes (that's what makes the installer ask for admin again).
- Status: "Explorer menu added 2026-10-15" with the test results (harness, unit, menu-test, packaged run, user's
  right-click checks) and what wasn't tested (real Windows 10, a PC without admin).
- Ideas not built yet: remove nothing; add "Signing would let the Windows 11 menu install without admin".

- [ ] **Step 2: README.md** — Features: add "Right-click PDFs in File Explorer: Combine, Split (here or into a folder),
  Images (JPG 300 dpi). On Windows 11 the installer asks once for permission to put it in the first menu; otherwise
  it's under Show more options." Requirements (to build): add Visual Studio Build Tools with C++ and the Windows SDK.

- [ ] **Step 3: docs/HISTORY.md** — append a numbered section quoting the request ("add right click on selected pdf
  file in explorer: 1. combind … 2. split pdf here or in folder … 3. extract pdf to image …") and the decisions
  (first Windows 11 menu; unsigned package with one UAC prompt, classic fallback; Combine opens in the app; split one
  file per page; JPG 300 dpi fixed), plus the spike result.

- [ ] **Step 4: Spec wording** — in the design doc change "A page that would exceed 16 384 px on a side at 300 dpi
  is drawn at the largest dpi that fits, noted." to "…exceed 16 384 px on a side or 64 megapixels…", and in §5 drop
  "uses a scratch userData folder" (the helper exits before Electron is ready, so it never uses one).

- [ ] **Step 5: Final regression**
```bash
cd "$T" && unset ELECTRON_RUN_AS_NODE && node unit-test.js && node menu-test.js && node ops-test.js && node nozip-test.js && node print-test.js \
  && "$T\\harness\\menu-harness.exe" 'E:\_httdocs\SastraPDF\explorer-menu\out\SastraMenu.dll' "$T\\harness\\files" "$T\\harness\\stub.exe"
```
Expected: every script ends with ALL PASS / no FAIL lines.

- [ ] **Step 6: Commit**
```bash
git add CLAUDE.md README.md docs/HISTORY.md docs/superpowers/specs/2026-10-15-explorer-menu-design.md
git commit -m "docs: the Explorer right-click menu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Then use superpowers:finishing-a-development-branch (merge / PR is the user's call; the full installer run that
replaces the user's installed copy happens only with their OK, at release time).
