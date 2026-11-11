!macro NSIS_HOOK_POSTINSTALL
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$INSTDIR\webview2-runtime" /grant *S-1-15-2-2:(OI)(CI)(RX) *S-1-15-2-1:(OI)(CI)(RX)'
  Pop $0
  ${If} $0 != 0
    Abort "Unable to configure WebView2 runtime access."
  ${EndIf}
!macroend
