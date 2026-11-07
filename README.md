# Flight Clock ✈️🕰

一块放在家里或 iPad 上的「飞行员时钟」：自动读取 Google 日历里的排班，显示下一班几点起飞、从哪飞哪；航班起飞后显示地图和飞机实时轨迹；驻外期间同时显示两地的时间和天气。

## 三种画面（自动切换）

| 状态 | 什么时候 | 显示什么 |
|---|---|---|
| **在家** | 人在基地（DXB / DWC） | 迪拜大时钟、日期、迪拜天气；下一班：航班号、航线、接车时间、起飞时间（当地）、到达时间、倒计时；之后的几个航班 |
| **飞行中** | 起飞前 15 分钟 ～ 落地后 30 分钟 | 地图 + 大圆航线 + 飞机位置和轨迹；已飞/剩余时间、进度、预计到达（当地时间）、迪拜和目的地时间、高度、地速、剩余距离、目的地天气 |
| **驻外** | 上一班落在外站，或下一班从外站出发 | 左右两个时钟：外站当地时间 + 迪拜时间，各自的天气；已到达多久、驻外共多久；回程航班信息和倒计时 |

- 有 ADS-B 信号时用**实时位置**（绿色 LIVE），没有信号时按时刻表**估算位置**（蓝色）。
- 屏幕常亮、夜间自动变暗、防烧屏轻微移动、断网时显示缓存数据。

想先看效果，在网址后面加 `?demo=home`、`?demo=layover` 或 `?demo=flight`。

## 安装步骤

### 1. 把排班放进 Google 日历
**推荐：CrewPulse 同步的日历直接就能用。** 每个任务一个日程，标题如 `89876-CAN-DWC`，开始时间 = 报到时间，备注里逐段写航班（时间是各机场当地时间）：

```
9876
 DWC - 08 Nov 2026 09:00
 CAN - 08 Nov 2026 20:00

9873
 CAN - 11 Nov 2026 12:50
 DWC - 11 Nov 2026 17:25
```

时钟会把它拆成两段航班，自动算出：明天 07:35 报到、09:00 起飞；落地后显示广州驻外；11 号回程。

备注里没有分段的话，就按标题当单段航班（开始 = 起飞，结束 = 到达），标题这样写都能识别：`EK302 DXB-PVG`、`EK 302 DXB PVG`、`DH EK385 DXB-HKG`。

如果某个航班的 ATC 呼号和航班号对不上（比如 UAE5MV），在日程备注里写一行 `CS UAE5MV`，实时轨迹就会按这个呼号查。

### 实际起飞 / 落地时间（免费，自动）
Apps Script 每 5 分钟用 ADS-B 信号检查一次正在进行的航班（iPad 关着也照样记录）：
- 飞机开始移动 → **滑行中**
- 第一次出现在空中 → **实际起飞时间**（按爬升率倒推，误差约 ±3 分钟）
- 回到地面 → **实际落地时间**
- 过了计划时间还没动 → **尚未起飞 · 已过计划 X 分**

局限：飞机离地前不会提前知道延误；大洋上空、偏远地区可能没有 ADS-B 信号。

### 2. 部署 Apps Script（读日历 + 查实时位置）
1. 打开 <https://script.google.com> → 新建项目。
2. 把 [`apps-script/Code.gs`](apps-script/Code.gs) 的内容整个粘贴进去。
3. 如果排班在单独的日历里：把 `CALENDAR_IDS` 改成那个日历的 ID（Google 日历 → 设置 → 该日历 → 集成日历 → 日历 ID）。
4. 上方函数选 `setup` 点「运行」，按提示授权。这一步会装上每 5 分钟的自动检查（只需要做一次）。
5. 部署 → 新建部署 → 类型「网页应用」→ 执行身份：**我**，谁可以访问：**任何人** → 部署 → 复制 `/exec` 结尾的网址。

> 安全：这个网址只会返回「标题像航班」的日程，私人日程不会出现。想再加一层保险，就在 `TOKEN` 里设一个口令，网页设置里填同样的口令。

### 3. 打开网页并设置
打开 GitHub Pages 地址 → 点一下屏幕 → ⚙︎ 设置 → 填入 Apps Script 网址 → 「测试连接」看看识别到的航班对不对 → 保存。

也可以直接把网址带进链接里（只需要一次，之后会记住）：
`https://<你的用户名>.github.io/flight-clock/?api=<Apps Script 网址>`

在 iPad 上：Safari → 分享 → 添加到主屏幕，就能全屏运行。

## 主界面月历
主界面右侧显示整月航班（类似 Google 日历的月视图）：金色 = 出发，绿色 = 回基地，蓝色底 = 驻外（标出城市），底部统计本月航段数、飞行时间、驻外天数。点 ‹ › 翻月，2 分钟后自动回到本月。手机竖屏太窄时自动隐藏。设置里可以关掉。

## 图片库背景（Unsplash，每天换）
接上 Unsplash 图片库后，背景按「城市 + 时段 + 天气」搜索（例如 *Dubai sunset*、*Guangzhou rain*、*Dubai sandstorm*），**每天换一张**，清晨、白天、傍晚、夜晚也各不相同。连不上图片库时（例如在国内）自动用下面的内置照片。

