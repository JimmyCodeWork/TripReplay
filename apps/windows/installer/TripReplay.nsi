; The installer of the Windows application (docs/adr/0016-windows-application.md), built by
; apps/windows/build.sh with makensis:
;   makensis -DVERSION=<x.y.z> -DSOURCE=<published folder> -DOUTFILE=<setup.exe> TripReplay.nsi
; It installs for the current user, without administrator rights, and keeps the trips on uninstall.
; Only NSIS's zlib compression is used: its LZMA (CPL) and bzip2 modules are not admissible
; (docs/license-policy.md).

Unicode true
ManifestDPIAware true
SetCompressor /SOLID zlib
RequestExecutionLevel user

!include "MUI2.nsh"
!include "LogicLib.nsh"

!define NAME "TripReplay"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\TripReplay"
; The Evergreen WebView2 Runtime, for all users or for the current user.
!define WEBVIEW2_KEY "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
!define WEBVIEW2_USER_KEY "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

Name "${NAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${NAME}"
InstallDirRegKey HKCU "${UNINSTALL_KEY}" "InstallLocation"
BrandingText "${NAME} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${NAME}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "${NAME} Setup"
VIAddVersionKey "LegalCopyright" "Copyright (c) TripReplay contributors. MIT License."

!define MUI_ICON "${SOURCE}\..\..\src\TripReplay.ico"
!define MUI_UNICON "${SOURCE}\..\..\src\TripReplay.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\TripReplay.exe"

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; The installer follows the language of Windows, and falls back to the first, English.
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "TradChinese"
!insertmacro MUI_LANGUAGE "Japanese"

LangString NoWebView2 ${LANG_ENGLISH} "TripReplay needs the Microsoft Edge WebView2 Runtime, which is part of Windows 10 and 11 but was not found. Install it from https://developer.microsoft.com/microsoft-edge/webview2/ before starting TripReplay."
LangString NoWebView2 ${LANG_TRADCHINESE} "TripReplay 需要 Microsoft Edge WebView2 Runtime；Windows 10 與 11 通常已內建，但這台電腦上找不到。啟動 TripReplay 前，請先從 https://developer.microsoft.com/microsoft-edge/webview2/ 安裝。"
LangString NoWebView2 ${LANG_JAPANESE} "TripReplay には Microsoft Edge WebView2 Runtime が必要です。Windows 10 と 11 には通常含まれていますが、このパソコンでは見つかりませんでした。TripReplay を起動する前に https://developer.microsoft.com/microsoft-edge/webview2/ からインストールしてください。"
LangString KeptTrips ${LANG_ENGLISH} "Your trips and maps are kept in $LOCALAPPDATA\TripReplay. Delete that folder to remove them too."
LangString KeptTrips ${LANG_TRADCHINESE} "您的旅行與地圖仍保留在 $LOCALAPPDATA\TripReplay。若要一併移除，請刪除該資料夾。"
LangString KeptTrips ${LANG_JAPANESE} "旅行と地図は $LOCALAPPDATA\TripReplay に残っています。これらも削除するには、このフォルダーを削除してください。"

Section "TripReplay"
  ; An earlier version is replaced whole, so that no file of it is left behind.
  RMDir /r "$INSTDIR\web"
  SetOutPath "$INSTDIR"
  File /r "${SOURCE}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateShortCut "$SMPROGRAMS\${NAME}.lnk" "$INSTDIR\TripReplay.exe"
  CreateShortCut "$DESKTOP\${NAME}.lnk" "$INSTDIR\TripReplay.exe"

  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "TripReplay contributors"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\TripReplay.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "URLInfoAbout" "https://github.com/JimmyCodeWork/TripReplay"
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1

  ; The runtime is part of Windows 10 and 11; it is never bundled (docs/license-policy.md §2).
  ReadRegStr $0 HKLM "${WEBVIEW2_KEY}" "pv"
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    ReadRegStr $0 HKCU "${WEBVIEW2_USER_KEY}" "pv"
  ${EndIf}
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(NoWebView2)"
  ${EndIf}
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\${NAME}.lnk"
  Delete "$DESKTOP\${NAME}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  ; The trips and maps stay in $LOCALAPPDATA\TripReplay, as with a browser's data.
  DetailPrint "$(KeptTrips)"
SectionEnd
