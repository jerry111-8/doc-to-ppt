---
name: doc-to-ppt
description: Use when turning a document (paper, proposal, report, course essay) into a Chinese presentation .pptx, or when reviewing and fixing an existing deck's logic, facts and speaker notes. Guides the user with clickable options, sets a storyline first, writes deck.json for the doc-to-ppt engine, and has an independent agent fact-check before delivery.
---

# doc-to-ppt（Claude 交互版）

这个技能和 doc-to-ppt 仓库配套。仓库里的 `engine/` 负责排版与导出，`themes/` 是风格库，`index.html` 是可视化配置器。Claude 只做三件事：**问清楚、写内容（deck.json）、找独立 agent 审查**。排版一律交给引擎，所以 Claude 做出来的 PPT 和网页里导出的完全一致。

## 准备
- 仓库路径记为 `$REPO`。没有仓库时，先 `git clone https://github.com/jerry111-8/doc-to-ppt`，再在仓库目录运行 `npm install`（会安装 pptxgenjs、jszip、sharp）。
- 生成命令：`node $REPO/engine/cli.js deck.json style.json out.pptx`。第二个参数也可以直接写主题名，如 `blue-orange-3d`。
- 版式和字段说明以 `$REPO/prompts/universal.md` 为准（由引擎自动生成）。写 deck.json 之前先读它。

## 交互原则
- 能用选项问的，就用 AskUserQuestion 给选项（每轮最多 4 题、每题 2–4 个选项，推荐项放第一个并标“（推荐）”）；不要让用户自己打字描述。
- 能给用户看的，先出预览：用 `engine/cli.js` 生成样张，再用 LibreOffice 渲染成图片（或让用户打开 `index.html` 的“模板库 / 配置风格”）。
- 用户说“全部按推荐”“我没时间”，或者人不在场时，跳过剩下的提问，全部按推荐值做，交付时写明用了哪些默认值。
- 自己做的东西不自己验收：事实和逻辑交给独立 agent 核查。

## 入口
- 用户给的是文档，要做新 PPT → 阶段 0–6。
- 用户给的是做好的 .pptx，要“检查 / 改逻辑 / 去 AI 味 / 重写讲稿” → 模式 R。
- 用户给了网页导出的 `style.json` → 跳过阶段 2–3，直接用它。

## 阶段 0：读文档、定主线
1. 读文档，提炼主题、章节、核心结论、可用的数据和图表。留意版本：是工作论文还是发表版。
2. 写主线：一句话（大家以为什么 → 本文发现什么 → 我最放心 / 最不放心的是什么），再列一张“章 | 记住的一句话 | 过渡句”的表。研究问题和最后的答案要一一对应，答案照原文说。
3. 用 SendUserMessage 发出主线，再问一题（header: 主线）：按这个主线（推荐）· 调整重点 · 我自己写一句。

## 阶段 1：用途（一轮问完）
用途（文献汇报 / 开题答辩 / 课程报告 / 工作汇报）· 时长（15 分钟左右，推荐）· 风格来源（选内置风格（推荐）/ 上传喜欢的 PPT 学习 / 上传并和内置风格结合）· 图片（先放占位框（推荐）/ 我会提供 / 尽量不用照片）。

## 阶段 2：风格
- **内置风格**：读 `$REPO/themes/*.json`。用本文档的标题和第一章内容，给每种风格生成封面和框架页，拼成对比图发给用户，再问选哪一套、要不要混搭。混搭时用 `{"base": 主题名, "use": {"palette": 另一主题名, "card": 另一主题名}, "override": {}}`，引擎会用 `resolveStyle` 合并。
- **学习上传的 PPT**：解压 .pptx，统计 `ppt/slides/*.xml` 里的 srgbClr 填充色、字体、字号、outerShdw / reflection / gradFill 次数和 prstGeom 形状，整理成“风格卡”，每项标注来自第几页。然后把它写成一份 theme JSON（字段同 `themes/*.json`）。上传的模板只决定配色、页眉页脚和卡片；版式仍从引擎的版式库里选。校徽、照片、截图不进入成品，也不进入 theme JSON。
- 模板里出现主色和强调色以外的颜色（比如红色）时，先问用户是否保留。

