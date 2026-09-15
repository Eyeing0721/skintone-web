/**
 * skintone-web / js/copy.js
 *
 * ⚠️ 所有面向用户的文案都集中在这里。**改文案只改这个文件。**
 *
 * 为什么单独一个文件：
 *   1. 措辞由项目所有者最终决定，不接受代理代拍；集中一处才能一处定稿、全局生效。
 *   2. 其余模块只 import 常量，不许内联硬编码用户可见字符串。
 *
 * 约定：
 *   - 值可以是字符串，也可以是函数（接收动态数据，返回字符串）。
 *   - 纯技术性标识（字段名、枚举值如 `high`/`jaw`、单位 `ΔE00`、服务端返回的
 *     message/warning 原文）不算"文案"，不放在这里，以免把契约语义也变成可改项。
 *   - 页面 HTML 里需要落地的静态文案用 `data-copy="路径"` 标注，
 *     由 js/copy-hydrate.js 在启动时填充，避免同样的句子在 HTML 和 JS 里各写一份。
 */

export const COPY = {
  /* ───────── 全局 / 品牌 ───────── */
  brand: {
    name: 'skintone',
    tagline: '把肤色从玄学变成可复现的测量',
  },

  /* ───────── 页面标题与 meta ───────── */
  page: {
    indexTitle: 'skintone · 肤色测量',
    indexDescription: '用 ITA°、CIELAB 色相角与彩度把肤色深浅和底色冷暖变成可复现的测量。',
    cardTitle: 'skintone 参考卡 · A4 打印',
    calibrateTitle: 'skintone · 色卡自标定',
  },

  /* ───────── 顶栏 / 服务设置 ───────── */
  topbar: {
    stepTitles: {
      mode: '选择模式',
      capture: '采集照片',
      roi: '标注皮肤区域',
      result: '结果',
    },
    settingsLabel: '服务设置',
    settingsSummaryTitle: '服务设置',
  },

  settings: {
    baseLabel: '服务基地址',
    basePlaceholder: 'https://…',
    keyLabel: '访问密钥（X-API-Key）',
    keyPlaceholder: '向服务提供者索取',
    save: '保存',
    test: '测试连接',
    reset: '恢复默认',
    checking: '检查服务…',
    savedToast: (base) => `服务地址已保存：${base}`,
    resetToast: '已恢复 config.js 里的默认地址。',
    keySavedToast: '密钥已保存到本机浏览器。',
    needScheme: '地址要以 http:// 或 https:// 开头。',
    connected: (h) =>
      `已连接 · 服务 v${h.version ?? '?'} · spec ${h.specVersion ?? '?'} · ${h.authRequired ? '需要访问密钥' : '免密钥'}${
        Array.isArray(h.cards) && h.cards.length ? ` · 色卡 ${h.cards.join('/')}` : ''
      }`,
    unreachable: (base) => `连不上（${base}）`,
    /** 后端启用密钥但本机还没填时的追加说明（措辞待定稿） */
    authRequiredNotice: ' —— 该服务需要访问密钥，请向服务提供者索取后填入「服务设置」。',
    specMismatchToast: (serverSpec, clientSpec) =>
      `注意：服务端 specVersion=${serverSpec}，本前端对齐 ${clientSpec}，字段含义可能不一致。`,
    /** 设置面板里的说明段落 */
    keyNote:
      '这个后端需要访问密钥：没有它，除 GET /v1/health 以外的请求都会返回 401。密钥只存在你自己浏览器的 localStorage 里，除了发给上面这个地址之外不会去任何地方。',
    priorityNote:
      '优先级：?api= 查询参数 > localStorage.skintone.apiBase > js/config.js 的默认值。',
    selfHostNote:
      '自己在本机跑后端时把地址改成 http://127.0.0.1:8000；手机访问时别写 localhost——那指的是手机自己。',
  },

  /* ───────── 四步流程导航 ───────── */
  nav: {
    next: { mode: '下一步：采集', capture: '下一步：标注', roi: '开始分析', result: '再来一张' },
    back: '上一步',
    busyAnalyzing: '服务端正在做色彩学计算…',
    busyWorking: '处理中…',
    analyzePending: '已上传，等待服务端结果…',
  },

  /* ───────── 第 1 步：模式选择 ───────── */
  /** 光源先验的中文标签（取值见 config.js 的 ILLUMINANT_VALUES） */
  illuminantLabels: {
    daylight: '日光 / 窗边自然光',
    shade: '阴影 / 阴天',
    tungsten: '白炽灯 / 暖黄灯',
    fluorescent: '荧光灯 / 日光灯',
    led: 'LED 灯',
    unknown: '不确定',
  },

  modeStep: {
    title: '先选一条路线',
    lead: '两条路线用同一套后端与同一套色彩学约定。',
    nocard: {
      badge: '中精度',
      label: '三步出结果',
      sub: '不需要打印任何东西',
      desc: '用眼白与背景估计光源，沿日光轨迹做一维校正。必须给置信区间。',
    },
    card: {
      badge: '高精度',
      label: '比色卡模式',
      sub: '需要一张 A4 参考卡',
      desc: 'ArUco 定位 + 最小二乘 CCM，用 ΔE00 门禁自证。',
    },
    hintCard: '需要先打印参考卡。拍摄时把卡平放在脸旁同一光照下，四个黑色方框完整入镜。',
    hintNoCard: '不需要任何道具。结果会带置信区间；置信度不足时会明确给出下一步建议。',
    cardProfileLabel: '色卡标定档案 ID（可选）',
    cardProfilePlaceholder: 'my-card-001',
    linksLabel: '没标定过就留空。',
    cardLink: '打印参考卡',
    calibrateLink: '色卡自标定',
    illuminantLabel: '这张照片的光源（用作无卡路线的一维先验）',
    finePrint:
      '测量的是：深浅（ITA°）· 底色冷暖（CIELAB 色相角 h_ab、a*/b*、彩度 C*）· 表面状态（高光与红斑），三轴互相独立。',
  },

  /* ───────── 第 2 步：采集 ───────── */
  captureStep: {
    emptyHint: '还没图。用摄像头拍一张，或从相册 / 文件里选。',
    shutter: '拍下',
    flip: '翻转镜头',
    closeCamera: '关闭摄像头',
    openCamera: '打开摄像头',
    chooseFile: '选择图片',
    guideToggle: '拍摄要点',
    guideTitle: '怎么拍才测得准',
    guideItems: [
      '自然光下，脸朝窗户，别站在顶灯正下方（混光最难校正）。',
      '关掉美颜、滤镜、HDR。',
      '素颜，或至少下颌与颈部没有妆；刚运动完、刚洗脸后等一会儿。',
      '原图直传：前端只压尺寸并重新编码，不裁剪。',
    ],
    cameraInfo: (w, h) => (w && h ? `${w}×${h}` : ''),
    cameraUnsupported: '这个浏览器不给摄像头权限（file:// 下常见）。用手动选图吧。',
    shutterTooEarly: '摄像头还没有出画，等一秒再按快门。',
    capturedToast: '已拍下。下一步标注皮肤区域。',
    closedCameraToast: '已关闭摄像头。',
    fileReadToast: '图片已读入，下一步标注。',
    fileReadCalibrateToast: '图片已读入。',
    badFileToast: '只接受 JPEG / PNG。',
    decodeFailed: '这张图片浏览器解不开（可能不是 JPEG/PNG，或文件损坏）。',
    info: (p) =>
      [
        `归一幅面 ${p.width}×${p.height}（原图 ${p.originalWidth}×${p.originalHeight}）`,
        p.scaled ? '已等比缩小，未裁剪' : '未缩放',
        `JPEG q=${p.quality} · ${p.bytesText}`,
      ].join(' ｜ '),
    tooLargeToast: (size, limit) => `归一化后仍有 ${size}，超过服务端默认上限 ${limit}，可能会被拒收。`,
    encodingFailed: '图片编码失败（canvas.toBlob 返回空）。',
    canvasUnsupported: '当前环境不支持图片解码。',
    noSourceSize: '图片尺寸读不出来。',
  },

  /* ───────── 上传同意（措辞与默认值待定稿） ───────── */
  consent: {
    /** 默认是否勾选"同意上传原图"。机制已按契约实现，取值由项目所有者最终决定。 */
    defaultStoreImage: true,
    labelStrong: '同意上传这张原图',
    labelSuffix: '（可取消）',
    /** storeImage = true 时的说明 */
    onStore: '服务端会把原图归档到它自己机器的磁盘（默认保留 30 天），你可以随时用 DELETE /v1/result/{id} 删除。',
    /** storeImage = false 时的说明 */
    offMemoryOnly: '原图只在服务端内存中处理，不落盘；只保留去标识化后的结果。',
    privacyNote:
      '图片只发到你填的这个地址。若你走 Cloudflare 隧道，隧道服务商会看到流量元数据（不是图片内容）。',
  },

  /* ───────── 第 3 步：ROI ───────── */
  roiStep: {
    /** 三个 ROI 区域的显示名与提示（key 与 config.js 的 ROI_REGIONS 对齐） */
    regions: {
      jaw: { label: '下颌', hint: '沿下颌线画一小块平滑皮肤，避开嘴唇与痘印' },
      neck: { label: '颈部', hint: '画颈侧一小块，避开衣领阴影' },
      'gray-card': { label: '色卡（可选）', hint: '圈住参考卡中的任一灰色块，用于交叉校验' },
    },
    undo: '撤销一点',
    clearRegion: (label) => `清空${label}`,
    clearAll: '全部清空',
    skip: '跳过，由服务端自动识别',
    skipToast: '已跳过标注：服务端会兜底自动识别 ROI（置信度可能更低）。',
    clearedToast: '已清空所有标注。',
    nothingToUndo: '这个区域还没有点。',
    nothingToClear: '这个区域还没有点。',
    interactionHint: '点选加点 · 拖动顶点微调 · 至少要 3 个点',
    statusComplete: '下颌与颈部都已标注，可以开始分析。',
    statusTodo: '下颌与颈部各至少 3 个点；也可以直接跳过，让服务端自动识别。',
    /** 画布下方针对当前区域的提示，{label}/{hint} 由 ROI 定义提供 */
    regionHint: (label, hint, count, closed) =>
      `${label}：${hint}${closed ? '（已闭合，可以继续拖动顶点微调）' : `（已点 ${count} 个点，至少 3 个才成面）`}`,
  },

  /* ───────── 第 4 步：结果 ───────── */
  resultStep: {
    loadPlaceholder: '按 requestId 取回存档结果',
    loadButton: '取回',
    loadOkToast: '已取回存档结果（不含原图）。',
    needIdToast: '先填 requestId。',
    deleteButton: '删除这次记录',
    deleteConfirm: '删除这次记录？服务端会同时删掉元数据与归档原图，无法恢复。',
    deletedToast: '已删除。',
    deletedLabel: '已删除',
    needImageToast: '先拍一张或选一张图。',
    errorTitle: '这次没测成',
    renderFailedTitle: '结果渲染失败',
    renderFailedMessage: (message) => `结果渲染失败：${message}`,
    renderFailedHint:
      '数据已经拿到（requestId 见控制台），只是前端画不出来。属于前端 bug，请把控制台报错一并反馈。',
    insufficientToast: '置信度不足，服务端拒绝给结论——请看页面上的物理试色指引。',
    physicalFallbackFootnote: '',
  },

  result: {
    itaLabel: 'ITA° 肤色深浅角',
    undertoneLabel: '底色',
    hueLabel: '色相角 h_ab',
    chromaLabel: '彩度 C*',
    depthRanges: {
      'very-light': '> 55',
      light: '41 ~ 55',
      intermediate: '28 ~ 41',
      tan: '10 ~ 28',
      brown: '-30 ~ 10',
      dark: '≤ -30',
    },
    depthLabels: {
      'very-light': '极浅',
      light: '浅',
      intermediate: '中等',
      tan: '小麦 / 浅棕',
      brown: '棕',
      dark: '深',
    },
    undertoneLabels: {
      cool: '冷调',
      'neutral-cool': '中性偏冷',
      neutral: '中性',
      'neutral-warm': '中性偏暖',
      warm: '暖调',
      olive: '橄榄调',
    },
    undertoneProbKeys: [
      { key: 'cool', label: '冷' },
      { key: 'neutral', label: '中性' },
      { key: 'warm', label: '暖' },
      { key: 'olive', label: '橄榄' },
    ],
    confidenceLevels: {
      high: { label: '高', tone: 'ok' },
      medium: { label: '中', tone: 'warn' },
      low: { label: '低', tone: 'warn' },
      insufficient: { label: '不足', tone: 'bad' },
    },
    gateLabels: {
      ccm_delta_e: '色卡标定残差',
      clipping: '截断像素占比',
      specular: '高光像素占比',
      roi_area: '有效皮肤像素数',
      roi_dispersion: 'ROI 色差离散度',
    },
    cards: {
      confidence: '置信度',
      undertone: '底色冷暖',
      undertoneSub: 'a*/b* 比值与色相角',
      lab: 'CIELAB 三轴（D65 / 2°）',
      labSub: '契约 §4 约定',
      labAxes: { L: 'L* 明度', a: 'a* 红绿', b: 'b* 黄蓝' },
      advice: '穿搭配色',
      illuminant: '光源与标定',
      warnings: '提示',
      meta: '这次测量',
      allGatesPassed: '全部门禁通过。',
      gatesSummary: (n) => `门禁逐条明细（${n} 项）`,
      noGates: '服务端未返回门禁数据',
      yesNo: { yes: '是', no: '否' },
      noPalette: '服务端未返回推荐色。',
      noAvoid: '服务端未返回避雷色。',
      gateFailed: (label, value, dir, threshold, message) =>
        `${label} 未达标：实测 ${value}，要求 ${dir} ${threshold}${message ? ` —— ${message}` : ''}`,
      contrastLevels: { high: '高对比', medium: '中对比', low: '低对比' },
      recommended: '推荐色',
      avoid: '避雷色',
      labPreviewNote:
        '色块是前端按 sRGB↔CIELAB 换算的屏幕预览，仅供直觉参考；判定请以服务端数值为准。',
      adviceRuleNote:
        '配色规则来自契约 §6：色相与 h_ab 保持 25°–60° 和谐偏移、C* 比值落在 [0.8, 1.6]、明度形成目标对比。不使用四季色彩之类的标签。',
      labPreviewSub: '（前端换算）',
      fields: {
        requestId: 'requestId',
        mode: 'mode',
        time: '时间',
        serverVersion: 'serverVersion',
        specVersion: 'specVersion',
        pixels: '有效皮肤像素',
        regions: '参与区域',
        linearRgb: 'linearRgb（线性、未编码、0–1）',
        method: '光源估计方法',
        cct: 'CCT',
        duv: 'Duv',
        xy: 'xy',
        adaptation: '色适应',
        assumedD65: '是否假定 D65',
        melanin: '黑色素指数',
        hemoglobin: '血红素指数',
        ccmSummary: (kind, mean, max) => `色卡标定残差（${kind} · 均值 ΔE00 ${mean} · 最大 ${max}）`,
        patchId: '色块',
        deltaE: 'ΔE00',
      },
      yesNo: { yes: '是', no: '否' },
      deleteNote: '同时删除元数据与归档原图。',
      specMismatch: (serverSpec, clientSpec) =>
        `服务端 specVersion 是 ${serverSpec}，本前端对齐的是 ${clientSpec}。字段含义可能已经漂移，建议先把两边版本对齐再看结论。`,
    },
    /** 默认 disclaimer 兜底文案（服务端没给时显示） */
    disclaimerFallback: '本结果基于单张照片的相机响应估计，不能替代分光测色仪或专业色彩顾问。',
  },

  /* ───────── 置信度不足 → 物理试色引导（说法待定稿） ───────── */
  physicalTest: {
    title: '这次测不准，建议做物理试色',
    lead: (levelLabel) =>
      `这次测量的置信度是 ${levelLabel}，服务端按契约拒绝给结论。数字不可靠时，用眼睛比对比色更可靠。`,
    steps: [
      '取三条深浅相邻的粉底，比你以为的色号再深一档和浅一档各一条。',
      '在自然光下，把三条并排涂在下颌线上，每条之间留一点空隙。',
      '等 10 分钟，让粉底与皮脂融合（刚涂上去的颜色不准）。',
      '站到窗边自然光下照镜子，看哪一条的边界「消失」——那一条就是你的色号。',
    ],
    footnote: '单张照片无法区分「皮肤本身」与「相机白平衡」，这时候仪器的数字不如你的眼睛可靠。',
    serverNotesTitle: '服务端说明',
  },

  /* ───────── 错误提示（契约错误码 → 可操作中文） ───────── */
  errors: {
    BAD_IMAGE: {
      message: '这张图读不出来，或者格式不支持。',
      hint: '换一张 JPEG / PNG；先另存为 JPEG 再传。',
    },
    CARD_NOT_DETECTED: {
      message: '在人脸旁没找到参考卡。',
      hint: '把卡平放，让四个黑色方框完整入镜且不反光——卡可以斜一点，但四个角都要在画面里。',
    },
    CARD_PROFILE_NOT_FOUND: {
      message: '找不到这份色卡标定档案。',
      hint: '先去「色卡自标定」生成档案，或把档案 ID 清空改用默认配置。',
    },
    ROI_TOO_SMALL: {
      message: '标注的区域太小，凑不出足够的皮肤像素。',
      hint: '回到标注步把多边形画大一点，或直接跳过让服务端自动识别。',
    },
    FACE_NOT_FOUND: {
      message: '画面里没找到人脸。',
      hint: '重拍一张：正对镜头、脸占画面足够大、光线均匀不要逆光。',
    },
    ILLUMINANT_UNRELIABLE: {
      message: '光源判断不可靠，色彩校正没法收敛。',
      hint: '换到窗边自然光下重拍，关掉顶灯避免混光，并把光源类型选对。',
    },
    PAYLOAD_TOO_LARGE: {
      message: '图片太大，服务端拒收了。',
      hint: '重新选一张更小的图；前端默认已把长边压到 4096 以内。',
    },
    UNAUTHORIZED: {
      message: '密钥不对或已失效。',
      hint: '打开「服务设置」重新填入访问密钥，注意别把首尾空格一起粘进去。',
    },
    RATE_LIMITED: {
      message: '请求太频繁，被限流了。',
      hint: '等一分钟再试。',
    },
    INTERNAL: {
      message: '服务端出错了。',
      hint: '稍后重试；如果是自己跑的后端，看一下服务端控制台的报错。',
    },
    /** 前端补充码 */
    MISSING_API_KEY: {
      message: '该服务需要访问密钥，请向服务提供者索取后填入。',
      hint: '打开「服务设置」，把密钥粘进「访问密钥」输入框；它只存在你自己的浏览器里。',
    },
    NETWORK_UNREACHABLE: {
      message: '连不上服务端。',
      hint: '确认后端已启动，并检查「服务设置」里的地址；手机和电脑要在同一个网络里，地址别写 localhost。',
    },
    TIMEOUT: {
      message: '服务端太久没响应。',
      hint: '图片大或机器慢时会这样。先重试；仍然超时就把地址换成局域网直连。',
    },
    INVALID_JSON: {
      message: '服务端返回的不是合法 JSON。',
      hint: '多半是地址填错了，页面拿到的是 HTML。检查「服务设置」里的基地址。',
    },
    BAD_REQUEST: {
      message: '请求被拒绝了。',
      hint: '检查服务地址与访问密钥；如果刚升级过前后端，确认两边 specVersion 一致。',
    },
    NOT_FOUND: {
      message: '服务端没有这个接口。',
      hint: '地址可能指向了另一个服务，或后端版本太旧。',
    },
    ABORTED: { message: '请求已取消。', hint: '' },
    httpFallback: (status) => `请求失败（HTTP ${status}）`,
  },

  /* ───────── card.html ───────── */
  cardPage: {
    title: '打印参考卡',
    loading: '正在读取规格…',
    fromServer: (specVersion) => `规格来自后端，specVersion ${specVersion}。`,
    fromFallback: (why) => `后端没连上（${why}）——已改用内置兜底副本，内容与契约一致。`,
    sourceLabel: '规格来源',
    sourceServer: (base, cardId) => `GET ${base}/v1/card/${cardId}`,
    sourceFallback: '内置兜底副本（后端未就绪）',
    print: '打印',
    download: '下载 PNG',
    backToMeasure: '回到测量',
    toCalibrate: '色卡自标定',
    steps: [
      '打印对话框：纸张 A4、缩放 100% / 无、边距 无。Chrome 默认的「适应页面」要取消。',
      '打开「背景图形」，否则色块会印成白的。',
      '打印后量一下：左右两个标记中心间距必须是 160 mm。差得多说明被缩放了。',
      '用哑光纸。光面纸反光会让标记和色块都测不准。',
    ],
    specFields: {
      cardId: 'cardId',
      specVersion: 'specVersion',
      paper: '纸张',
      resolution: '渲染分辨率',
      aruco: 'ArUco',
      markerCenters: '标记中心',
      patches: '色块',
      paperValue: (p) => `${p.widthMm} × ${p.heightMm} mm（${p.name}，规范 ${p.dpi} DPI）`,
      resolutionValue: (w, h, pxPerMm) => `${w} × ${h} px（${pxPerMm} px/mm）`,
      arucoValue: (m) => `${m.dictionary} · id ${m.ids.join('/')} · ${m.sizeMm} mm`,
      patchValue: (total, byKind) => `${total} 块（${byKind}）`,
    },
    specProblem: (problems) => `规格自检不通过：${problems.join('；')}`,
    renderFailed: (message) => `渲染失败：${message}`,
    downloadFailed: (message) => `导出 PNG 失败：${message}`,
    canvasLabel: 'skintone A4 参考卡',
    specSourceNote:
      '规格来源：优先 GET /v1/card/{cardId}（避免前后端色块值漂移）；后端没起来时用 js/config.js 的兜底副本。用的是哪一份、specVersion 是多少，都写在上面。',
    serverNote:
      '本页要用本地静态服务器或 GitHub Pages 打开；file:// 下 fetch 会被浏览器按跨源拦掉，此时自动走兜底副本，卡片照样能打。',
  },

  /* ───────── calibrate.html ───────── */
  calibratePage: {
    title: '色卡自标定',
    tagline: '把自己印出来的那张纸量一遍',
    back: '回到测量',
    intro:
      '家用打印机印出来的颜色跟屏幕上的不一样。这一步让你在自家日光下拍一张卡，让服务端反推这张纸实际印出来的颜色，得到一份档案 ID，之后测量时带上它就行。',
    step1: '1 · 参数',
    step2: '2 · 拍一张卡',
    step3: '3 · 标定',
    cardIdLabel: '色卡 ID',
    profileLabel: '档案 ID（自己取，之后要用到）',
    profilePlaceholder: 'my-card-001',
    illuminantLabel: '拍摄时的光源',
    printFirst: '没打印过卡？先去打印参考卡（A4，100% 缩放，哑光纸）。',
    printFirstLink: '打印参考卡',
    captureHint: '整张卡平放入镜、四个黑框完整、不反光。斜一点没关系，四个角都要在。',
    calibrateButton: '开始标定',
    uploadNote: '上传前同样只做尺寸上限与 JPEG 编码，不裁剪。',
    calibrating: '标定中…',
    pending: '已上传，等待服务端检测标记并解算…',
    needImageToast: '先拍一张或选一张卡的照片。',
    needProfileToast: '档案 ID 不能空——之后要用它来引用这份标定。',
    capturedToast: '已拍下，可以标定了。',
    resultTitle: '标定完成',
    grayPassed: '灰阶中性 通过',
    grayFailed: '灰阶中性 未通过',
    errorTitle: '标定没成功',
    fields: {
      profileId: 'profileId',
      cardId: 'cardId',
      quality: '质量',
      maxChroma: '灰阶最大 |C*|',
      patchId: '色块',
      measured: '实测 sRGB',
      hex: 'hex',
      noMeasured: '服务端未返回 measuredSrgb',
    },
    afterNote: (profileId) => `这份档案已存在服务端（profileId = ${profileId}）。回到测量页，在「比色卡模式」里填上它。`,
    targetLabel: (base, hasKey) => `当前目标：${base}${hasKey ? '' : '（还没填访问密钥）'}`,
  },

  /* ───────── 参考卡上的印刷文字（会被画进 canvas，属卡面内容） ───────── */
  cardCanvas: {
    title: 'skintone 肤色参考卡',
    scaleWarning: '打印必须 100% 缩放，关闭「适应页面」',
    footerTitle: '打印与使用',
    measureNote: '量一下：左右两标记中心间距 160 mm',
    geometryNote: '色块几何：灰阶条 26 mm，色彩块 22 mm',
  },

  /* ───────── 通用 ───────── */
  common: {
    emptyValue: '—',
    yes: '是',
    no: '否',
    confirm: '确定',
  },
};

/** 便捷取值：`t('settings.save')`，路径不存在时返回路径本身（便于发现漏配）。 */
export function t(path) {
  return path.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), COPY) ?? path;
}

export default COPY;
