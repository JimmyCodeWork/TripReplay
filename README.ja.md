# TripReplay

[English](README.md) | [繁體中文](README.zh-TW.md) | 日本語

> 本書は英語版の翻訳です。内容に相違がある場合は、英語版が優先されます。

TripReplay は、旅程・写真・動画から、地図で旅を振り返るアニメーション動画を作ります。処理はすべてお使いのデバイス上で行われます。

> **状況：** 1.0 に向けて開発中です。最新版は [https://jimmycodework.github.io/TripReplay/](https://jimmycodework.github.io/TripReplay/) でお試しいただけます。

## 試してみる

- **ブラウザーで：** Chrome または Edge で [https://jimmycodework.github.io/TripReplay/](https://jimmycodework.github.io/TripReplay/) を開き、アドレスバーのインストールボタンを選ぶと、ワンクリックで TripReplay を開けるデスクトップアイコンが作られます。
- **Windows で：** [リリース](https://github.com/JimmyCodeWork/TripReplay/releases)から `tripreplay-windows-…-setup.exe` をダウンロードして実行します。インストーラーはまだ署名されていないため、Windows SmartScreen の確認画面で「**詳細情報 → 実行**」を選んでください。
- **Android で：** [リリース](https://github.com/JimmyCodeWork/TripReplay/releases)から `tripreplay-android-….apk` をダウンロードします。
- **自分のパソコンで：** Node.js 24 以降がある環境で、`launch/TripReplay.cmd`（Windows）または `launch/TripReplay.command`（macOS）をダブルクリックするか、`launch/start.sh`（Linux）を実行すると、`http://localhost:4173` で TripReplay が開きます。詳しくは[ユーザーガイド §1](docs/user-guide.md#1-before-you-start)（英語）をご覧ください。

## 予定している機能

- 日ごとにまとめたスポットで旅程を作成。複数の国やタイムゾーンにまたがる旅行にも対応します。
- 写真や動画を読み込むと、GPS 情報と撮影時刻からスポットを自動で提案します。
- 上空から見た地図のアニメーションで旅を振り返ります。スポットの間にルートが描かれ、カメラが各地点にズームし、メディアが順に再生されます。
- 好きな BGM を追加し、テーマを選べます。
- 16:9 または 9:16 で、ドラッグできるタイムライン上でプレビューできます。
- ブラウザーで全画面再生できます。
- 必要な地域の地図を一度ダウンロードすれば、場所の検索も含め、すべてオフラインで使えます。
- MP4 動画（1080p または 720p、30 fps）として書き出せます。
- 英語、繁体字中国語、日本語で使えます。ブラウザーの言語に従うほか、「設定」で選ぶこともできます。
- 1.0 はブラウザーで動作し、プログレッシブウェブアプリとしてインストールできるほか、Android アプリ（APK）と Windows アプリ（インストーラー）も提供します。macOS、Linux、iOS 向けのアプリは今後提供する予定です。

## プライバシー

写真、動画、メタデータ、プロジェクトがデバイスの外に出ることはありません。アカウント、利用状況の分析、クラウドでの処理はありません。ネットワークを使うのは、アプリの読み込みと、選んだ地図のダウンロードのときだけです。場所の検索もデバイス上で行われ、TripReplay のサーバーはありません。アプリが行うすべての通信は[プライバシーに関する声明](docs/privacy.md)（英語）に記載しています。

## 貢献

英語または繁体字中国語での貢献を歓迎します。[貢献ガイド](CONTRIBUTING.md)と[行動規範](CODE_OF_CONDUCT.md)をお読みください。セキュリティやプライバシーの脆弱性は、[セキュリティポリシー](SECURITY.md)に従って報告してください。

## ドキュメント

ドキュメントは英語と繁体字中国語で提供しています。

- [ユーザーガイド](docs/user-guide.md)
- [プライバシーに関する声明](docs/privacy.md)
- [ブラウザーの対応状況と既知の問題](docs/browser-support.md)
- [ローカライズ](docs/localization.md)
- [開発ガイド](docs/development.md)
- [その他のドキュメント](README.md#documentation)

## 支援

TripReplay が役に立ったら、Ko-fi で開発を支援していただけます：

<a href="https://ko-fi.com/toolmanjimmy"><img height="36" src="https://storage.ko-fi.com/cdn/kofi2.png?v=3" alt="Buy Me a Coffee at ko-fi.com"></a>

## ライセンス

TripReplay は [MIT ライセンス](LICENSE)で公開しています。アプリに同梱するサードパーティーのコンポーネントは寛容なライセンスのものに限り、コピーレフトのライセンスは認めていません。詳しくは[依存関係のライセンスポリシー](docs/license-policy.md)（英語）をご覧ください。