## 阶段 3：组件（先发组件样张，再分两轮问）
- 3a：卡片（白卡 + 柔和投影 / 较强投影 / 扁平浅底 / 只描边）· 标题框（实心直角 / 实心圆角 / 浅底主色字 / 只有下划线）· 编号（实心圆 / 方块 / 圈码 / 不用）· 图标（实心圆底 / 线性 / 尽量不用）。
- 3b：强调（强调色加粗 / 主色加粗 / 浅色底高亮 / 只加粗）· 动画（按讲稿语速自动出现——学术汇报推荐 / 标准：重点处点击 / 精简 / 不要）· 导航与页脚 · 字体。
- 选项值对应 style.json 里的 card、titleBox、number、icon、emphasis、animation、nav、footer、fonts 字段（取值见 `engine/doc2ppt.js` 里的 OPTIONS）。阶段 2 已定的项不再问。

## 阶段 4：分镜
列出分镜表：页码 | 页标题 | 阅读重点 | 版式 id | 时长。自查三件事：没有连续两页用同一种版式；不为主线服务的页已删去或合并；时长按重点分配。然后问（header: 分镜）：按这个做（推荐）· 调整页数或顺序 · 换某几页的版式。

## 阶段 5：写 deck.json → 生成 → 独立审查 → 交付
1. 按 `prompts/universal.md` 的格式和规则写 deck.json，包括讲稿 notes。讲稿用第一人称口语；每页第一句接上一页；每章至少一句自己的看法；按每分钟约 250 字估算总时长。
2. 运行 `engine/cli.js` 生成 .pptx，渲染成图片逐页检查：文字溢出、元素重叠、每页强调不超过 2 处、表格完整。
3. **独立审查**：用 Agent 工具在后台启动一个没参与制作的 agent。给它原文路径、deck.json 和 `prompts/review.md`，让它按九项清单核查，输出“页 | 原表述 | 判定 | 依据 | 改法”表。等结果回来再改；改动以原文为准。
4. 修改 deck.json，重新生成，运行 pptx 技能的 validate.py。
5. 交付时写明：主线；所用风格和组件；审查修正了几处、最重要的三处；仍需用户确认的地方；讲稿估算时长；预览的局限（字体会被替换，动画要在 PowerPoint 里放映才能看到）。同时附上 deck.json 和 style.json，用户以后可以在网页里自己改字、重新导出。
6. 最后问（header: 下一步）：满意 · 调整配色或组件 · 调整某几页 · 把这套风格存进模板库。

## 阶段 6：存新风格
把风格写成 `themes/<name>.json`（name、label、description、tags、palette、fonts 以及各组件字段），运行 `node tools/build-themes.js` 更新索引。要公开收录时，让用户在 GitHub 上提交 Pull Request，或者用仓库的“提交模板”Issue 表单。只提交规格，不提交参考 PPT 本身、校徽或照片。

## 模式 R：审查并修改已有的 PPT
1. 导出每页文字和讲稿（pptx 技能的 slide_text.py），渲染缩略图通看一遍；没有原文时先请用户上传。
2. 写主线（同阶段 0）。用户说没时间时，不等确认，发出主线后继续。
3. 后台启动独立审查 agent（同阶段 5 第 3 步）。同时按主线重写全部讲稿初稿。
4. 结果回来后用 python-pptx 修改：
   - 文字在段落内替换，跨 run 时把整段写进第一个 run；
   - 标签类文字的强调色改回主色或灰色，口号句改成平实的陈述；
   - 用 notes_slide 整页替换讲稿；
   - 不动版式和动画。
   改完渲染检查，运行 validate.py，另存为新文件。
5. 交付时写明：主线、修正了哪几类问题、底稿版本问题、讲稿估算时长。如果版式本身有问题，建议把内容转成 deck.json，用网页重新排。
