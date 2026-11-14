package net.flightpanel;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayOutputStream;
import java.util.zip.Inflater;

/** 副屏：全屏、常亮、锁屏上也显示；页面打包在 App 里，完全离线。白天关前光、夜里开（由页面按太阳高度决定）。 */
public class MainActivity extends Activity {
  static final String HOST = "appassets.androidplatform.net", BASE = "https://" + HOST + "/";
  WebView web; PermissionRequest pending; ValueCallback<Uri[]> fileCb;

  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(false); s.setCacheMode(WebSettings.LOAD_NO_CACHE);
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl(); if (!HOST.equals(u.getHost())) return null;
        String p = u.getPath(); if (p == null || p.equals("/")) p = "/index.html";
        try { return new WebResourceResponse(mime(p), "utf-8", getAssets().open("panel" + p)); }
        catch (Exception e) { return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, null); }
      }
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return !HOST.equals(r.getUrl().getHost()); }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public void onPermissionRequest(PermissionRequest r) {
        if (camOk()) { r.grant(r.getResources()); return; }
        pending = r; requestPermissions(new String[] { Manifest.permission.CAMERA }, 1);
      }
      @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
        fileCb = cb; try { startActivityForResult(p.createIntent(), 2); } catch (Exception e) { fileCb = null; cb.onReceiveValue(null); }
        return true;
      }
    });
    web.addJavascriptInterface(new Bridge(), "AndroidPanel");
    setContentView(web);
    open(getIntent());
    // 一打开就要相机权限（扫码用），不要等到扫码时才问
    if (!camOk()) requestPermissions(new String[] { Manifest.permission.CAMERA }, 1);
  }
  static String mime(String p) {
    if (p.endsWith(".html")) return "text/html"; if (p.endsWith(".js")) return "application/javascript";
    if (p.endsWith(".json")) return "application/json"; if (p.endsWith(".png")) return "image/png"; return "application/octet-stream";
  }
  void open(Intent i) {
    Uri d = i == null ? null : i.getData(); String f = d == null ? null : d.getEncodedFragment();
    web.loadUrl(BASE + "index.html" + (f != null && f.length() > 2 ? "#" + f : ""));
  }
  @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); if (i.getData() != null) open(i); }
  boolean camOk() { return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED; }
  void openSettings() {
    Toast.makeText(this, "请在「权限」里打开「相机」 · Turn on Camera in Permissions", Toast.LENGTH_LONG).show();
    try { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); } catch (Exception e) { }
  }
  @Override public void onRequestPermissionsResult(int c, String[] p, int[] g) {
    boolean ok = g.length > 0 && g[0] == PackageManager.PERMISSION_GRANTED;
    if (pending != null) { if (ok) pending.grant(pending.getResources()); else pending.deny(); pending = null; }
  }
  @Override protected void onResume() { super.onResume(); if (web != null) web.evaluateJavascript("window.onCamPerm && onCamPerm(" + camOk() + ")", null); }
  @Override protected void onActivityResult(int c, int res, Intent data) {
    if (c == 2 && fileCb != null) { fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data)); fileCb = null; }
  }
  @Override public void onWindowFocusChanged(boolean f) {
    super.onWindowFocusChanged(f);
    if (f) getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
      | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
  }
  @Override public void onBackPressed() { }   // 不小心按到返回键不退出

  class Bridge {
    /** 0 = 关前光，0–1 = 亮度，-1 = 跟系统 */
    @JavascriptInterface public void setBrightness(final float v) {
      runOnUiThread(new Runnable() { public void run() { WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.screenBrightness = v < 0 ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE : Math.min(0.3f, v); getWindow().setAttributes(lp); } });
    }
    /** 老版本 WebView 没有 DecompressionStream：在这里解压二维码里的数据 */
    @JavascriptInterface public String inflate(String b64) {
      try { byte[] in = Base64.decode(b64, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        Inflater z = new Inflater(true); z.setInput(in); ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] buf = new byte[8192];
        while (!z.finished()) { int n = z.inflate(buf); if (n == 0 && (z.needsInput() || z.needsDictionary())) break; o.write(buf, 0, n); }
        z.end(); return o.toString("UTF-8"); } catch (Exception e) { return ""; }
    }
    @JavascriptInterface public String version() { return "3.1"; }
    /** 个人版：打包时放进去的口令（公开下载的版本里没有这个文件） */
    @JavascriptInterface public String presetKey() {
      try { java.io.InputStream in = getAssets().open("preset.txt"); byte[] b = new byte[512]; int n = in.read(b); in.close(); return n > 0 ? new String(b, 0, n, "UTF-8").trim() : ""; } catch (Exception e) { return ""; }
    }
    @JavascriptInterface public boolean camOk() { return MainActivity.this.camOk(); }
    @JavascriptInterface public void openSettings() { runOnUiThread(new Runnable() { public void run() { MainActivity.this.openSettings(); } }); }
  }
}
