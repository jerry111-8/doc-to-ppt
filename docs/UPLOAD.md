# 上传到 GitHub 并开通在线网页（不用命令行）

全程只用浏览器，大约 10 分钟。**不要把账号密码发给任何人或任何 AI。**

## 1. 新建仓库
1. 登录 github.com，点右上角 **+** → **New repository**。
2. Repository name 填 `doc-to-ppt`，选 **Public**，其他保持默认，不要勾选“Add a README”。
3. 点 **Create repository**。

## 2. 上传文件
1. 把 `doc-to-ppt.zip` 解压到电脑上。
2. 在新仓库页面点 **uploading an existing file**。
3. 打开解压出来的 `doc-to-ppt` 文件夹，**全选里面的所有文件和文件夹**（不是文件夹本身），拖进网页。
   - 以 `.` 开头的 `.github` 文件夹和 `.nojekyll` 文件在 Windows / Mac 里默认是隐藏的。看不到就先在系统里打开“显示隐藏文件”，或者第 4 步之后单独补传。
4. 页面底部写一句说明，比如 `首次上传`，点 **Commit changes**，等待上传完成。

## 3. 开通在线网页（GitHub Pages）
1. 仓库页面 → **Settings** → 左侧 **Pages**。
2. Source 选 **Deploy from a branch**；Branch 选 `main`、文件夹选 `/ (root)`，点 **Save**。
3. 等一两分钟后刷新页面，顶部会显示网址：`https://<你的用户名>.github.io/doc-to-ppt/`。
4. 把这个网址替换进 `README.md` 第 11 行。在 GitHub 网页上点文件 → 铅笔图标就能直接编辑。

## 4. 以后怎么更新
- **改一个文件**：在 GitHub 网页上点开文件 → 铅笔图标 → 修改 → Commit。
- **加一个模板**：把新的 `themes/xxx.json` 上传到 `themes/` 文件夹。上传后还要更新 `themes/themes.js`，网页才会显示新模板：可以让 Claude 帮你重新生成这个文件再上传，或者在电脑上运行 `node tools/build-themes.js`。
- **收到别人提交的模板**：Issues 里会出现“[模板] …”，确认里面没有校徽和照片后，把 JSON 存成 `themes/xxx.json`，按上一条处理。

## 5. 可选：本地运行
- 网页：直接双击 `index.html` 就能用（所有依赖都已内置，离线可用）。
- 命令行：安装 Node.js 18+，在文件夹里运行 `npm install`，然后运行 `node engine/cli.js examples/deck.example.json`。
