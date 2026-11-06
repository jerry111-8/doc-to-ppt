# 参与贡献

## 新增一个模板（风格）
1. 打开网页 → “配置风格”，调好后点“下载 style.json”。
2. 把文件改名为 `themes/<英文短名>.json`，补上 `label`（中文名）、`description`（一两句特点）、`tags`（适合场景）。
3. 运行 `node tools/build-themes.js`，更新 `themes/themes.js` 和 `themes/index.json`。
4. 提交 Pull Request。不方便用 Git 的话，也可以在 Issues 里选“提交新模板”，把 JSON 粘贴进去。

模板字段：

| 字段 | 取值 |
|---|---|
| palette | primary 主色、dark 深色、accent 强调色、pale / pale2 / mid 浅色、text、muted、gray、warm / warmEdge（结论条）、line |
| fonts | head、body |
| header | slash 斜杠色块 · line 细线 |
| footer | bar 页脚条 · min 极简 · none |
| nav | true / false |
| card | soft · strong · flat · outline |
| titleBox | solid · round · pale · underline |
| number | circle · square · code · none |
| icon | dot · line · none |
| emphasis | accent · primary · highlight · bold |
| animation | speech 按讲稿语速 · standard · simple · none |

配色规则：全篇一种主色，每页最多再加两种辅助色（主色的浅色或强调色）；深色只用于文字和小面积；渐变只用来表达等级，不当装饰。

## 新增一个版式
版式写在 `engine/doc2ppt.js` 的 `L({...})` 里，每个版式包含 id、name、use（用途）、fields（字段说明）、sample（示例）和 render（绘制函数）。绘制函数只能用 Ctx 提供的方法（rect / shape / text / icon / chart / table / card / head / num …），这样网页预览和 .pptx 导出会自动一致。加完版式后：
1. 运行 `node tools/build-prompts.js`，更新给 AI 的提示词；
2. 运行 `npm run build`，再用 PowerPoint 打开 `examples/example.pptx` 检查效果。

## 不要提交的东西
- 学校校徽、单位标志、他人照片、别人 PPT 的截图或原文件；
- 带真实个人信息的 deck.json。
