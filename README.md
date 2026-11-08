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

## 图片库背景（Pexels 或 Unsplash，每天换）
接上图片库后，背景按「城市 + 时段 + 天气」搜索（例如 *Dubai sunset*、*Guangzhou rain*、*Dubai sandstorm*），**每天换一张**，清晨、白天、傍晚、夜晚也各不相同。连不上图片库时（例如在国内）自动用下面的内置照片。

设置方法（一次，免费）——**Pexels 和 Unsplash 二选一**，两个都设了优先用 Pexels：

**Pexels**：已经有 Pexels API Key 的话（`clock-2` 里用过），直接在 Apps Script → ⚙ 项目设置 → 脚本属性 → 添加：属性 `PEXELS_KEY`，值 = 你的 Key。没有的话到 <https://www.pexels.com/api/> 免费申请。

**Unsplash**：
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

## 内置城市照片（简洁模式，默认）
每个城市一张白天地标照片，清晨 / 白天 / 傍晚 / 夜晚、天气（雨雪雾沙尘）和温度都在 iPad 本地用滤镜和动画处理，不依赖任何在线图片库。目前 51 个城市（加上迪拜、广州的多张照片）。加城市：照片放进 `bg/`，在 `bg/lib.json` 里登记机场三字码。

照片来源（Wikimedia Commons）：
- AKL Auckland：[Auckland Sky Tower, Auckland Harbour Bridge (20240203a) (535](https://commons.wikimedia.org/w/index.php?curid=146089272)，Takeshi Aida from Hong Kong, Hong Kong，CC BY-SA 2.0
- AMS Amsterdam：[Amsterdam canals in summer](https://commons.wikimedia.org/w/index.php?curid=27430061)，Joshua Doubek，CC BY-SA 3.0
- ATH Athens：[File:View of the Acropolis Athens 2 (pixinn.net).jpg](https://commons.wikimedia.org/w/index.php?curid=19263987)，Christophe Meneboeuf，CC BY-SA 3.0
- BAH Bahrain：[Bahrain World Trade Center (30040380192)](https://commons.wikimedia.org/w/index.php?curid=78942742)，Francisco Anzola from United States，CC BY 2.0
- BCN Barcelona：[Sagrada Familia 01](https://commons.wikimedia.org/w/index.php?curid=9029499)，Bernard Gagnon，CC BY-SA 3.0
- BKK Bangkok：[Templo Wat Arun, Bangkok, Tailandia, 2013-08-22, DD 30](https://commons.wikimedia.org/w/index.php?curid=28363641)，Diego Delso，CC BY-SA 3.0
- BLR Bangalore：[Vidhana Soudha, front (01)](https://commons.wikimedia.org/w/index.php?curid=80049628)，Moheen Reeyad，CC BY-SA 4.0
- BNE Brisbane：[Brisbane skyline and Brisbane River, February 2014](https://commons.wikimedia.org/w/index.php?curid=31800171)，MusikAnimal，CC BY-SA 3.0
- BOM Mumbai：[Gateway Of India](https://commons.wikimedia.org/w/index.php?curid=12753783)，Joe Ravi，CC BY-SA 3.0
- CAI Cairo：[The Giza Pyramids](https://commons.wikimedia.org/w/index.php?curid=35725572)，Morhaf Kamal Aljanee，CC BY-SA 3.0
- CDG Paris：[Seine and Eiffel Tower from Tour Saint Jacques 2013-08](https://commons.wikimedia.org/w/index.php?curid=27736570)，Zinneke，CC BY-SA 3.0
- CGK Jakarta：[Jakarta's skyline from pedestrian crossing](https://commons.wikimedia.org/w/index.php?curid=97179264)，Shubhi Rofiddinsa，CC BY-SA 4.0
- CMB Colombo：[Colombo skyline 2024](https://commons.wikimedia.org/w/index.php?curid=163625720)，T Chamika，CC0
- CPT Cape Town：[Cape Town Table Mountain 10](https://commons.wikimedia.org/w/index.php?curid=122423977)，Ad Meskens You are free to use this pict，CC BY-SA 4.0
- DEL Delhi：[Delhi, India, India Gate](https://commons.wikimedia.org/w/index.php?curid=103940846)，Vyacheslav Argenberg，CC BY 4.0
- DPS Bali：[Bali - Pura Tanah Lot, 20220827 1005 1141](https://commons.wikimedia.org/w/index.php?curid=124580232)，Jakub Hałun，CC BY-SA 4.0
- FCO Rome：[Rome Colosseum exterior panorama](https://commons.wikimedia.org/w/index.php?curid=97351714)，Nicholas Hartmann，CC BY-SA 4.0
- FRA Frankfurt：[Seat of the European Central Bank and Frankfurt Skyline at d](https://commons.wikimedia.org/w/index.php?curid=41624392)，DXR，CC BY-SA 4.0
- GRU Sao Paulo：[Sao Paulo Skyline Brazil](https://commons.wikimedia.org/w/index.php?curid=21402561)，Francisco Anzola，CC BY 2.0
- HAN Hanoi：[Lascar Tortoise Tower (Thap Rua) - Hoan Kiem Lake (455104682](https://commons.wikimedia.org/w/index.php?curid=31951623)，Jorge Láscar from Australia，CC BY 2.0
- HKG Hong Kong：[Aqua Luna, a Chinese Junk in Victoria Harbour (Hong Kong)](https://commons.wikimedia.org/w/index.php?curid=39754974)，Mk2010，CC BY-SA 4.0
- IAH Houston：[Panoramic Houston skyline](https://commons.wikimedia.org/w/index.php?curid=17660984)，Henry Han，CC BY-SA 3.0
- ICN Seoul：[Han River Seoul skyline Pixabay 1214950](https://commons.wikimedia.org/w/index.php?curid=83591142)，USAGI_POST，CC0
- IST Istanbul：[Turkey-1249 - Dolmabahee Mosque](https://commons.wikimedia.org/w/index.php?curid=23447397)，archer10 (Dennis)，CC BY-SA 2.0
- JED Jeddah：[Jeddah Corniche 33](https://commons.wikimedia.org/w/index.php?curid=77044796)，Tahir mq，CC BY-SA 4.0
- JFK New York：[Midtown Manhattan Skyline 004 (cropped)](https://commons.wikimedia.org/w/index.php?curid=151504894)，Kidfly182，CC BY-SA 4.0
- KHI Karachi：[DolmenCity Tower Karachi skyline from Clifton Beach](https://commons.wikimedia.org/w/index.php?curid=24964940)，Umer07，CC BY-SA 3.0
- KIX Osaka：[Osaka Castle 02bs3200](https://commons.wikimedia.org/w/index.php?curid=7745269)，663highland，CC BY 2.5
- KUL Kuala Lumpur：[Petronas Towers Legoland Malaysia](https://commons.wikimedia.org/w/index.php?curid=25657039)，milst1，CC BY-SA 2.0
- KWI Kuwait：[Kuwait City Kuwait Towers View to the al-Hamra Tower](https://commons.wikimedia.org/w/index.php?curid=148277386)，Zairon，CC BY 4.0
- LHR London：[Tower Bridge,London Getting Opened 2](https://commons.wikimedia.org/w/index.php?curid=16088292)，Mvkulkarni23，CC BY-SA 3.0
- MCT Muscat：[Sultan Qaboos Grand Mosque (1)](https://commons.wikimedia.org/w/index.php?curid=57591888)，Mostafameraji，CC BY-SA 4.0
- MEL Melbourne：[Melbourne skyline from St. Kilda](https://commons.wikimedia.org/w/index.php?curid=25611549)，lokesh，CC BY 2.0
- MIA Miami：[Miami skylines 343](https://commons.wikimedia.org/w/index.php?curid=165427771)，Wilfredor，CC0
- MLE Male：[Maldives-Vakarufalhi](https://commons.wikimedia.org/w/index.php?curid=2025259)，Civvi，CC BY-SA 3.0
- MNL Manila：[Manila Skyline March 2020](https://commons.wikimedia.org/w/index.php?curid=90051802)，Lawrence Ruiz，CC BY-SA 4.0
- MUC Munich：[Munich - Marienplatz - panoramio](https://commons.wikimedia.org/w/index.php?curid=45529129)，Jon Agüera，CC BY-SA 3.0
- MXP Milan：[Milan Cathedral from Piazza del Duomo](https://commons.wikimedia.org/w/index.php?curid=11566236)，Jiuguang Wang，CC BY-SA 3.0
- NBO Nairobi：[Nairobi skyline P1000021](https://commons.wikimedia.org/w/index.php?curid=5051746)，Lmwangi，CC BY-SA 3.0
- NRT Tokyo：[Shiodome Area from Tokyo Tower](https://commons.wikimedia.org/w/index.php?curid=1004237)，Photo by Chris 73，CC BY-SA 3.0
- ORD Chicago：[Chicago Skyline Oct 2022 2](https://commons.wikimedia.org/w/index.php?curid=124625428)，Sea Cow，CC BY-SA 4.0
- PEK Beijing：[Sunset of the Forbidden City 2006](https://commons.wikimedia.org/w/index.php?curid=890912)，User:kallgan，CC BY-SA 3.0
- PER Perth：[Perth skyline](https://commons.wikimedia.org/w/index.php?curid=5255262)，Robert Young，CC BY 2.0
- PVG Shanghai：[Lujiazui Skyline from Bund](https://commons.wikimedia.org/w/index.php?curid=4648483)，Zhang Zhang (张涨）)，CC BY-SA 3.0
- SFO San Francisco：[Golden Gate Bridge as seen from Battery East](https://commons.wikimedia.org/w/index.php?curid=60353189)，Frank Schulenburg，CC BY-SA 4.0
- SGN Ho Chi Minh City：[Ho Chi Minh City skyline (49399217481)](https://commons.wikimedia.org/w/index.php?curid=138699624)，Simon_sees，CC BY 2.0
- SIN Singapore：[ArtScience Museum, Marina Bay Sands, Singapore](https://commons.wikimedia.org/w/index.php?curid=74555821)，Basile Morin，CC BY-SA 4.0
- SYD Sydney：[Sydney Opera House Sails](https://commons.wikimedia.org/w/index.php?curid=89643)，No machine-readable author provided. Roy，CC BY-SA 3.0
- SZX Shenzhen：[Shenzhen Skyline from Futian District2](https://commons.wikimedia.org/w/index.php?curid=52048985)，Huangdan2060，CC BY 3.0
- TPE Taipei：[Taipei Skyline 2022.06.29](https://commons.wikimedia.org/w/index.php?curid=120063783)，毛貓大少爺，CC BY-SA 2.0
- YYZ Toronto：[Toronto CityPlace](https://commons.wikimedia.org/w/index.php?curid=91645384)，JasonParis，CC BY 2.0

## 文件

| 文件 | 说明 |
|---|---|
| `index.html` | 整个网页（时钟、状态判断、地图、设置都在里面） |
| `scene.js` + `bg/` | 背景照片和天气动画 |
| `airports.json` | 全球约 7,900 个机场的坐标和时区（来自 [mwgg/Airports](https://github.com/mwgg/Airports)，MIT） |
| `apps-script/Code.gs` | Google Apps Script 后端 |

数据来源：天气 [Open-Meteo](https://open-meteo.com)，实时位置 [adsb.lol](https://adsb.lol) / [adsb.fi](https://adsb.fi)（经 Apps Script 转发），地图 Esri。
