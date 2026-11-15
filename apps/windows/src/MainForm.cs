using System.Diagnostics;
using System.IO;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace TripReplay.Windows;

/// <summary>
/// The application's window: the Web application in Microsoft Edge WebView2, served from the
/// <c>web</c> folder beside the program under a virtual host, so that it has an origin of its own
/// (docs/adr/0016-windows-application.md). Links to other sites open in the default browser, and
/// the page's full screen fills the screen.
/// </summary>
internal sealed class MainForm : Form
{
    /// <summary>The page's address; a reserved name (RFC 2606) that no website can have.</summary>
    internal const string Host = "app.tripreplay.example";

    private const string WebView2Download = "https://developer.microsoft.com/microsoft-edge/webview2/";

    private readonly WebView2 view = new() { Dock = DockStyle.Fill };
    private FormBorderStyle borderBefore;
    private FormWindowState stateBefore;

    public MainForm()
    {
        Text = "TripReplay";
        using (var icon = typeof(MainForm).Assembly.GetManifestResourceStream("TripReplay.ico"))
        {
            if (icon is not null) Icon = new Icon(icon);
        }
        ClientSize = new Size(1280, 800);
        MinimumSize = new Size(480, 400);
        StartPosition = FormStartPosition.CenterScreen;
        Controls.Add(view);
        Load += async (_, _) => await StartAsync();
    }

    private async Task StartAsync()
    {
        // The trips and maps stay in the user's own folder, apart from any browser's.
        var data = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "TripReplay",
            "WebView2");
        CoreWebView2Environment environment;
        try
        {
            environment = await CoreWebView2Environment.CreateAsync(null, data);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MissingRuntime();
            return;
        }
        await view.EnsureCoreWebView2Async(environment);
        var core = view.CoreWebView2;

        core.SetVirtualHostNameToFolderMapping(
            Host,
            Path.Combine(AppContext.BaseDirectory, "web"),
            CoreWebView2HostResourceAccessKind.Allow);
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDevToolsEnabled = Debugger.IsAttached;
        core.DocumentTitleChanged += (_, _) => Text = core.DocumentTitle;
        core.ContainsFullScreenElementChanged += (_, _) => SetFullScreen(core.ContainsFullScreenElement);
        core.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            OpenOutside(e.Uri);
        };
        core.NavigationStarting += (_, e) =>
        {
            if (IsOwnPage(e.Uri)) return;
            e.Cancel = true;
            OpenOutside(e.Uri);
        };
        core.Navigate($"https://{Host}/index.html");
    }

    /// <summary>Whether a navigation stays in the application: its own pages, and files it makes, such as downloads.</summary>
    internal static bool IsOwnPage(string uri) =>
        uri.StartsWith($"https://{Host}/", StringComparison.OrdinalIgnoreCase)
        || uri.StartsWith("blob:", StringComparison.OrdinalIgnoreCase)
        || uri.StartsWith("data:", StringComparison.OrdinalIgnoreCase)
        || uri.StartsWith("about:", StringComparison.OrdinalIgnoreCase);

    /// <summary>Opens a link to another site in the default browser; other kinds of address are ignored.</summary>
    private static void OpenOutside(string uri)
    {
        if (!Uri.TryCreate(uri, UriKind.Absolute, out var parsed)) return;
        if (parsed.Scheme != Uri.UriSchemeHttps && parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeMailto) return;
        Process.Start(new ProcessStartInfo(parsed.AbsoluteUri) { UseShellExecute = true });
    }

    /// <summary>Fills the whole screen, taskbar included, while the page shows something full screen.</summary>
    private void SetFullScreen(bool on)
    {
        if (on)
        {
            borderBefore = FormBorderStyle;
            stateBefore = WindowState;
            FormBorderStyle = FormBorderStyle.None;
            // A maximized window covers the taskbar only when it maximizes without a border.
            WindowState = FormWindowState.Normal;
            WindowState = FormWindowState.Maximized;
        }
        else
        {
            FormBorderStyle = borderBefore;
            WindowState = stateBefore;
        }
    }

    private void MissingRuntime()
    {
        var english = "TripReplay needs the Microsoft Edge WebView2 Runtime, which is part of Windows 10 and 11 but missing here. Open the download page?";
        var chinese = "TripReplay 需要 Microsoft Edge WebView2 Runtime；Windows 10 與 11 通常已內建，但這台電腦上找不到。要開啟下載頁面嗎？";
        var text = System.Globalization.CultureInfo.CurrentUICulture.Name.StartsWith("zh", StringComparison.Ordinal) ? chinese : english;
        if (MessageBox.Show(this, text, "TripReplay", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes)
        {
            OpenOutside(WebView2Download);
        }
        Close();
    }
}
