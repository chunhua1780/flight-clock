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
    refreshUseWeb();
    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(false); s.setGeolocationEnabled(true); s.setCacheMode(WebSettings.LOAD_NO_CACHE);
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl(); if (!HOST.equals(u.getHost())) return null;
        String p = u.getPath(); if (p == null || p.equals("/")) p = "/index.html";
        // 先用自动更新下载的新版（files/web/…），没有再用 App 里自带的
        try { java.io.File f = new java.io.File(webDir(), p.substring(1)); if (useWeb && f.isFile()) return new WebResourceResponse(mime(p), "utf-8", new java.io.FileInputStream(f)); } catch (Exception e) { }
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
      @Override public void onGeolocationPermissionsShowPrompt(String origin, android.webkit.GeolocationPermissions.Callback cb) { cb.invoke(origin, gpsOk(), false); }
      @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
        fileCb = cb; try { startActivityForResult(p.createIntent(), 2); } catch (Exception e) { fileCb = null; cb.onReceiveValue(null); }
        return true;
      }
    });
    web.addJavascriptInterface(new Bridge(), "AndroidPanel");
    setContentView(web);
    open(getIntent());
    checkUpdate(); new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() { public void run() { checkUpdate(); new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(this, 6 * 3600 * 1000L); } }, 6 * 3600 * 1000L);
    // 一打开就要相机权限（扫码用），不要等到扫码时才问
    if (!camOk() || !gpsOk()) requestPermissions(new String[] { Manifest.permission.CAMERA, Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, 1);
    startGps();
  }
  /* ---------- 手机自己的 GPS（飞行模式下也能用，不要网络）：网页每分钟来取最新位置 ---------- */
  volatile String lastFix = "";
  boolean gpsOn = false;
  boolean gpsOk() { return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED; }
  void startGps() {
    if (gpsOn || !gpsOk()) return;
    try {
      android.location.LocationManager lm = (android.location.LocationManager) getSystemService(LOCATION_SERVICE);
      android.location.LocationListener li = new android.location.LocationListener() {
        public void onLocationChanged(android.location.Location l) {
          lastFix = "{\"lat\":" + l.getLatitude() + ",\"lon\":" + l.getLongitude() + ",\"alt\":" + (l.hasAltitude() ? Math.round(l.getAltitude() * 3.28084) : -1)
            + ",\"gs\":" + (l.hasSpeed() ? Math.round(l.getSpeed() * 1.94384) : -1) + ",\"trk\":" + (l.hasBearing() ? Math.round(l.getBearing()) : -1)
            + ",\"acc\":" + (l.hasAccuracy() ? Math.round(l.getAccuracy()) : -1) + ",\"t\":" + l.getTime() + "}";
        }
        public void onStatusChanged(String p, int s, Bundle b) { }
        public void onProviderEnabled(String p) { }
        public void onProviderDisabled(String p) { }
      };
      lm.requestLocationUpdates(android.location.LocationManager.GPS_PROVIDER, 10000L, 0f, li, android.os.Looper.getMainLooper());
      gpsOn = true;
    } catch (Exception e) { }
  }
  /* ---------- 自动更新页面：比较网站上的 files.json 版本，新了就整套下载，换上，重新载入 ---------- */
  static final String UPD = "https://chunhua1780.github.io/flight-cloch/panel/";
  volatile boolean useWeb = false;   // 下载的新版比 App 自带的新，才用下载的
  void refreshUseWeb() { String d = getSharedPreferences("upd", 0).getString("v", ""); useWeb = d.compareTo(bundledVer()) > 0 && webDir().isDirectory(); }
  java.io.File webDir() { return new java.io.File(getFilesDir(), "web"); }
  String bundledVer() { try { java.io.InputStream in = getAssets().open("panel/files.json"); String t = new java.util.Scanner(in, "UTF-8").useDelimiter("\\A").next(); in.close(); return new org.json.JSONObject(t).optString("v", "0"); } catch (Exception e) { return "0"; } }
  String curVer() { String d = getSharedPreferences("upd", 0).getString("v", ""); String b = bundledVer(); return d.compareTo(b) > 0 && webDir().isDirectory() ? d : b; }
  static byte[] get(String u) throws Exception {
    java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(u).openConnection(); c.setConnectTimeout(15000); c.setReadTimeout(60000); c.setUseCaches(false);
    if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
    java.io.InputStream in = c.getInputStream(); ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] b = new byte[32768]; int n; while ((n = in.read(b)) > 0) o.write(b, 0, n); in.close(); return o.toByteArray();
  }
  void checkUpdate() { checkUpdate(false); }
  void checkUpdate(final boolean manual) {
    new Thread(new Runnable() { public void run() { try {
      org.json.JSONObject j = new org.json.JSONObject(new String(get(UPD + "files.json?ts=" + System.currentTimeMillis()), "UTF-8"));
      String v = j.optString("v", ""); if (v.compareTo(curVer()) <= 0) { if (manual) runOnUiThread(new Runnable() { public void run() { Toast.makeText(MainActivity.this, "已经是最新 · Up to date (" + curVer() + ")", Toast.LENGTH_LONG).show(); web.evaluateJavascript("MSG='✅ 已经是最新';draw()", null); } }); return; }
      org.json.JSONArray fs = j.getJSONArray("files"); java.io.File tmp = new java.io.File(getFilesDir(), "web_new"); del(tmp); tmp.mkdirs();
      for (int i = 0; i < fs.length(); i++) { String f = fs.getString(i); if (f.contains("..") || f.startsWith("/")) continue;
        byte[] b = get(UPD + f + "?v=" + v); java.io.File out = new java.io.File(tmp, f); out.getParentFile().mkdirs(); java.io.FileOutputStream w = new java.io.FileOutputStream(out); w.write(b); w.close(); }
      java.io.FileOutputStream w = new java.io.FileOutputStream(new java.io.File(tmp, "files.json")); w.write(j.toString().getBytes("UTF-8")); w.close();
      java.io.File cur = webDir(), old = new java.io.File(getFilesDir(), "web_old"); del(old); if (cur.exists()) cur.renameTo(old); tmp.renameTo(cur); del(old);
      getSharedPreferences("upd", 0).edit().putString("v", v).commit(); refreshUseWeb();
      runOnUiThread(new Runnable() { public void run() { Toast.makeText(MainActivity.this, "副屏已自动更新 · Panel updated", Toast.LENGTH_SHORT).show(); web.reload(); } });
    } catch (final Exception e) { if (manual) runOnUiThread(new Runnable() { public void run() { Toast.makeText(MainActivity.this, "检查更新失败：" + e.getMessage(), Toast.LENGTH_LONG).show(); } }); } } }).start();
  }
  static void del(java.io.File f) { if (f == null || !f.exists()) return; java.io.File[] k = f.listFiles(); if (k != null) for (java.io.File x : k) del(x); f.delete(); }
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
    startGps();
    if (pending != null) { if (ok) pending.grant(pending.getResources()); else pending.deny(); pending = null; }
  }
  long lastChk = 0;
  @Override protected void onResume() { super.onResume(); if (System.currentTimeMillis() - lastChk > 30 * 60 * 1000L) { lastChk = System.currentTimeMillis(); checkUpdate(false); } if (web != null) web.evaluateJavascript("window.onCamPerm && onCamPerm(" + camOk() + ")", null); }
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
    /** GPS：最近一次定位（JSON，空 = 还没有）；gpsOk = 有没有定位权限；askGps = 要权限 */
    @JavascriptInterface public String gps() { return lastFix; }
    @JavascriptInterface public boolean gpsOk() { return MainActivity.this.gpsOk(); }
    @JavascriptInterface public void askGps() { runOnUiThread(new Runnable() { public void run() { if (gpsOk()) startGps(); else requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, 3); } }); }
    /** 0 = 关前光，0–1 = 亮度，-1 = 跟系统 */
    @JavascriptInterface public void setBrightness(final float v) {
      runOnUiThread(new Runnable() { public void run() {
        float x = v < 0 ? -1f : Math.min(0.3f, v);
        // 1) 系统亮度（有「修改系统设置」权限时）：0 才是真正关前光；只调窗口亮度时 0 会被当成「最低」，灯还微亮
        if (x >= 0 && Settings.System.canWrite(MainActivity.this)) {
          try { Settings.System.putInt(getContentResolver(), Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL);
                Settings.System.putInt(getContentResolver(), Settings.System.SCREEN_BRIGHTNESS, Math.round(x * 255)); } catch (Exception e) { }
        }
        // 2) 窗口亮度
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.screenBrightness = x < 0 ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE : x; getWindow().setAttributes(lp);
      } });
    }
    @JavascriptInterface public boolean canWrite() { return Settings.System.canWrite(MainActivity.this); }
    @JavascriptInterface public void askWrite() {
      runOnUiThread(new Runnable() { public void run() {
        Toast.makeText(MainActivity.this, "请打开「允许修改系统设置」，这样白天才能完全关掉背光", Toast.LENGTH_LONG).show();
        try { startActivity(new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + getPackageName()))); } catch (Exception e) { }
      } });
    }
    /** 老版本 WebView 没有 DecompressionStream：在这里解压二维码里的数据 */
    @JavascriptInterface public String inflate(String b64) {
      try { byte[] in = Base64.decode(b64, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        Inflater z = new Inflater(true); z.setInput(in); ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] buf = new byte[8192];
        while (!z.finished()) { int n = z.inflate(buf); if (n == 0 && (z.needsInput() || z.needsDictionary())) break; o.write(buf, 0, n); }
        z.end(); return o.toString("UTF-8"); } catch (Exception e) { return ""; }
    }
    /** 云端的 OFP 原文是 gzip：老版本 WebView 没有 DecompressionStream，在这里解压 */
    @JavascriptInterface public String gunzip(String b64) {
      try { java.util.zip.GZIPInputStream z = new java.util.zip.GZIPInputStream(new java.io.ByteArrayInputStream(Base64.decode(b64, Base64.DEFAULT)));
        ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] buf = new byte[16384]; int n; while ((n = z.read(buf)) > 0) o.write(buf, 0, n); z.close(); return o.toString("UTF-8"); } catch (Exception e) { return ""; }
    }
    @JavascriptInterface public String version() { return "4.2"; }
    /** 个人版：打包时放进去的口令（公开下载的版本里没有这个文件） */
    @JavascriptInterface public String presetKey() {
      try { java.io.InputStream in = getAssets().open("preset.txt"); byte[] b = new byte[512]; int n = in.read(b); in.close(); return n > 0 ? new String(b, 0, n, "UTF-8").trim() : ""; } catch (Exception e) { return ""; }
    }
    @JavascriptInterface public String webVer() { return curVer(); }
    @JavascriptInterface public void checkNow() { checkUpdate(true); }
    @JavascriptInterface public boolean camOk() { return MainActivity.this.camOk(); }
    @JavascriptInterface public void openSettings() { runOnUiThread(new Runnable() { public void run() { MainActivity.this.openSettings(); } }); }
  }
}
