; Sastra PDF - extra installer steps (electron-builder nsis.include): the File Explorer right-click menu, fresh icons.
; The app does the work (explorer-menu.js). Windows 11 shows one UAC prompt to add the menu package;
; No / no admin / silent install -> classic menu. Updates keep the menu (only the DLL is freed).
!macro customInstall
  DetailPrint "Adding Sastra PDF to the File Explorer right-click menu..."
  ${if} ${Silent}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --explorer-menu=install --silent'
  ${else}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --explorer-menu=install'
  ${endif}
  ; An update keeps the same paths, so Windows would keep showing the old icons from its icon cache
  ; (shortcuts, taskbar, .pdf files): refresh it. The 64-bit ie4uinit sits behind Sysnative for this 32-bit installer.
  ${if} ${FileExists} "$WINDIR\Sysnative\ie4uinit.exe"
    ExecWait '"$WINDIR\Sysnative\ie4uinit.exe" -show'
  ${else}
    ExecWait '"$SYSDIR\ie4uinit.exe" -show'
  ${endif}
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0x1000, 0, 0)'   ; SHCNE_ASSOCCHANGED, SHCNF_FLUSH
!macroend

!macro customUnInstall
  ${if} ${isUpdated}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --explorer-menu=release'
  ${else}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --explorer-menu=uninstall'
  ${endif}
!macroend