设置方法（一次，免费）：
1. 打开 <https://unsplash.com/developers> → 注册/登录 → **Your apps** → **New Application** → 勾选同意条款 → 随便起个名字（如 Flight Clock）→ 创建
2. 在应用页面往下找到 **Keys** → 复制 **Access Key**
3. 打开你的 Apps Script → 左侧 **⚙ 项目设置** → 最下面 **脚本属性** → **添加脚本属性**：属性 `UNSPLASH_KEY`，值 = 刚才复制的 Access Key → 保存
4. （如果代码是旧版）按「更新 Apps Script」的步骤换成最新代码并发布新版本

免费额度每小时 50 次搜索，时钟每个搜索词每 6 小时最多查一次，远远够用。照片作者会在点屏幕时显示（Unsplash 要求署名）。

## 背景照片（按时间和天气自动变化）

- 按当地**太阳的实际高度**分为：清晨、上午、白天、傍晚、黄昏、夜晚，自动换成对应的照片和色调。
- 按**实时天气**：晴、多云、阴、雾、雨、雷暴（会闪电）、雪、**沙尘暴/浮尘**（用空气质量数据里的沙尘浓度判断）。下雨、下雪、沙尘会有动画。
- **驻外时**左右（手机上是上下）各显示自己城市当时的画面。
- 目前有专门照片的城市：**迪拜**（清晨、白天、黄昏、夜景、沙尘、阴天、雨后）、**广州**（白天、黄昏、夜景、阴雨）。其他城市自动用维基百科上的城市照片（国内可能打不开），再不行就用渐变天空。
- 想看效果：设置 → 「背景天气预览」，或在网址后面加 `?demo=layover&wx=dust`（`wx` 可选 dust / rain / storm / fog / snow / overcast / clear，`phase` 可选 dawn / day / dusk / night）。

加一个新城市：把照片放进 `bg/`，在 `scene.js` 的 `LIB` 里按机场三字码登记，并在 `bg/credits.json` 里写上作者和授权。

### 照片来源（Wikimedia Commons）
- `dxb-dawn.jpg`：[Dubai Skyline](https://commons.wikimedia.org/w/index.php?curid=71442094)，作者 Francisco Anzola，CC BY 3.0
- `dxb-day.jpg`：[Dubai Skyline mit Burj Khalifa (18241030269)](https://commons.wikimedia.org/w/index.php?curid=82789105)，作者 Tim Reckmann from Hamm, Deutschland，CC BY 2.0
- `dxb-dusk.jpg`：[Burj Khalifa Night View 01](https://commons.wikimedia.org/w/index.php?curid=113514498)，作者 Sergei Gussev，CC BY 2.0
- `dxb-night.jpg`：[Burj Khalifa Night View 04](https://commons.wikimedia.org/w/index.php?curid=113514852)，作者 Sergei Gussev，CC BY 2.0
- `dxb-dust.jpg`：[Dubai Skyline and Burj Khalifa - 25072008](https://commons.wikimedia.org/w/index.php?curid=9107302)，作者 petter palander，CC BY 2.0
- `dxb-haze.jpg`：[Dubai Skyline 2016](https://commons.wikimedia.org/w/index.php?curid=111199602)，作者 Tonenight，CC BY-SA 4.0
- `dxb-rain.jpg`：[Dubai Marina and Sheikh Zayed Road from Saba 3 JLT after rains](https://commons.wikimedia.org/w/index.php?curid=167544618)，作者 Yourusernamewillbepublic2，CC0
- `can-day.jpg`：[Canton Tower 20220626 (cropped)](https://commons.wikimedia.org/w/index.php?curid=122654159)，作者 Tim Wu，CC BY-SA 4.0
- `can-dusk.jpg`：[20985652 Jpg](https://commons.wikimedia.org/w/index.php?curid=71411089)，作者 William Alen，CC BY 3.0
- `can-night.jpg`：[Canton Tower 2013.12.02 18-16-47](https://commons.wikimedia.org/w/index.php?curid=29979838)，作者 Zhangzhugang，CC BY-SA 3.0
- `can-rain.jpg`：[GuangzhouSkyline2020](https://commons.wikimedia.org/w/index.php?curid=89481087)，作者 Josephua，CC BY-SA 4.0

## 文件

| 文件 | 说明 |
|---|---|
| `index.html` | 整个网页（时钟、状态判断、地图、设置都在里面） |
| `scene.js` + `bg/` | 背景照片和天气动画 |
| `airports.json` | 全球约 7,900 个机场的坐标和时区（来自 [mwgg/Airports](https://github.com/mwgg/Airports)，MIT） |
| `apps-script/Code.gs` | Google Apps Script 后端 |

数据来源：天气 [Open-Meteo](https://open-meteo.com)，实时位置 [adsb.lol](https://adsb.lol) / [adsb.fi](https://adsb.fi)（经 Apps Script 转发），地图 Esri。
