; Sastra PDF - extra installer steps (electron-builder nsis.include): the File Explorer right-click menu.
; The app does the work (explorer-menu.js). Windows 11 shows one UAC prompt to add the menu package;
; No / no admin / silent install -> classic menu. Updates keep the menu (only the DLL is freed).
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
